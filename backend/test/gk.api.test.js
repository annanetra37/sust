'use strict';

// API tests for /api/gk (Green Key Readiness).
// Needs a database: DATABASE_URL=postgresql://… node --test test/gk.api.test.js
// (skipped when DATABASE_URL is not set).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const skip = !process.env.DATABASE_URL && 'DATABASE_URL not set';

let prisma; let server; let base;
const tokens = {};
const companies = {};

async function call(who, method, p, body) {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* binary or empty */ }
  return { status: res.status, body: json };
}

async function upload(who, estId, { name = 'targets.pdf', type = 'application/pdf', content = '%PDF-1.4 test', fields = {} } = {}) {
  const fd = new FormData();
  fd.append('file', new Blob([content], { type }), name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch(`${base}/gk/establishments/${estId}/evidence`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[who]}` }, body: fd });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  if (skip) return;
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const config = require('../src/config');
  prisma = require('../src/config/prisma');

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/gk', require('../src/routes/greenKey'));
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;

  const stamp = Date.now();
  for (const [key, gk] of [['a', true], ['b', true], ['none', false]]) {
    const company = await prisma.company.create({ data: { name: `GK test ${key} ${stamp}`, country: 'AM', industry: 'Hospitality', companySize: '1-50', tier: 'PROFESSIONAL' } });
    if (gk) await prisma.companyModule.create({ data: { companyId: company.id, module: 'green_key', enabled: true } });
    companies[key] = company;
    for (const role of ['ADMIN', 'CUSTOM']) {
      const user = await prisma.user.create({
        data: { email: `gk-${key}-${role}-${stamp}@test.local`, passwordHash: 'x', firstName: 'T', lastName: key, role, isActive: true, emailVerified: true, companyId: company.id },
      });
      tokens[role === 'ADMIN' ? key : `${key}Custom`] = jwt.sign({ userId: user.id }, config.jwt.secret, { expiresIn: '1h' });
    }
  }
});

after(async () => {
  if (skip) return;
  server.close();
  const companyIds = Object.values(companies).map((c) => c.id);
  await prisma.activityLog.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  const { UPLOADS_DIR } = require('../src/utils/fileStore');
  for (const id of companyIds) fs.rmSync(path.join(UPLOADS_DIR, id), { recursive: true, force: true });
  await prisma.$disconnect();
});

const now = new Date();
const Y = now.getUTCFullYear();
const iso = (d) => d.toISOString().slice(0, 10);
const addMonths = (d, n) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };

let clientId; let estId; let est2Id;
const crit = {};

test('module gate: tenant without green_key gets 403 MODULE_NOT_ENABLED', { skip }, async () => {
  const r = await call('none', 'GET', '/gk/clients');
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'MODULE_NOT_ENABLED');
  assert.equal(r.body.module, 'green_key');
  assert.equal((await call(null, 'GET', '/gk/clients')).status, 401);
});

test('clients, establishments, profile change notice and criteria library', { skip }, async () => {
  const c = await call('a', 'POST', '/gk/clients', { name: 'Ararat Hotels Group', clientType: 'group', country: 'am' });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal(c.body.country, 'AM');
  clientId = c.body.id;
  assert.equal((await call('a', 'POST', '/gk/clients', { name: '', clientType: 'x' })).status, 400);
  const brand = await call('a', 'POST', `/gk/clients/${clientId}/brands`, { name: 'Ararat City' });
  assert.equal(brand.status, 201);

  const e = await call('a', 'POST', '/gk/establishments', {
    clientId, brandId: brand.body.id, name: 'Ararat Yerevan', country: 'AM', city: 'Yerevan', rooms: 80, beds: 160, employees: 30,
    facilities: { restaurant: true, pool: false, meetingSpaceM2: 200 },
  });
  assert.equal(e.status, 201, JSON.stringify(e.body));
  estId = e.body.id;
  assert.equal(e.body.criteriaVersion, '2026-2031');
  const e2 = await call('a', 'POST', '/gk/establishments', { clientId, name: 'Ararat Gyumri', country: 'AM', city: 'Gyumri', employees: 12 });
  est2Id = e2.body.id;
  assert.equal((await call('a', 'POST', '/gk/establishments', { clientId, name: 'X', employees: -1 })).status, 400);
  assert.equal((await call('b', 'POST', '/gk/establishments', { clientId, name: 'Stolen' })).status, 400);

  const lib = await call('a', 'GET', '/gk/criteria?version=2026-2031');
  assert.equal(lib.status, 200);
  for (const code of ['1.1', '1.2', '1.3', '1.6', '1.9', '1.10', '1.20', '1.21', '2.5', '3.1']) {
    const found = lib.body.criteria.find((x) => x.code === code && x.companyId === null);
    assert.ok(found, `criterion ${code} seeded`);
    crit[code] = found.id;
  }
  assert.equal(lib.body.starterSet, true);
  assert.equal(lib.body.areas.length, 7);
  const legacy = await call('a', 'GET', '/gk/criteria?version=2022-2026');
  assert.equal(legacy.status, 200);

  const detail = await call('a', 'GET', `/gk/establishments/${estId}`);
  assert.equal(detail.body.categoryCheck.status, 'not_configured');
  assert.equal(detail.body.requirement.requiredPct, 0);

  const board1 = await call('a', 'GET', `/gk/establishments/${estId}/criteria`);
  assert.equal(board1.body.rows.find((r) => r.code === '1.6').effectiveType, 'guideline');

  const upd = await call('a', 'PUT', `/gk/establishments/${estId}`, { employees: 80, priorPeriods: 2 });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal(upd.body.changeNotice.changed, true);
  assert.deepEqual(upd.body.changeNotice.typeChanged.map((x) => x.code).sort(), ['1.10', '1.6']);
  assert.ok(upd.body.changeNotice.typeChanged.every((x) => x.to === 'imperative'));
  const board2 = await call('a', 'GET', `/gk/establishments/${estId}/criteria`);
  assert.equal(board2.body.rows.find((r) => r.code === '1.10').effectiveType, 'imperative');
  assert.equal(board2.body.requirement.period, 3);
  assert.equal(board2.body.summary.guideline.requiredPct, 20);
});

test('tenant criteria: add, override, import, global library read-only', { skip }, async () => {
  const bad = await call('a', 'POST', '/gk/criteria', { code: 'abc', area: 9, title: '', type: 'x' });
  assert.equal(bad.status, 400);
  const add = await call('a', 'POST', '/gk/criteria', {
    code: '6.4', area: 6, subArea: 'Food and beverage', title: 'Consultant test criterion', type: 'guideline',
    applicability: { requiresFacility: 'restaurant' }, evidenceTypes: 'menu;invoice', auditMethod: 'visual',
  });
  assert.equal(add.status, 201, JSON.stringify(add.body));
  assert.deepEqual(add.body.evidenceTypes, ['menu', 'invoice']);
  const badRule = await call('a', 'POST', '/gk/criteria', { code: '6.5', area: 6, title: 'x', type: 'guideline', applicability: { requiresFacility: 'spa' } });
  assert.equal(badRule.status, 400);
  assert.equal((await call('a', 'PUT', `/gk/criteria/${crit['3.1']}`, { title: 'hack' })).status, 403);
  assert.equal((await call('b', 'PUT', `/gk/criteria/${add.body.id}`, { title: 'hack' })).status, 404);

  const imp = await call('a', 'POST', '/gk/criteria/import', {
    csv: 'code,version,area,subArea,title,guidance,type,applicability,evidenceTypes,auditMethod,dataLink\n'
      + '4.2,2026-2031,4,Energy management,Consultant energy item,Short paraphrase,guideline,"{""notSeasonal"":true}",meter log,document,energy\n'
      + '6.4,2026-2031,6,Food and beverage,Consultant test criterion v2,,guideline,"{""requiresFacility"":""restaurant""}",,visual,\n',
  });
  assert.equal(imp.status, 201, JSON.stringify(imp.body));
  assert.deepEqual(imp.body, { created: 1, updated: 1 });
  const badImp = await call('a', 'POST', '/gk/criteria/import', { criteria: [{ code: '7.1', area: 7, title: 'ok', type: 'guideline' }, { code: 'x' }] });
  assert.equal(badImp.status, 400);
  assert.equal(badImp.body.errors.length, 1);

  // B does not see A's criteria.
  const libB = await call('b', 'GET', '/gk/criteria');
  assert.ok(!libB.body.criteria.some((x) => x.code === '6.4'));
  const board = await call('a', 'GET', `/gk/establishments/${estId}/criteria`);
  assert.ok(board.body.rows.some((r) => r.code === '6.4' && r.custom));
  assert.ok(board.body.notApplicable.length === 0 || board.body.notApplicable.every((r) => r.reasons.length));
  // Gyumri has no restaurant → 6.4 not applicable with a reason.
  const b2 = await call('a', 'GET', `/gk/establishments/${est2Id}/criteria`);
  const na = b2.body.notApplicable.find((r) => r.code === '6.4');
  assert.match(na.reasons[0], /restaurant/);
});

test('readiness board: N/A requires justification, comments, history, readiness %', { skip }, async () => {
  const noJust = await call('a', 'PUT', `/gk/establishments/${estId}/criteria/${crit['1.9']}`, { status: 'na' });
  assert.equal(noJust.status, 400);
  const na = await call('a', 'PUT', `/gk/establishments/${estId}/criteria/${crit['1.9']}`, { status: 'na', naJustification: 'Assessment: no Indigenous Peoples within 100 km.' });
  assert.equal(na.status, 200);
  const conf = await call('a', 'PUT', `/gk/establishments/${estId}/criteria/${crit['1.1']}`, { status: 'conforms', ownerName: 'Ani', dueDate: iso(addMonths(now, 1)) });
  assert.equal(conf.status, 200);
  assert.equal(conf.body.comments[0].kind, 'status');
  const cm = await call('a', 'POST', `/gk/establishments/${estId}/criteria/${crit['1.1']}/comments`, { text: 'Appointment letter signed.' });
  assert.equal(cm.status, 201);
  assert.equal(cm.body.comments.length, 2);
  assert.equal((await call('aCustom', 'PUT', `/gk/establishments/${estId}/criteria/${crit['1.3']}`, { status: 'approved' })).status, 403);
  assert.equal((await call('a', 'PUT', `/gk/establishments/${estId}/criteria/${crit['1.3']}`, { status: 'bogus' })).status, 400);

  const board = await call('a', 'GET', `/gk/establishments/${estId}/criteria`);
  const s = board.body.summary;
  assert.equal(s.done, 2);
  assert.equal(s.readinessPct, Math.round((2 / s.applicable) * 1000) / 10);
  assert.equal(s.imperativeGaps, s.imperativeTotal - 1); // 1.1 done
  const row = board.body.rows.find((r) => r.code === '1.9');
  assert.equal(row.done, true);
  assert.match(row.naJustification, /100 km/);
});

test('evidence: upload, link → evidence_uploaded, validity warnings, approve, file, cross-tenant', { skip }, async () => {
  const bad = await upload('a', estId, { name: 'x.exe', type: 'application/x-msdownload' });
  assert.equal(bad.status, 400);
  const old = await upload('a', estId, { fields: { criterionIds: JSON.stringify([crit['1.2']]), documentDate: `${Y - 3}-01-10`, description: 'Targets 2023' } });
  assert.equal(old.status, 201, JSON.stringify(old.body));
  assert.equal(old.body.status, 'pending');
  const board = await call('a', 'GET', `/gk/establishments/${estId}/criteria`);
  const r12 = board.body.rows.find((r) => r.code === '1.2');
  assert.equal(r12.status, 'evidence_uploaded');
  assert.ok(r12.evidence[0].warnings.some((w) => w.key === 'tooOld'));

  const list = await call('a', 'GET', `/gk/establishments/${estId}/evidence`);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].storedFilePath, undefined);
  assert.equal(list.body[0].criteria[0].code, '1.2');

  // Re-link to 1.3 as well.
  const upd = await call('a', 'PUT', `/gk/evidence/${old.body.id}`, { criterionIds: [crit['1.2'], crit['1.3']], documentDate: iso(now) });
  assert.equal(upd.status, 200);

  assert.equal((await call('aCustom', 'POST', `/gk/evidence/${old.body.id}/review`, { decision: 'approved' })).status, 403);
  assert.equal((await call('a', 'POST', `/gk/evidence/${old.body.id}/review`, { decision: 'rejected' })).status, 400);
  const ok = await call('a', 'POST', `/gk/evidence/${old.body.id}/review`, { decision: 'approved', note: 'Fine' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'approved');
  const b2 = await call('a', 'GET', `/gk/establishments/${estId}/criteria`);
  assert.equal(b2.body.rows.find((r) => r.code === '1.2').status, 'approved');
  assert.equal(b2.body.rows.find((r) => r.code === '1.3').status, 'approved');

  const file = await fetch(`${base}/gk/evidence/${old.body.id}/file`, { headers: { Authorization: `Bearer ${tokens.a}` } });
  assert.equal(file.status, 200);
  assert.equal(await file.text(), '%PDF-1.4 test');
  assert.equal((await fetch(`${base}/gk/evidence/${old.body.id}/file`, { headers: { Authorization: `Bearer ${tokens.b}` } })).status, 404);
  assert.equal((await call('b', 'POST', `/gk/evidence/${old.body.id}/review`, { decision: 'approved' })).status, 404);
  assert.equal((await upload('b', estId)).status, 404);
});

test('resource data: import, estimation flag, 3.1 coverage, KPIs, client comparison', { skip }, async () => {
  const rows = [];
  for (let i = 0; i < 24; i++) {
    const y = Y - 2 + Math.floor(i / 12); const m = (i % 12) + 1;
    rows.push({ year: y, month: m, kind: 'energy', source: 'electricity', quantity: '20000', unit: 'kWh' });
    rows.push({ year: y, month: m, kind: 'water', source: 'municipal', quantity: '500', unit: 'm3', estimated: i === 3 ? 'yes' : '', estimationMethod: i === 3 ? 'occupancy_allocation' : '' });
    rows.push({ year: y, month: m, kind: 'waste', source: 'mixed', quantity: '800', unit: 'kg', disposal: 'landfill' });
    rows.push({ year: y, month: m, kind: 'waste', source: 'paper', quantity: '200', unit: 'kg', disposal: 'recycled' });
    rows.push({ year: y, month: m, kind: 'occupancy', guestNights: '2000', occupiedRooms: '1000' });
  }
  const badRows = await call('a', 'POST', `/gk/establishments/${estId}/import`, { rows: [{ year: Y - 1, month: 1, kind: 'water', source: 'municipal', quantity: 1, estimated: 'yes' }, { year: Y - 1, month: 13, kind: 'energy', source: 'coal', quantity: 1 }] });
  assert.equal(badRows.status, 400);
  assert.equal(badRows.body.errors.length, 2);
  const imp = await call('a', 'POST', `/gk/establishments/${estId}/import`, { rows });
  assert.equal(imp.status, 201, JSON.stringify(imp.body));
  assert.deepEqual(imp.body, { resources: 96, occupancy: 24 });
  // Re-import replaces rather than duplicates.
  await call('a', 'POST', `/gk/establishments/${estId}/import`, { rows });
  const res = await call('a', 'GET', `/gk/establishments/${estId}/resources`);
  assert.equal(res.body.records.length, 96);
  assert.equal(res.body.coverage.water.rule, 'twoYears');
  assert.equal(res.body.coverage.water.pass, true);
  assert.equal(res.body.records.filter((r) => r.estimated).length, 1);

  // Delete one water month → coverage fails and names the month.
  const w = res.body.records.find((r) => r.kind === 'water' && r.year === Y - 1 && r.month === 7);
  assert.equal((await call('b', 'DELETE', `/gk/resources/${w.id}`)).status, 404);
  assert.equal((await call('a', 'DELETE', `/gk/resources/${w.id}`)).status, 200);
  const res2 = await call('a', 'GET', `/gk/establishments/${estId}/resources?kind=water`);
  assert.equal(res2.body.coverage.water.pass, false);
  assert.deepEqual(res2.body.coverage.water.missing, [`${Y - 1}-07`]);

  // Single record + validation.
  assert.equal((await call('a', 'POST', `/gk/establishments/${estId}/resources`, { year: Y - 1, month: 7, kind: 'water', source: 'well', quantity: 500, unit: 'm3', estimated: true })).status, 400);
  const one = await call('a', 'POST', `/gk/establishments/${estId}/resources`, { year: Y - 1, month: 7, kind: 'water', source: 'municipal', quantity: 500, unit: 'm3' });
  assert.equal(one.status, 201, JSON.stringify(one.body));

  const k = await call('a', 'GET', `/gk/establishments/${estId}/kpis?from=${Y - 1}-01&to=${Y - 1}-12`);
  assert.equal(k.status, 200);
  assert.equal(k.body.totals.kwh, 240000);
  assert.equal(k.body.intensities.kwhPerGuestNight, 10);
  assert.equal(k.body.intensities.litresPerGuestNight, 250);
  assert.equal(k.body.intensities.wasteKgPerGuestNight, 0.5);
  assert.equal(k.body.intensities.recyclingRatePct, 20);
  assert.ok(k.body.intensities.kgCo2ePerOccupiedRoom > 0);
  assert.equal(k.body.monthly.length, 12);
  assert.equal(k.body.marketBased, 'out_of_scope');

  const occ = await call('a', 'PUT', `/gk/establishments/${est2Id}/occupancy`, [{ year: Y - 1, month: 1, guestNights: 300, occupiedRooms: 200 }]);
  assert.equal(occ.status, 200);
  const cmp = await call('a', 'GET', `/gk/clients/${clientId}/kpis`);
  assert.equal(cmp.body.length, 2);
  assert.equal((await call('b', 'GET', `/gk/clients/${clientId}/kpis`)).status, 404);
});

test('targets and action plan rule checks', { skip }, async () => {
  const docDate = iso(addMonths(now, -2));
  const t1 = await call('a', 'POST', `/gk/establishments/${estId}/targets`, { area: 4, description: 'Cut electricity per guest-night 10 %', metric: 'kWh/guest-night', baselineYear: Y - 1, baselineValue: 10, targetValue: 9, targetYear: Y + 3, documentDate: docDate });
  assert.equal(t1.status, 201, JSON.stringify(t1.body));
  await call('a', 'POST', `/gk/establishments/${estId}/targets`, { area: 3, description: 'Cut water 5 %', baselineYear: Y - 1, baselineValue: 250, targetValue: 237, targetYear: Y + 2, documentDate: docDate });
  assert.equal((await call('a', 'POST', `/gk/establishments/${estId}/targets`, { area: 9, description: '' })).status, 400);
  let plan = await call('a', 'GET', `/gk/establishments/${estId}/plan`);
  // 80 employees → 4 targets needed.
  assert.equal(plan.body.checks.targets.rules.find((r) => r.key === 'count').status, 'fail');
  assert.equal(plan.body.checks.targets.rules.find((r) => r.key === 'areas').status, 'pass');
  for (const area of [5, 6]) await call('a', 'POST', `/gk/establishments/${estId}/targets`, { area, description: `Target area ${area}`, baselineYear: Y - 1, baselineValue: 1, targetValue: 0.9, targetYear: Y + 2, documentDate: docDate });
  plan = await call('a', 'GET', `/gk/establishments/${estId}/plan`);
  assert.equal(plan.body.checks.targets.pass, true, JSON.stringify(plan.body.checks.targets));

  const a1 = await call('a', 'POST', `/gk/establishments/${estId}/actions`, { description: 'LED retrofit', owner: 'Engineering', measure: 'kWh', dueDate: iso(addMonths(now, 3)), targetId: t1.body.id });
  assert.equal(a1.status, 201);
  assert.equal((await call('a', 'POST', `/gk/establishments/${estId}/actions`, { description: 'x', targetId: 'nope' })).status, 400);
  await call('a', 'POST', `/gk/establishments/${estId}/actions`, { description: 'Low-flow aerators', owner: 'Engineering', dueDate: iso(addMonths(now, 15)), targetId: t1.body.id, status: 'not_fulfilled' });
  plan = await call('a', 'GET', `/gk/establishments/${estId}/plan`);
  const ac = plan.body.checks.actions;
  assert.equal(ac.pass, false);
  for (const key of ['count', 'measurable', 'unfulfilled']) assert.equal(ac.rules.find((r) => r.key === key).status, 'fail', key);
  assert.equal(ac.rules.find((r) => r.key === 'span').status, 'pass');
  assert.equal((await call('b', 'PUT', `/gk/actions/${a1.body.id}`, { owner: 'x' })).status, 404);
});

test('people: team registry with history and training checks', { skip }, async () => {
  await call('a', 'POST', `/gk/establishments/${estId}/team`, { role: 'representative', name: 'Old Rep', fromDate: `${Y - 2}-01-01` });
  const rep = await call('a', 'POST', `/gk/establishments/${estId}/team`, { role: 'representative', name: 'Ani Petrosyan', email: 'ani@example.am', replaceCurrent: true });
  assert.equal(rep.status, 201);
  await call('a', 'POST', `/gk/establishments/${estId}/team`, { role: 'substitute', name: 'Seasonal Sub', permanentStaff: false });
  let p = await call('a', 'GET', `/gk/establishments/${estId}/people`);
  assert.equal(p.body.team.length, 3);
  assert.equal(p.body.checks.team.rules.find((r) => r.key === 'representative').status, 'pass');
  assert.equal(p.body.checks.team.rules.find((r) => r.key === 'permanent').status, 'fail');
  assert.equal((await call('a', 'POST', `/gk/establishments/${estId}/team`, { role: 'boss', name: 'x' })).status, 400);

  assert.equal((await call('a', 'POST', `/gk/establishments/${estId}/trainings`, { kind: 'new_hire', topic: 'Induction', date: `${Y - 1}-05-01` })).status, 400);
  await call('a', 'POST', `/gk/establishments/${estId}/trainings`, { kind: 'briefing', topic: 'Water saving', date: `${Y - 1}-03-01` });
  await call('a', 'POST', `/gk/establishments/${estId}/trainings`, { kind: 'general_training', topic: 'Green Key basics', date: `${Y - 1}-04-01` });
  await call('a', 'POST', `/gk/establishments/${estId}/trainings`, { kind: 'new_hire', topic: 'Induction', staffName: 'Lilit', hireDate: `${Y - 1}-05-01`, date: `${Y - 1}-07-01` });
  p = await call('a', 'GET', `/gk/establishments/${estId}/people?year=${Y - 1}`);
  const tr = p.body.checks.training;
  assert.equal(tr.rules.find((r) => r.key === 'briefings').status, 'fail');
  assert.equal(tr.rules.find((r) => r.key === 'departmentalTraining').status, 'fail');
  assert.equal(tr.rules.find((r) => r.key === 'newHires').status, 'fail');
  assert.equal(tr.rules.find((r) => r.key === 'generalTraining').status, 'pass');
});

test('audit and certification: timers, NCs > 5 flag, certificates list, portfolio, audit pack', { skip }, async () => {
  const validFrom = addMonths(now, -18); // renewal window open (6–8 months before expiry)
  const cert = await call('a', 'POST', `/gk/establishments/${estId}/certifications`, { periodNumber: 2, status: 'certified', validFrom: iso(validFrom), auditDate: iso(addMonths(validFrom, -1)) });
  assert.equal(cert.status, 201, JSON.stringify(cert.body));
  assert.equal(cert.body.timers.validTo, iso(addMonths(validFrom, 24)));
  assert.ok(cert.body.timers.tasks.some((t) => t.key === 'renewal' || t.key === 'surveillanceOverdue'));

  for (let i = 0; i < 6; i++) {
    const nc = await call('a', 'POST', `/gk/establishments/${estId}/ncs`, { certificationId: cert.body.id, criterionCode: '3.1', description: `NC ${i + 1}`, raisedAt: iso(addMonths(now, -3)) });
    assert.equal(nc.status, 201);
    if (i === 0) assert.equal(iso(new Date(nc.body.deadline)), iso(addMonths(addMonths(now, -3), 2)));
  }
  let audit = await call('a', 'GET', `/gk/establishments/${estId}/audit`);
  assert.equal(audit.body.ncSummary.followUpRequired, true);
  assert.equal(audit.body.ncSummary.overdue, 6);
  assert.ok(audit.body.nonConformities.every((n) => n.overdue));
  const close = await call('a', 'PUT', `/gk/ncs/${audit.body.nonConformities[0].id}`, { status: 'closed', closureNote: 'Fixed' });
  assert.ok(close.body.closedAt);
  audit = await call('a', 'GET', `/gk/establishments/${estId}/audit`);
  assert.equal(audit.body.ncSummary.open, 5);
  assert.equal(audit.body.requirement.period, 3);

  // Suspension creates the remove-display task.
  const sus = await call('a', 'PUT', `/gk/certifications/${cert.body.id}`, { status: 'suspended' });
  assert.ok(sus.body.timers.tasks.some((t) => t.key === 'removeDisplay'));
  await call('a', 'PUT', `/gk/certifications/${cert.body.id}`, { status: 'certified' });
  assert.equal((await call('b', 'PUT', `/gk/certifications/${cert.body.id}`, { status: 'withdrawn' })).status, 404);

  const certs = await call('a', 'GET', '/gk/certificates');
  assert.equal(certs.body.length, 1);
  assert.equal(certs.body[0].establishment.name, 'Ararat Yerevan');
  assert.equal((await call('b', 'GET', '/gk/certificates')).body.length, 0);

  const pf = await call('a', 'GET', '/gk/portfolio');
  assert.equal(pf.status, 200);
  assert.equal(pf.body.establishments.length, 2);
  const card = pf.body.establishments.find((c) => c.id === estId);
  assert.equal(card.certificate.status, 'certified');
  assert.ok(card.readinessPct > 0);
  assert.equal(card.kpis.kwhPerGuestNight, 10);
  assert.ok(pf.body.alerts.some((a) => a.key === 'ncOverdue'));
  assert.ok(pf.body.alerts.some((a) => a.key === 'ncFollowUp'));
  assert.equal(pf.body.league.length, 2);
  assert.equal((await call('b', 'GET', '/gk/portfolio')).body.establishments.length, 0);

  const ov = await call('a', 'GET', `/gk/establishments/${estId}/overview`);
  assert.equal(ov.status, 200);
  assert.ok(ov.body.imperativeOpen.length >= 1);

  const pack = await fetch(`${base}/gk/establishments/${estId}/audit-pack`, { headers: { Authorization: `Bearer ${tokens.a}` } });
  assert.equal(pack.status, 200);
  assert.match(pack.headers.get('content-type'), /spreadsheetml/);
  const XLSX = require('xlsx');
  const wb = XLSX.read(Buffer.from(await pack.arrayBuffer()), { type: 'buffer' });
  assert.ok(wb.SheetNames.includes('1 Sustainable management'));
  assert.ok(wb.SheetNames.includes('Resource data'));
  assert.ok(wb.SheetNames.includes('Training'));
  const s1 = XLSX.utils.sheet_to_json(wb.Sheets['1 Sustainable management'], { header: 1 });
  const row12 = s1.find((r) => r[0] === '1.2');
  assert.match(row12[7], /targets\.pdf/);
  assert.equal((await fetch(`${base}/gk/establishments/${estId}/audit-pack`, { headers: { Authorization: `Bearer ${tokens.b}` } })).status, 404);
});

test('cross-tenant: another company gets 404 on every establishment route', { skip }, async () => {
  for (const [m, p] of [
    ['GET', `/gk/establishments/${estId}`], ['PUT', `/gk/establishments/${estId}`], ['GET', `/gk/establishments/${estId}/criteria`],
    ['GET', `/gk/establishments/${estId}/overview`], ['GET', `/gk/establishments/${estId}/resources`], ['GET', `/gk/establishments/${estId}/kpis`],
    ['GET', `/gk/establishments/${estId}/plan`], ['GET', `/gk/establishments/${estId}/people`], ['GET', `/gk/establishments/${estId}/audit`],
    ['POST', `/gk/establishments/${estId}/targets`], ['PUT', `/gk/establishments/${estId}/criteria/${crit['1.1']}`],
    ['GET', `/gk/clients/${clientId}`], ['DELETE', `/gk/clients/${clientId}`], ['DELETE', `/gk/establishments/${estId}`],
  ]) {
    const r = await call('b', m, p, m === 'GET' || m === 'DELETE' ? undefined : { name: 'x', area: 1, description: 'x', status: 'conforms' });
    assert.equal(r.status, 404, `${m} ${p}`);
  }
  // A still has its data.
  assert.equal((await call('a', 'GET', `/gk/establishments/${estId}`)).status, 200);
});
