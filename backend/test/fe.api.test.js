'use strict';

// API tests for /api/fe (Financed Emissions module).
// Needs a database: DATABASE_URL=postgresql://… node --test test/fe.api.test.js
// (skipped when DATABASE_URL is not set).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const skip = !process.env.DATABASE_URL && 'DATABASE_URL not set';

let prisma; let server; let base;
const tokens = {};
const companies = {};
const users = {};

async function call(who, method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

async function send(who, path, fields, file, fileName) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields || {})) fd.append(k, v);
  if (file != null) fd.append('file', new Blob([file]), fileName);
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[who]}` }, body: fd });
  return { status: res.status, body: await res.json() };
}

async function raw(who, path) {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${tokens[who]}` } });
  return { status: res.status, type: res.headers.get('content-type'), buf: Buffer.from(await res.arrayBuffer()) };
}

before(async () => {
  if (skip) return;
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const config = require('../src/config');
  prisma = require('../src/config/prisma');

  const app = express();
  app.use(express.json());
  app.use('/api/fe', require('../src/routes/financedEmissions'));
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;

  const stamp = Date.now();
  for (const key of ['a', 'b', 'nofe']) {
    const company = await prisma.company.create({ data: { name: `FE test ${key} ${stamp}`, country: 'AM', industry: 'Banking', companySize: '1-50', tier: 'PROFESSIONAL' } });
    if (key !== 'nofe') await prisma.companyModule.create({ data: { companyId: company.id, module: 'financed_emissions', enabled: true } });
    companies[key] = company;
  }
  for (const [key, companyKey, role] of [['a', 'a', 'ADMIN'], ['preparer', 'a', 'CUSTOM'], ['b', 'b', 'ADMIN'], ['nofe', 'nofe', 'ADMIN']]) {
    const user = await prisma.user.create({
      data: { email: `fe-${key}-${stamp}@test.local`, passwordHash: 'x', firstName: 'T', lastName: key, role, isActive: true, emailVerified: true, companyId: companies[companyKey].id },
    });
    users[key] = user;
    tokens[key] = jwt.sign({ userId: user.id }, config.jwt.secret, { expiresIn: '1h' });
  }
});

after(async () => {
  if (skip) return;
  server.close();
  const companyIds = Object.values(companies).map((c) => c.id);
  await prisma.activityLog.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.$disconnect();
});

const FACTORS_CSV = [
  'kind,key,region,currency,unit,value,scope1Share,notes',
  'revenue_sector,55.10,AM,AMD,,0.4,0.5,test only',
  'revenue_sector,G,,AMD,,0.2,,test only',
  'asset_sector,C,,AMD,,0.6,,test only',
  'asset_sector,mortgages,,AMD,,0.05,,test only',
  'building_benchmark,residential,AM,,,150,,test only',
  'energy_label,C,AM,,,120,,test only',
  'grid,AM,AM,,,0.2,0,test only',
].join('\n');

const BL_CSV = [
  'facilityRef,counterpartyId,counterpartyName,outstanding,undrawn,currency,branch,segment,country,naceCode,localSectorCode,revenue,equityPlusDebt',
  'BL-1,CL-1,Hotel One,90000000,10000000,AMD,Centre,SME,AM,55.10,,850000000,500000000',
  'BL-2,CL-2,,40000000,,AMD,Gyumri,SME,AM,10.71,,,300000000',
  'BL-3,CL-3,,15000000,,AMD,Gyumri,SME,AM,41.20,,60000000,',
  'BL-4,CL-4,,12000000,,AMD,Centre,SME,AM,,LOC-9,,50000000',
  'BL-5,CL-5,,-1,,AMD,Centre,SME,AM,55.10,,,1',
  'BL-1,CL-9,,1,,AMD,Centre,SME,AM,55.10,,,1',
  'BL-6,,,1000,,AMD,Centre,SME,AM,ZZ,,,1',
].join('\n');

function mortgageXlsx() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['facilityRef', 'outstanding', 'currency', 'originationDate', 'valueAtOrigination', 'propertyType', 'floorAreaM2', 'energyLabel', 'country', 'branch', 'segment'],
    ['M-1', 25000000, 'AMD', new Date('2021-09-10'), 40000000, 'residential', 85, 'C', 'AM', 'Vanadzor', 'Retail'],
    ['M-2', 30000000, 'AMD', null, 60000000, 'residential', 100, null, 'AM', 'Gyumri', 'Retail'],
    ['M-3', 5000000, 'AMD', null, null, 'residential', 50, null, 'AM', 'Gyumri', 'Retail'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'tape');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const ctx = {};

test('module gate: tenant without financed_emissions gets 403 MODULE_NOT_ENABLED', { skip }, async () => {
  const r = await call('nofe', 'GET', '/fe/portfolios');
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'MODULE_NOT_ENABLED');
  assert.equal((await call('nobody', 'GET', '/fe/portfolios')).status, 401);
});

test('portfolio, period, factors, loan tape intake and reconciliation', { skip }, async () => {
  const bad = await call('a', 'POST', '/fe/portfolios', { name: '', baseCurrency: 'dollars', assetClasses: ['castles'] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.errors.length, 3);
  const p = await call('a', 'POST', '/fe/portfolios', { name: 'Book', legalEntity: 'Test Bank CJSC', fxSource: 'CBA', inflationAdjust: true });
  assert.equal(p.status, 201);
  assert.equal(p.body.baseCurrency, 'AMD');
  assert.deepEqual(p.body.assetClasses, ['business_loans', 'commercial_re', 'mortgages']);
  ctx.portfolio = p.body;
  const period = await call('a', 'POST', `/fe/portfolios/${p.body.id}/periods`, { name: 'FY2025', reportingDate: '2025-12-31', ledgerTotal: 200000000 });
  assert.equal(period.status, 201);
  assert.equal(period.body.status, 'OPEN');
  ctx.period = period.body;

  const set = await call('a', 'POST', '/fe/factor-sets', { name: 'Test set', version: '1', source: 'unit test values', illustrative: true });
  assert.equal(set.status, 201);
  ctx.set = set.body;
  const badFactors = await send('a', `/fe/factor-sets/${set.body.id}/factors`, {}, 'kind,key,value\nnope,x,1\n', 'f.csv');
  assert.equal(badFactors.status, 400);
  assert.equal(badFactors.body.rowErrors[0].row, 2);
  const factors = await send('a', `/fe/factor-sets/${set.body.id}/factors`, {}, FACTORS_CSV, 'f.csv');
  assert.equal(factors.status, 201, JSON.stringify(factors.body));
  assert.equal(factors.body.imported, 7);

  // Template download.
  const tpl = await raw('a', '/fe/templates/business_loans');
  assert.equal(tpl.status, 200);
  assert.match(tpl.buf.toString(), /^facilityRef,counterpartyId/);
  assert.equal((await raw('a', '/fe/templates/castles')).status, 404);

  // Business loans: valid rows accepted, invalid rejected with row/field.
  const up = await send('a', `/fe/periods/${ctx.period.id}/uploads`, { assetClass: 'business_loans' }, BL_CSV, 'bl.csv');
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal(up.body.upload.acceptedRows, 4);
  assert.equal(up.body.upload.rejectedRows, 3);
  assert.equal(up.body.created, 4);
  assert.ok(up.body.errors.some((e) => e.row === 6 && e.field === 'outstanding'));
  assert.ok(up.body.errors.some((e) => e.row === 7 && e.field === 'facilityRef' && /Duplicate of row 2/.test(e.message)));
  assert.ok(up.body.errors.some((e) => e.row === 8 && e.field === 'counterpartyId'));
  assert.ok(up.body.errors.some((e) => e.row === 8 && e.field === 'naceCode'));
  assert.equal(up.body.reconciliation.uploadOutstanding, 157000000);
  assert.equal(up.body.reconciliation.periodOutstanding, 157000000);
  assert.equal(up.body.reconciliation.difference, -43000000);
  assert.equal(up.body.reconciliation.differencePct, -21.5);
  ctx.uploadId = up.body.upload.id;

  const errCsv = await raw('a', `/fe/uploads/${ctx.uploadId}/errors.csv`);
  assert.equal(errCsv.status, 200);
  assert.match(errCsv.buf.toString(), /^row,field,message\n6,outstanding,Must not be negative/);

  // Pseudonymised ids only: sha256(companyId:clientId); name optional.
  const cps = await prisma.feCounterparty.findMany({ where: { companyId: companies.a.id } });
  assert.equal(cps.length, 4);
  const hash = require('crypto').createHash('sha256').update(`${companies.a.id}:CL-1`).digest('hex');
  const hotel = cps.find((c) => c.stableId === hash);
  assert.ok(hotel);
  assert.equal(hotel.name, 'Hotel One');
  assert.equal(hotel.revenueCurrency, 'AMD');
  assert.ok(!cps.some((c) => c.stableId.startsWith('CL-')));
  ctx.hotel = hotel;
  ctx.cpNoEd = cps.find((c) => c.naceCode === '41.20');
  ctx.cpUnmapped = cps.find((c) => c.localSectorCode === 'LOC-9');

  // Re-upload of a facilityRef updates the line (delta); another class → rejected.
  const again = await send('a', `/fe/periods/${ctx.period.id}/uploads`, { assetClass: 'business_loans' },
    'facilityRef,counterpartyId,outstanding,currency\nBL-2,CL-2,45000000,AMD\n', 'bl2.csv');
  assert.equal(again.body.updated, 1);
  assert.equal(again.body.created, 0);
  const clash = await send('a', `/fe/periods/${ctx.period.id}/uploads`, { assetClass: 'mortgages' },
    'facilityRef,outstanding,currency,valueAtOrigination\nBL-2,1,AMD,2\n', 'm.csv');
  assert.equal(clash.body.upload.acceptedRows, 0);
  assert.match(clash.body.errors[0].message, /business_loans/);

  // Mortgages from XLSX.
  const mtg = await send('a', `/fe/periods/${ctx.period.id}/uploads`, { assetClass: 'mortgages' }, mortgageXlsx(), 'mtg.xlsx');
  assert.equal(mtg.status, 201, JSON.stringify(mtg.body));
  assert.equal(mtg.body.upload.acceptedRows, 2);
  assert.ok(mtg.body.errors.some((e) => e.row === 4 && e.field === 'valueAtOrigination'));
  const m1 = await prisma.feExposure.findFirst({ where: { periodId: ctx.period.id, facilityRef: 'M-1' } });
  assert.equal(m1.originationDate.toISOString().slice(0, 10), '2021-09-10');

  // Out-of-scope asset class and missing file.
  assert.equal((await send('a', `/fe/periods/${ctx.period.id}/uploads`, { assetClass: 'motor_vehicle' }, 'x', 'x.csv')).status, 400);
  assert.equal((await send('a', `/fe/periods/${ctx.period.id}/uploads`, { assetClass: 'mortgages' })).status, 400);

  const uploads = await call('a', 'GET', `/fe/periods/${ctx.period.id}/uploads`);
  assert.equal(uploads.body.uploads.length, 4);
  assert.equal(uploads.body.reconciliation.lines, 6);
});

test('calculation run: totals, exceptions, reproducibility, ladder upgrade', { skip }, async () => {
  const run = await call('a', 'POST', `/fe/periods/${ctx.period.id}/runs`, { factorSetId: ctx.set.id });
  assert.equal(run.status, 201, JSON.stringify(run.body));
  const t = run.body.totals;
  assert.equal(run.body.methodologyVersion, 'PCAF-A-3ed-2025.12/triplei-1');
  assert.equal(run.body.factorSetVersion, '1');
  assert.equal(t.factorSet.illustrative, true);
  assert.equal(t.lines, 6);
  assert.equal(t.exceptions, 2); // BL-3 missing equity+debt, BL-4 unmapped
  // BL-1 61.2 + BL-2 (45/300 × 300 × 0.6 = 27) + M-1 1.275 + M-2 1.5
  assert.ok(Math.abs(t.absoluteFinanced - (61.2 + 27 + 1.275 + 1.5)) < 1e-6, String(t.absoluteFinanced));
  assert.ok(Math.abs(t.undrawnFinanced - 6.8) < 1e-6);
  assert.equal(t.totalOutstanding, 90e6 + 45e6 + 15e6 + 12e6 + 25e6 + 30e6);
  assert.equal(t.coveragePct, Math.round(((190e6) / 217e6) * 10000) / 100);
  assert.equal(t.byAssetClass.mortgages.coveragePct, 100);
  assert.equal(t.unmapped, 1);
  ctx.run = run.body;

  // Same inputs → same hashes.
  const rerun = await call('a', 'POST', `/fe/periods/${ctx.period.id}/runs`, {});
  assert.equal(rerun.body.factorSetId, ctx.set.id); // defaults to the last run's set
  assert.equal(rerun.body.inputsHash, run.body.inputsHash);
  assert.equal(rerun.body.outputsHash, run.body.outputsHash);
  const verify = await call('a', 'POST', `/fe/runs/${run.body.id}/verify`);
  assert.equal(verify.status, 200);
  assert.equal(verify.body.reproducible, true);

  // Exceptions list and CSV.
  const ex = await call('a', 'GET', `/fe/runs/${run.body.id}/results?exceptions=1`);
  assert.equal(ex.body.total, 2);
  const exCsv = await raw('a', `/fe/runs/${run.body.id}/exceptions.csv`);
  assert.match(exCsv.buf.toString(), /BL-3,[0-9a-f]{64},business_loans,15000000,AMD,"Total equity \+ debt of the borrower is missing/);

  // Factor set used by a run is frozen.
  assert.equal((await send('a', `/fe/factor-sets/${ctx.set.id}/factors`, {}, FACTORS_CSV, 'f.csv')).status, 409);
  assert.equal((await call('a', 'DELETE', `/fe/factor-sets/${ctx.set.id}`)).status, 409);

  // Unmapped queue → bulk map → line calculated.
  const queue = await call('a', 'GET', `/fe/periods/${ctx.period.id}/unmapped`);
  assert.deepEqual(queue.body.map((q) => q.code), ['LOC-9']);
  assert.equal((await call('a', 'POST', '/fe/sector-map', { mappings: [{ code: 'LOC-9', factorKey: 'nonsense' }] })).status, 400);
  const mapped = await call('a', 'POST', '/fe/sector-map', { periodId: ctx.period.id, mappings: [{ code: 'loc-9', factorKey: '23.51' }] });
  assert.equal(mapped.status, 201);
  assert.equal((await call('a', 'GET', `/fe/periods/${ctx.period.id}/unmapped`)).body.length, 0);
  const unmappedList = await call('a', 'GET', '/fe/counterparties?unmapped=1');
  assert.equal(unmappedList.body.total, 0);

  // Reported, verified emissions move the hotel line to score 1.
  const badEm = await call('a', 'POST', `/fe/counterparties/${ctx.hotel.id}/emissions`, { year: 2025, source: 'guess' });
  assert.equal(badEm.status, 400);
  const em = await call('a', 'POST', `/fe/counterparties/${ctx.hotel.id}/emissions`, { year: 2025, source: 'reported', verified: true, scope1: 300, scope2: 200 });
  assert.equal(em.status, 201);
  const edit = await call('a', 'PUT', `/fe/counterparties/${ctx.cpNoEd.id}`, { equityPlusDebt: 150000000, naceCode: 'bad' });
  assert.equal(edit.status, 400);
  assert.equal((await call('a', 'PUT', `/fe/counterparties/${ctx.cpNoEd.id}`, { equityPlusDebt: 150000000 })).status, 200);

  const run2 = await call('a', 'POST', `/fe/periods/${ctx.period.id}/runs`, {});
  assert.notEqual(run2.body.inputsHash, run.body.inputsHash);
  assert.equal(run2.body.totals.exceptions, 1); // BL-3: no factor for sector F in this set
  const ex2 = await call('a', 'GET', `/fe/runs/${run2.body.id}/results?exceptions=1`);
  assert.match(ex2.body.rows[0].exception, /no revenue- or asset-based factor for sector 41.20/);
  assert.equal(run2.body.totals.mapping.entries, 1);
  const fresh = await call('a', 'POST', `/fe/runs/${run2.body.id}/verify`);
  assert.equal(fresh.body.reproducible, true, JSON.stringify(fresh.body));
  const stale = await call('a', 'POST', `/fe/runs/${run.body.id}/verify`);
  assert.equal(stale.body.reproducible, false);
  ctx.run = run2.body;

  // Lineage drawer for the hotel line.
  const bl1 = await prisma.feExposure.findFirst({ where: { periodId: ctx.period.id, facilityRef: 'BL-1' } });
  const lineage = await call('a', 'GET', `/fe/exposures/${bl1.id}/lineage`);
  assert.equal(lineage.status, 200);
  assert.equal(lineage.body.result.dqScore, 1);
  assert.ok(Math.abs(lineage.body.result.financedTotal - 90) < 1e-9); // 0.18 × 500
  assert.equal(lineage.body.attributionInputs.denominator, 500000000);
  assert.equal(lineage.body.factorSet.version, '1');
  const bl2 = await prisma.feExposure.findFirst({ where: { periodId: ctx.period.id, facilityRef: 'BL-2' } });
  const lin2 = await call('a', 'GET', `/fe/exposures/${bl2.id}/lineage`);
  assert.equal(lin2.body.factor[0].kind, 'asset_sector');
  assert.equal(lin2.body.factor[0].value, 0.6);

  // Counterparty registry with latest DQ.
  const list = await call('a', 'GET', '/fe/counterparties');
  assert.equal(list.body.rows.find((c) => c.id === ctx.hotel.id).latestDq, 1);

  // Dashboard + filters.
  const dash = await call('a', 'GET', `/fe/periods/${ctx.period.id}/dashboard`);
  assert.equal(dash.status, 200);
  assert.equal(dash.body.totals.absoluteFinanced, run2.body.totals.absoluteFinanced);
  assert.equal(dash.body.top[0].facilityRef, 'BL-1');
  assert.equal(dash.body.factorSet.illustrative, true);
  assert.deepEqual(dash.body.filterOptions.assetClasses, ['business_loans', 'mortgages']);
  const filtered = await call('a', 'GET', `/fe/periods/${ctx.period.id}/dashboard?assetClass=mortgages`);
  assert.equal(filtered.body.totals.lines, 2);
  assert.equal(filtered.body.totals.bySector.HH.lines, 2);
});

test('XLSX report: four sheets, names masked unless admin asks', { skip }, async () => {
  const r = await raw('a', `/fe/runs/${ctx.run.id}/report.xlsx`);
  assert.equal(r.status, 200);
  const wb = XLSX.read(r.buf, { type: 'buffer' });
  assert.deepEqual(wb.SheetNames, ['PCAF disclosure', 'By sector (IFRS S2 C15)', 'Line results', 'Methodology']);
  const disclosure = XLSX.utils.sheet_to_json(wb.Sheets['PCAF disclosure'], { header: 1 });
  assert.match(disclosure[0][0], /ILLUSTRATIVE/);
  const lines = XLSX.utils.sheet_to_json(wb.Sheets['Line results'], { header: 1 });
  assert.ok(!lines[0].includes('Counterparty name'));
  assert.ok(!JSON.stringify(lines).includes('Hotel One'));
  const meth = XLSX.utils.sheet_to_json(wb.Sheets.Methodology, { header: 1 });
  assert.ok(meth.some((row) => row[0] === 'Inputs hash (sha256)' && row[1] === ctx.run.inputsHash));

  assert.equal((await raw('preparer', `/fe/runs/${ctx.run.id}/report.xlsx?includeNames=1`)).status, 403);
  const named = await raw('a', `/fe/runs/${ctx.run.id}/report.xlsx?includeNames=1`);
  const wb2 = XLSX.read(named.buf, { type: 'buffer' });
  assert.ok(JSON.stringify(XLSX.utils.sheet_to_json(wb2.Sheets['Line results'], { header: 1 })).includes('Hotel One'));
});

test('review workflow: submit, approve & lock blocks writes, reopen needs a reason', { skip }, async () => {
  const pid = ctx.period.id;
  const sub = await call('preparer', 'POST', `/fe/periods/${pid}/submit`, { comment: 'Ready' });
  assert.equal(sub.status, 200);
  assert.equal(sub.body.status, 'IN_REVIEW');
  const inReview = await send('a', `/fe/periods/${pid}/uploads`, { assetClass: 'mortgages' }, 'facilityRef,outstanding,currency,valueAtOrigination\nM-9,1,AMD,2\n', 'm.csv');
  assert.equal(inReview.status, 409);
  assert.equal(inReview.body.code, 'PERIOD_IN_REVIEW');
  assert.equal((await call('preparer', 'POST', `/fe/periods/${pid}/approve`)).status, 403);
  assert.equal((await call('a', 'POST', `/fe/periods/${pid}/reject`, {})).status, 400); // reject needs a comment
  const ok = await call('a', 'POST', `/fe/periods/${pid}/approve`, { comment: 'Signed off' });
  assert.equal(ok.body.status, 'LOCKED');
  assert.equal((await call('a', 'POST', `/fe/periods/${pid}/approve`)).status, 409);

  const exp = await prisma.feExposure.findFirst({ where: { periodId: pid } });
  for (const [m, p, b] of [
    ['POST', `/fe/periods/${pid}/runs`, {}],
    ['PUT', `/fe/periods/${pid}`, { ledgerTotal: 1 }],
    ['PUT', `/fe/exposures/${exp.id}`, { outstanding: 1 }],
    ['DELETE', `/fe/exposures/${exp.id}`],
    ['POST', '/fe/sector-map', { periodId: pid, mappings: [{ code: 'X1', factorKey: 'C' }] }],
    ['PUT', `/fe/counterparties/${ctx.hotel.id}`, { revenue: 1 }],
    ['POST', `/fe/counterparties/${ctx.hotel.id}/emissions`, { year: 2024, source: 'reported', scope1: 1 }],
  ]) {
    const r = await call('a', m, p, b);
    assert.equal(r.status, 409, `${m} ${p}`);
    assert.equal(r.body.code, 'PERIOD_LOCKED', `${m} ${p}`);
  }
  const lockedUpload = await send('a', `/fe/periods/${pid}/uploads`, { assetClass: 'mortgages' }, 'facilityRef,outstanding,currency,valueAtOrigination\nM-9,1,AMD,2\n', 'm.csv');
  assert.equal(lockedUpload.status, 409);
  // Verification still works on a locked period.
  assert.equal((await call('a', 'POST', `/fe/runs/${ctx.run.id}/verify`)).body.reproducible, true);

  assert.equal((await call('a', 'POST', `/fe/periods/${pid}/reopen`, {})).status, 400);
  assert.equal((await call('a', 'POST', `/fe/periods/${pid}/reopen`, { reason: '   ' })).status, 400);
  assert.equal((await call('preparer', 'POST', `/fe/periods/${pid}/reopen`, { reason: 'x' })).status, 403);
  const reopened = await call('a', 'POST', `/fe/periods/${pid}/reopen`, { reason: 'Auditor found a missing facility' });
  assert.equal(reopened.body.status, 'OPEN');
  assert.equal((await call('a', 'POST', `/fe/periods/${pid}/comments`, { comment: 'Adding M-9' })).status, 201);

  const events = await call('a', 'GET', `/fe/periods/${pid}/events`);
  assert.deepEqual(events.body.map((e) => e.action), ['COMMENT', 'REOPEN', 'APPROVE', 'SUBMIT']);
  assert.equal(events.body[1].comment, 'Auditor found a missing facility');
  assert.equal(events.body[1].fromStatus, 'LOCKED');
  const logs = await prisma.activityLog.findMany({ where: { companyId: companies.a.id } });
  const actions = new Set(logs.map((l) => l.action));
  for (const a of ['FE_PORTFOLIO_CREATE', 'FE_TAPE_UPLOAD', 'FE_RUN', 'FE_RUN_VERIFY', 'FE_PERIOD_SUBMIT', 'FE_PERIOD_APPROVE', 'FE_PERIOD_REOPEN', 'FE_SECTOR_MAP', 'FE_EMISSIONS_ADD']) assert.ok(actions.has(a), a);
});

test('another tenant gets 404 for every id', { skip }, async () => {
  const pid = ctx.period.id;
  const exp = await prisma.feExposure.findFirst({ where: { periodId: pid } });
  for (const [m, p, b] of [
    ['GET', `/fe/portfolios/${ctx.portfolio.id}`],
    ['PUT', `/fe/portfolios/${ctx.portfolio.id}`, { name: 'x' }],
    ['DELETE', `/fe/portfolios/${ctx.portfolio.id}`],
    ['POST', `/fe/portfolios/${ctx.portfolio.id}/periods`, { name: 'x', reportingDate: '2025-12-31' }],
    ['GET', `/fe/periods/${pid}`],
    ['PUT', `/fe/periods/${pid}`, { name: 'x' }],
    ['GET', `/fe/periods/${pid}/uploads`],
    ['GET', `/fe/periods/${pid}/exposures`],
    ['GET', `/fe/periods/${pid}/dashboard`],
    ['GET', `/fe/periods/${pid}/unmapped`],
    ['POST', `/fe/periods/${pid}/runs`, {}],
    ['GET', `/fe/periods/${pid}/runs`],
    ['GET', `/fe/periods/${pid}/events`],
    ['POST', `/fe/periods/${pid}/submit`, {}],
    ['POST', `/fe/periods/${pid}/comments`, { comment: 'x' }],
    ['GET', `/fe/uploads/${ctx.uploadId}/errors.csv`],
    ['GET', `/fe/exposures/${exp.id}/lineage`],
    ['PUT', `/fe/exposures/${exp.id}`, { outstanding: 1 }],
    ['GET', `/fe/counterparties/${ctx.hotel.id}`],
    ['PUT', `/fe/counterparties/${ctx.hotel.id}`, { revenue: 1 }],
    ['POST', `/fe/counterparties/${ctx.hotel.id}/emissions`, { year: 2024, source: 'reported', scope1: 1 }],
    ['GET', `/fe/factor-sets/${ctx.set.id}`],
    ['DELETE', `/fe/factor-sets/${ctx.set.id}`],
    ['GET', `/fe/runs/${ctx.run.id}`],
    ['GET', `/fe/runs/${ctx.run.id}/results`],
    ['POST', `/fe/runs/${ctx.run.id}/verify`],
    ['GET', `/fe/runs/${ctx.run.id}/report.xlsx`],
    ['GET', `/fe/runs/${ctx.run.id}/exceptions.csv`],
  ]) {
    const r = await call('b', m, p, b);
    assert.equal(r.status, 404, `${m} ${p}`);
  }
  const lists = await Promise.all(['/fe/portfolios', '/fe/counterparties', '/fe/factor-sets', '/fe/sector-map'].map((p) => call('b', 'GET', p)));
  assert.equal(lists[0].body.length, 0);
  assert.equal(lists[1].body.total, 0);
  assert.equal(lists[2].body.length, 0);
  assert.equal(lists[3].body.length, 0);
  const upload = await send('b', `/fe/factor-sets/${ctx.set.id}/factors`, {}, FACTORS_CSV, 'f.csv');
  assert.equal(upload.status, 404);
});
