'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// /api/fe — Financed Emissions (PCAF Part A) module, MVP slice.
//
// Portfolios & periods (FE-01), loan tape intake (FE-02/03), counterparties
// and sector mapping (FE-05), factor library (FE-E5), calculation runs
// (FE-06/07/10/14, P-12), dashboard (FE-11), review & audit (FE-26/27) and
// reports (FE-24/25).
//
// Every route is company-scoped (another tenant's ids answer 404) and gated
// by the financed_emissions module entitlement.  Periods that are IN_REVIEW
// or LOCKED are read-only for data writes (409).  Approve / reject / reopen
// and name-revealing exports need role ADMIN (the portal has ADMIN/CUSTOM
// roles only; finer FE roles are a later story).
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const multer = require('multer');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { requireModule } = require('../middleware/module');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const pcaf = require('../services/fe/pcaf');
const nace = require('../services/fe/nace');
const metrics = require('../services/fe/metrics');
const loanTape = require('../services/fe/loanTape');
const factorLib = require('../services/fe/factors');
const runService = require('../services/fe/run');
const report = require('../services/fe/report');

router.use(authenticate, requireModule('financed_emissions'));

const FILE_EXT = /\.(csv|txt|xlsx|xls)$/i;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, FILE_EXT.test(file.originalname)),
});
const STATUSES = ['OPEN', 'IN_REVIEW', 'LOCKED'];
const EMISSION_SOURCES = pcaf.EMISSION_SOURCES;
const PAGE_MAX = 500;

function sendError(res, err) {
  if (err && err.status && !err.code) return res.status(err.status).json({ error: err.message });
  const { status, error } = formatError(err);
  res.status(status).json({ error });
}

// ─── Validation helpers ─────────────────────────────────────────────────────

const has = (b, k) => Object.prototype.hasOwnProperty.call(b || {}, k);
const num = (v) => (v === '' || v == null ? null : Number(v));
const str = (v, max = 200) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const isAdmin = (req) => req.user.role === 'ADMIN';
const page = (q) => {
  const size = Math.min(Math.max(parseInt(q.pageSize, 10) || 50, 1), PAGE_MAX);
  const p = Math.max(parseInt(q.page, 10) || 1, 1);
  return { take: size, skip: (p - 1) * size, page: p, pageSize: size };
};

// Non-negative optional number fields → { data, errors }.
function numbers(body, keys, errors, data, { positive = [] } = {}) {
  for (const k of keys) {
    if (!has(body, k)) continue;
    const v = num(body[k]);
    if (v != null && !isFinite(v)) errors.push(`${k} must be a number.`);
    else if (v != null && v < 0) errors.push(`${k} must not be negative.`);
    else if (v != null && positive.includes(k) && v === 0) errors.push(`${k} must be greater than 0.`);
    else data[k] = v;
  }
}

function parsePortfolio(body, partial = false) {
  const errors = []; const data = {};
  if (!partial || has(body, 'name')) {
    data.name = str(body.name);
    if (!data.name) errors.push('name is required.');
  }
  if (has(body, 'legalEntity')) data.legalEntity = str(body.legalEntity);
  if (has(body, 'fxSource')) data.fxSource = str(body.fxSource);
  if (has(body, 'baseCurrency') || !partial) {
    data.baseCurrency = String(body.baseCurrency || 'AMD').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(data.baseCurrency)) errors.push('baseCurrency must be a 3-letter currency code.');
  }
  if (has(body, 'assetClasses') || !partial) {
    const list = Array.isArray(body.assetClasses) ? [...new Set(body.assetClasses)] : ['business_loans', 'commercial_re', 'mortgages'];
    const bad = list.filter((c) => !pcaf.ASSET_CLASSES.includes(c));
    if (bad.length) errors.push(`Unknown asset class(es): ${bad.join(', ')}.`);
    if (!list.length) errors.push('Choose at least one asset class.');
    data.assetClasses = list;
  }
  if (has(body, 'inflationAdjust')) data.inflationAdjust = !!body.inflationAdjust;
  return { data, errors };
}

function parsePeriod(body, partial = false) {
  const errors = []; const data = {};
  if (!partial || has(body, 'name')) {
    data.name = str(body.name, 60);
    if (!data.name) errors.push('name is required.');
  }
  if (!partial || has(body, 'reportingDate')) {
    const d = body.reportingDate ? new Date(body.reportingDate) : null;
    if (!d || isNaN(d.getTime())) errors.push('reportingDate must be a valid date.');
    else data.reportingDate = d;
  }
  numbers(body, ['ledgerTotal'], errors, data);
  return { data, errors };
}

// ─── Scoped lookups ─────────────────────────────────────────────────────────

const findPortfolio = (req, id) => prisma.fePortfolio.findFirst({ where: { id, companyId: req.user.companyId } });
const findPeriod = (req, id) => prisma.fePeriod.findFirst({ where: { id, portfolio: { companyId: req.user.companyId } }, include: { portfolio: true } });
const findRun = (req, id) => prisma.feCalcRun.findFirst({ where: { id, period: { portfolio: { companyId: req.user.companyId } } }, include: { period: { include: { portfolio: true } } } });
const findCounterparty = (req, id) => prisma.feCounterparty.findFirst({ where: { id, companyId: req.user.companyId } });
const notFound = (res, what) => res.status(404).json({ error: `${what} not found.` });

// Data writes are only allowed while the period is OPEN.
function blockIfFrozen(res, period) {
  if (period.status === 'OPEN') return false;
  const locked = period.status === 'LOCKED';
  res.status(409).json({
    error: locked ? 'This period is locked; reopen it (with a reason) to make changes.' : 'This period is in review; reject it back to Open to make changes.',
    code: locked ? 'PERIOD_LOCKED' : 'PERIOD_IN_REVIEW',
  });
  return true;
}

// A counterparty change can only affect periods it appears in; refuse when
// all of those are in review or locked.
async function counterpartyFrozen(cpId) {
  const periods = await prisma.fePeriod.findMany({ where: { exposures: { some: { counterpartyId: cpId } } }, select: { status: true } });
  return periods.length > 0 && !periods.some((p) => p.status === 'OPEN');
}

async function latestRun(periodId) {
  return prisma.feCalcRun.findFirst({ where: { periodId, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } });
}

async function sectorMapFor(companyId) {
  const rows = await prisma.feSectorMap.findMany({ where: { companyId } });
  return new Map(rows.map((m) => [m.code.toUpperCase(), m.factorKey]));
}

function csv(res, name, body) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(body);
}

// Reconciliation of loan tape totals against the period's ledger figure.
async function reconciliation(period) {
  const agg = await prisma.feExposure.aggregate({ where: { periodId: period.id }, _sum: { outstanding: true }, _count: true });
  const total = agg._sum.outstanding || 0;
  const ledger = period.ledgerTotal;
  return {
    lines: agg._count,
    periodOutstanding: total,
    ledgerTotal: ledger,
    difference: ledger == null ? null : total - ledger,
    differencePct: ledger ? ((total - ledger) / ledger) * 100 : null,
  };
}

// ─── Reference data ─────────────────────────────────────────────────────────

router.get('/meta', (_req, res) => {
  res.json({
    assetClasses: pcaf.ASSET_CLASSES,
    tapeColumns: Object.fromEntries(loanTape.TAPE_CLASSES.map((c) => [c, loanTape.templateColumns(c)])),
    requiredColumns: Object.fromEntries(loanTape.TAPE_CLASSES.map((c) => [c, loanTape.COLUMNS.filter((x) => (x.required || []).includes(c)).map((x) => x.key)])),
    factorKinds: pcaf.FACTOR_KINDS,
    factorColumns: factorLib.FACTOR_COLUMNS,
    emissionSources: EMISSION_SOURCES,
    naceSections: nace.SECTIONS.map(([code, , , name]) => ({ code, name })),
    sectorLabels: report.SECTOR_LABELS,
    methodologyVersion: pcaf.METHODOLOGY_VERSION,
    uploadPolicy: 'partial',
  });
});

router.get('/templates/:assetClass', (req, res) => {
  if (!loanTape.TAPE_CLASSES.includes(req.params.assetClass)) return notFound(res, 'Template');
  csv(res, `fe-loan-tape-${req.params.assetClass}.csv`, loanTape.templateCsv(req.params.assetClass));
});

// ─── Portfolios (FE-01) ─────────────────────────────────────────────────────

router.get('/portfolios', async (req, res) => {
  try {
    const list = await prisma.fePortfolio.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { createdAt: 'asc' },
      include: { periods: { orderBy: { reportingDate: 'desc' }, select: { id: true, name: true, reportingDate: true, status: true, ledgerTotal: true } } },
    });
    res.json(list);
  } catch (err) { sendError(res, err); }
});

router.post('/portfolios', async (req, res) => {
  try {
    const { data, errors } = parsePortfolio(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    const p = await prisma.fePortfolio.create({ data: { ...data, companyId: req.user.companyId } });
    logActivity(req.user.id, req.user.companyId, 'FE_PORTFOLIO_CREATE', `Created portfolio ${p.name}`, { portfolioId: p.id }, req.ip);
    res.status(201).json(p);
  } catch (err) { sendError(res, err); }
});

router.get('/portfolios/:id', async (req, res) => {
  try {
    const p = await prisma.fePortfolio.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: { periods: { orderBy: { reportingDate: 'desc' } } },
    });
    if (!p) return notFound(res, 'Portfolio');
    res.json(p);
  } catch (err) { sendError(res, err); }
});

router.put('/portfolios/:id', async (req, res) => {
  try {
    const p = await findPortfolio(req, req.params.id);
    if (!p) return notFound(res, 'Portfolio');
    const { data, errors } = parsePortfolio(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    // Base currency drives every calculation: frozen once a period is locked.
    if (data.baseCurrency && data.baseCurrency !== p.baseCurrency
      && await prisma.fePeriod.count({ where: { portfolioId: p.id, status: { not: 'OPEN' } } })) {
      return res.status(409).json({ error: 'Base currency cannot change while a period is in review or locked.', code: 'PERIOD_LOCKED' });
    }
    const updated = await prisma.fePortfolio.update({ where: { id: p.id }, data });
    logActivity(req.user.id, req.user.companyId, 'FE_PORTFOLIO_UPDATE', `Updated portfolio ${updated.name}`, { portfolioId: p.id }, req.ip);
    res.json(updated);
  } catch (err) { sendError(res, err); }
});

router.delete('/portfolios/:id', async (req, res) => {
  try {
    const p = await findPortfolio(req, req.params.id);
    if (!p) return notFound(res, 'Portfolio');
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    if (await prisma.fePeriod.count({ where: { portfolioId: p.id, status: { not: 'OPEN' } } })) {
      return res.status(409).json({ error: 'A portfolio with periods in review or locked cannot be deleted.', code: 'PERIOD_LOCKED' });
    }
    await prisma.fePortfolio.delete({ where: { id: p.id } });
    logActivity(req.user.id, req.user.companyId, 'FE_PORTFOLIO_DELETE', `Deleted portfolio ${p.name}`, { portfolioId: p.id }, req.ip);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// ─── Periods (FE-01) ────────────────────────────────────────────────────────

router.post('/portfolios/:id/periods', async (req, res) => {
  try {
    const p = await findPortfolio(req, req.params.id);
    if (!p) return notFound(res, 'Portfolio');
    const { data, errors } = parsePeriod(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    const period = await prisma.fePeriod.create({ data: { ...data, portfolioId: p.id } });
    logActivity(req.user.id, req.user.companyId, 'FE_PERIOD_CREATE', `Created period ${period.name} in ${p.name}`, { periodId: period.id }, req.ip);
    res.status(201).json(period);
  } catch (err) { sendError(res, err); }
});

router.get('/periods/:id', async (req, res) => {
  try {
    const period = await findPeriod(req, req.params.id);
    if (!period) return notFound(res, 'Period');
    const [byClass, recon, run, uploads] = await Promise.all([
      prisma.feExposure.groupBy({ by: ['assetClass'], where: { periodId: period.id }, _sum: { outstanding: true }, _count: true }),
      reconciliation(period),
      latestRun(period.id),
      prisma.feUpload.count({ where: { periodId: period.id } }),
    ]);
    res.json({
      ...period,
      byAssetClass: byClass.map((g) => ({ assetClass: g.assetClass, lines: g._count, outstanding: g._sum.outstanding || 0 })),
      reconciliation: recon,
      uploads,
      latestRun: run ? { id: run.id, createdAt: run.createdAt, inputsHash: run.inputsHash, outputsHash: run.outputsHash, totals: run.totals, factorSetVersion: run.factorSetVersion } : null,
    });
  } catch (err) { sendError(res, err); }
});

router.put('/periods/:id', async (req, res) => {
  try {
    const period = await findPeriod(req, req.params.id);
    if (!period) return notFound(res, 'Period');
    if (blockIfFrozen(res, period)) return;
    const { data, errors } = parsePeriod(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    const updated = await prisma.fePeriod.update({ where: { id: period.id }, data });
    logActivity(req.user.id, req.user.companyId, 'FE_PERIOD_UPDATE', `Updated period ${updated.name}`, { periodId: period.id }, req.ip);
    res.json(updated);
  } catch (err) { sendError(res, err); }
});

router.delete('/periods/:id', async (req, res) => {
  try {
    const period = await findPeriod(req, req.params.id);
    if (!period) return notFound(res, 'Period');
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    if (blockIfFrozen(res, period)) return;
    await prisma.fePeriod.delete({ where: { id: period.id } });
    logActivity(req.user.id, req.user.companyId, 'FE_PERIOD_DELETE', `Deleted period ${period.name}`, { periodId: period.id }, req.ip);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// ─── Loan tape intake (FE-02 / FE-03) ───────────────────────────────────────

router.post('/periods/:id/uploads', upload.single('file'), async (req, res) => {
  try {
    const period = await findPeriod(req, req.params.id);
    if (!period) return notFound(res, 'Period');
    if (blockIfFrozen(res, period)) return;
    const assetClass = req.body.assetClass;
    if (!loanTape.TAPE_CLASSES.includes(assetClass)) return res.status(400).json({ error: `assetClass must be one of: ${loanTape.TAPE_CLASSES.join(', ')}.` });
    if (period.portfolio.assetClasses.length && !period.portfolio.assetClasses.includes(assetClass)) {
      return res.status(400).json({ error: `${assetClass} is not in scope for this portfolio; add it in the portfolio settings.` });
    }
    if (!req.file) return res.status(400).json({ error: 'Attach a CSV or XLSX file.' });

    let parsed;
    try { parsed = loanTape.parseFile(req.file.buffer, req.file.originalname); } catch { return res.status(400).json({ error: 'The file could not be read as CSV or XLSX.' }); }
    if (!parsed.rows.length) return res.status(400).json({ error: 'The file has no data rows.' });
    if (parsed.rows.length > loanTape.MAX_ROWS) return res.status(400).json({ error: `At most ${loanTape.MAX_ROWS} rows per file.` });
    if (!parsed.header.some((h) => /facility/i.test(h))) return res.status(400).json({ error: 'Header row not recognised; start from the template.' });

    const companyId = req.user.companyId;
    const existingLines = await prisma.feExposure.findMany({ where: { periodId: period.id }, select: { id: true, facilityRef: true, assetClass: true } });
    const existing = new Map(existingLines.map((e) => [e.facilityRef, e.assetClass]));
    const existingId = new Map(existingLines.map((e) => [e.facilityRef, e.id]));
    const { valid, errors } = loanTape.validateRows(parsed.rows, assetClass, { existing });

    // Counterparties: only the pseudonymised stable id is stored (FE-03).
    const cpData = new Map();
    for (const { data } of valid) {
      if (!data.counterpartyId) continue;
      const stableId = data.counterpartyIsPseudonym ? data.counterpartyId : loanTape.stableIdFor(companyId, data.counterpartyId);
      data.stableId = stableId;
      const cur = cpData.get(stableId) || {};
      for (const k of ['naceCode', 'localSectorCode', 'revenue', 'revenueCurrency', 'equityPlusDebt']) if (data[k] != null) cur[k] = data[k];
      if (data.counterpartyName) cur.name = data.counterpartyName;
      if (data.country && ['business_loans', 'project_finance'].includes(assetClass)) cur.country = data.country;
      if (cur.revenue != null && !cur.revenueCurrency) cur.revenueCurrency = data.currency;
      cpData.set(stableId, cur);
    }

    const result = await prisma.$transaction(async (tx) => {
      const ids = [...cpData.keys()];
      const found = await tx.feCounterparty.findMany({ where: { companyId, stableId: { in: ids } } });
      const byStable = new Map(found.map((c) => [c.stableId, c]));
      const toCreate = ids.filter((s) => !byStable.has(s)).map((s) => ({ companyId, stableId: s, ...cpData.get(s) }));
      if (toCreate.length) await tx.feCounterparty.createMany({ data: toCreate, skipDuplicates: true });
      for (const c of found) {
        const d = cpData.get(c.stableId);
        const changed = Object.keys(d).some((k) => d[k] !== c[k]);
        if (changed) await tx.feCounterparty.update({ where: { id: c.id }, data: d });
      }
      const all = await tx.feCounterparty.findMany({ where: { companyId, stableId: { in: ids } }, select: { id: true, stableId: true } });
      const cpId = new Map(all.map((c) => [c.stableId, c.id]));

      const toInsert = []; let updated = 0;
      for (const { rowNumber, data } of valid) {
        const line = {
          counterpartyId: data.stableId ? cpId.get(data.stableId) : null,
          assetClass,
          outstanding: data.outstanding,
          undrawn: data.undrawn ?? null,
          currency: data.currency,
          originationDate: data.originationDate ?? null,
          valueAtOrigination: data.valueAtOrigination ?? null,
          branch: data.branch ?? null,
          segment: data.segment ?? null,
          relationshipManager: data.relationshipManager ?? null,
          propertyType: data.propertyType ?? null,
          floorAreaM2: data.floorAreaM2 ?? null,
          energyKwh: data.energyKwh ?? null,
          energyLabel: data.energyLabel ?? null,
          country: data.country ?? null,
          rowNumber,
        };
        if (existingId.has(data.facilityRef)) {
          await tx.feExposure.update({ where: { id: existingId.get(data.facilityRef) }, data: line });
          updated += 1;
        } else {
          toInsert.push({ ...line, periodId: period.id, facilityRef: data.facilityRef });
        }
      }
      for (let i = 0; i < toInsert.length; i += 1000) await tx.feExposure.createMany({ data: toInsert.slice(i, i + 1000) });

      const up = await tx.feUpload.create({
        data: {
          periodId: period.id,
          assetClass,
          fileName: String(req.file.originalname).slice(0, 200),
          totalRows: parsed.rows.length,
          acceptedRows: valid.length,
          rejectedRows: parsed.rows.length - valid.length,
          totalOutstanding: valid.reduce((s, v) => s + (v.data.outstanding || 0), 0),
          errors: errors.slice(0, 5000),
          uploadedById: req.user.id,
        },
      });
      if (toInsert.length || updated) {
        await tx.feExposure.updateMany({ where: { periodId: period.id, facilityRef: { in: valid.map((v) => v.data.facilityRef) } }, data: { uploadId: up.id } });
      }
      return { upload: up, created: toInsert.length, updated, counterpartiesCreated: toCreate.length };
    }, { timeout: 120000 });

    logActivity(req.user.id, companyId, 'FE_TAPE_UPLOAD', `Uploaded ${assetClass} tape ${result.upload.fileName}: ${valid.length} accepted, ${result.upload.rejectedRows} rejected`, { periodId: period.id, uploadId: result.upload.id }, req.ip);
    const { errors: _e, ...uploadRow } = result.upload;
    res.status(201).json({
      upload: uploadRow,
      created: result.created,
      updated: result.updated,
      counterpartiesCreated: result.counterpartiesCreated,
      errors: errors.slice(0, 200),
      errorCount: errors.length,
      unknownColumns: parsed.unknown,
      reconciliation: { uploadOutstanding: result.upload.totalOutstanding, ...(await reconciliation(period)) },
    });
  } catch (err) { sendError(res, err); }
});

router.get('/periods/:id/uploads', async (req, res) => {
  try {
    const period = await findPeriod(req, req.params.id);
    if (!period) return notFound(res, 'Period');
    const list = await prisma.feUpload.findMany({
      where: { periodId: period.id }, orderBy: { createdAt: 'desc' },
      select: { id: true, assetClass: true, fileName: true, totalRows: true, acceptedRows: true, rejectedRows: true, totalOutstanding: true, uploadedById: true, createdAt: true },
    });
    res.json({ uploads: list, reconciliation: await reconciliation(period) });
  } catch (err) { sendError(res, err); }
});

router.get('/uploads/:id/errors.csv', async (req, res) => {
  try {
    const up = await prisma.feUpload.findFirst({ where: { id: req.params.id, period: { portfolio: { companyId: req.user.companyId } } } });
    if (!up) return notFound(res, 'Upload');
    csv(res, `fe-upload-errors-${up.id.slice(0, 8)}.csv`, loanTape.errorsCsv(up.errors || []));
  } catch (err) { sendError(res, err); }
});

// ─── Exposures (lines) ──────────────────────────────────────────────────────

router.get('/periods/:id/exposures', async (req, res) => {
  try {
    const period = await findPeriod(req, req.params.id);
    if (!period) return notFound(res, 'Period');
    const { take, skip, page: p, pageSize } = page(req.query);
    const where = { periodId: period.id };
    if (req.query.assetClass) where.assetClass = String(req.query.assetClass);
    if (req.query.q) where.facilityRef = { contains: String(req.query.q), mode: 'insensitive' };
    const [rows, total] = await Promise.all([
      prisma.feExposure.findMany({ where, take, skip, orderBy: { facilityRef: 'asc' }, include: { counterparty: { select: { id: true, stableId: true, name: true, naceCode: true } } } }),
      prisma.feExposure.count({ where }),
    ]);
    res.json({ rows, total, page: p, pageSize });
  } catch (err) { sendError(res, err); }
});

const EXPOSURE_EDITABLE = ['outstanding', 'undrawn', 'valueAtOrigination', 'floorAreaM2', 'energyKwh'];

async function findExposure(req, id) {
  return prisma.feExposure.findFirst({ where: { id, period: { portfolio: { companyId: req.user.companyId } } }, include: { period: true } });
}

router.put('/exposures/:id', async (req, res) => {
  try {
    const e = await findExposure(req, req.params.id);
    if (!e) return notFound(res, 'Line');
    if (blockIfFrozen(res, e.period)) return;
    const errors = []; const data = {};
    numbers(req.body, EXPOSURE_EDITABLE, errors, data, { positive: ['valueAtOrigination'] });
    if (has(req.body, 'outstanding') && data.outstanding == null) errors.push('outstanding is required.');
    for (const k of ['propertyType', 'energyLabel', 'branch', 'segment']) if (has(req.body, k)) data[k] = str(req.body[k]);
    if (data.energyLabel) data.energyLabel = data.energyLabel.toUpperCase();
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    const updated = await prisma.feExposure.update({ where: { id: e.id }, data });
    logActivity(req.user.id, req.user.companyId, 'FE_LINE_UPDATE', `Edited line ${e.facilityRef}`, { exposureId: e.id, fields: Object.keys(data) }, req.ip);
    res.json(updated);
  } catch (err) { sendError(res, err); }
});

router.delete('/exposures/:id', async (req, res) => {
  try {
    const e = await findExposure(req, req.params.id);
    if (!e) return notFound(res, 'Line');
    if (blockIfFrozen(res, e.period)) return;
    await prisma.feExposure.delete({ where: { id: e.id } });
    logActivity(req.user.id, req.user.companyId, 'FE_LINE_DELETE', `Deleted line ${e.facilityRef}`, { exposureId: e.id }, req.ip);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// Line drawer: inputs → factor (set / version / source) → attribution →
// result → explanation, for the latest (or a given) run.
router.get('/exposures/:id/lineage', async (req, res) => {
  try {
    const e = await prisma.feExposure.findFirst({
      where: { id: req.params.id, period: { portfolio: { companyId: req.user.companyId } } },
      include: { period: { include: { portfolio: true } }, counterparty: { include: { emissions: { orderBy: { year: 'desc' } } } } },
    });
    if (!e) return notFound(res, 'Line');
    const run = req.query.runId
      ? await prisma.feCalcRun.findFirst({ where: { id: String(req.query.runId), periodId: e.periodId } })
      : await latestRun(e.periodId);
    const result = run ? await prisma.feLineResult.findFirst({ where: { runId: run.id, exposureId: e.id } }) : null;
    let factor = null; let factorSet = null;
    if (run && run.factorSetId) {
      factorSet = await prisma.feFactorSet.findUnique({ where: { id: run.factorSetId }, select: { id: true, name: true, version: true, source: true, illustrative: true } });
      const m = result && result.method && result.method.match(/@([a-z_]+):(.+)$/);
      if (m) factor = await prisma.feFactor.findMany({ where: { setId: run.factorSetId, kind: m[1], key: m[2] } });
    }
    const corporate = ['business_loans', 'project_finance'].includes(e.assetClass);
    res.json({
      exposure: e,
      counterparty: e.counterparty,
      attributionInputs: {
        numerator: e.outstanding,
        denominatorLabel: corporate ? 'equityPlusDebt' : 'valueAtOrigination',
        denominator: corporate ? e.counterparty?.equityPlusDebt ?? null : e.valueAtOrigination,
      },
      run: run ? { id: run.id, createdAt: run.createdAt, methodologyVersion: run.methodologyVersion, factorSetVersion: run.factorSetVersion, inputsHash: run.inputsHash, outputsHash: run.outputsHash } : null,
      factorSet: factorSet || (run && run.totals ? run.totals.factorSet : null),
      factor,
      result,
    });
  } catch (err) { sendError(res, err); }
});

// ─── Counterparties (FE-03 / FE-05) ─────────────────────────────────────────

router.get('/counterparties', async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const where = { companyId };
    if (req.query.q) {
      const q = String(req.query.q);
      where.OR = [{ stableId: { startsWith: q.toLowerCase() } }, { name: { contains: q, mode: 'insensitive' } }, { naceCode: { startsWith: q.toUpperCase() } }];
    }
    let rows = await prisma.feCounterparty.findMany({ where, orderBy: [{ name: 'asc' }, { stableId: 'asc' }], include: { _count: { select: { exposures: true, emissions: true } } } });
    const map = await sectorMapFor(companyId);
    rows = rows.map((c) => ({ ...c, mapped: pcaf.resolveSector(c, map).mapped }));
    if (req.query.unmapped === '1') rows = rows.filter((c) => !c.mapped);
    const total = rows.length;
    const { take, skip, page: p, pageSize } = page(req.query);
    rows = rows.slice(skip, skip + take);

    // Latest data-quality score: best score of the counterparty's lines in
    // the most recent run of each period.
    const periods = await prisma.fePeriod.findMany({ where: { portfolio: { companyId } }, select: { id: true } });
    const runs = (await Promise.all(periods.map((x) => latestRun(x.id)))).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
    const dq = new Map();
    if (runs.length && rows.length) {
      const results = await prisma.feLineResult.findMany({
        where: { runId: { in: runs.map((r) => r.id) }, exposure: { counterpartyId: { in: rows.map((c) => c.id) } } },
        select: { runId: true, dqScore: true, exposure: { select: { counterpartyId: true } } },
      });
      const order = new Map(runs.map((r, i) => [r.id, i]));
      for (const r of results.sort((a, b) => order.get(a.runId) - order.get(b.runId))) {
        const k = r.exposure.counterpartyId;
        const cur = dq.get(k);
        if (!cur) dq.set(k, { run: r.runId, score: r.dqScore });
        else if (cur.run === r.runId && r.dqScore != null && (cur.score == null || r.dqScore < cur.score)) cur.score = r.dqScore;
      }
    }
    res.json({ rows: rows.map((c) => ({ ...c, latestDq: dq.get(c.id)?.score ?? null })), total, page: p, pageSize });
  } catch (err) { sendError(res, err); }
});

router.get('/counterparties/:id', async (req, res) => {
  try {
    const c = await prisma.feCounterparty.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: { emissions: { orderBy: [{ year: 'desc' }, { createdAt: 'desc' }] }, exposures: { select: { id: true, facilityRef: true, assetClass: true, outstanding: true, currency: true, period: { select: { id: true, name: true, status: true } } } } },
    });
    if (!c) return notFound(res, 'Counterparty');
    res.json({ ...c, frozen: await counterpartyFrozen(c.id) });
  } catch (err) { sendError(res, err); }
});

router.put('/counterparties/:id', async (req, res) => {
  try {
    const c = await findCounterparty(req, req.params.id);
    if (!c) return notFound(res, 'Counterparty');
    if (await counterpartyFrozen(c.id)) return res.status(409).json({ error: 'This counterparty only appears in periods that are in review or locked.', code: 'PERIOD_LOCKED' });
    const errors = []; const data = {};
    numbers(req.body, ['revenue', 'equityPlusDebt'], errors, data, { positive: ['equityPlusDebt'] });
    for (const k of ['name', 'localSectorCode']) if (has(req.body, k)) data[k] = str(req.body[k]);
    if (has(req.body, 'naceCode')) {
      data.naceCode = str(req.body.naceCode) ? String(req.body.naceCode).trim().toUpperCase() : null;
      if (data.naceCode && !nace.parse(data.naceCode)) errors.push('naceCode is not a NACE Rev.2 code (e.g. 55.10, 55 or I).');
    }
    if (has(req.body, 'country')) {
      data.country = str(req.body.country) ? String(req.body.country).trim().toUpperCase() : null;
      if (data.country && !/^[A-Z]{2}$/.test(data.country)) errors.push('country must be a 2-letter code.');
    }
    if (has(req.body, 'revenueCurrency')) {
      data.revenueCurrency = str(req.body.revenueCurrency) ? String(req.body.revenueCurrency).trim().toUpperCase() : null;
      if (data.revenueCurrency && !/^[A-Z]{3}$/.test(data.revenueCurrency)) errors.push('revenueCurrency must be a 3-letter code.');
    }
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    const updated = await prisma.feCounterparty.update({ where: { id: c.id }, data });
    logActivity(req.user.id, req.user.companyId, 'FE_COUNTERPARTY_UPDATE', `Edited counterparty ${c.stableId.slice(0, 10)}`, { counterpartyId: c.id, fields: Object.keys(data) }, req.ip);
    res.json(updated);
  } catch (err) { sendError(res, err); }
});

router.post('/counterparties/:id/emissions', async (req, res) => {
  try {
    const c = await findCounterparty(req, req.params.id);
    if (!c) return notFound(res, 'Counterparty');
    if (await counterpartyFrozen(c.id)) return res.status(409).json({ error: 'This counterparty only appears in periods that are in review or locked.', code: 'PERIOD_LOCKED' });
    const b = req.body || {};
    const errors = []; const data = {};
    const year = parseInt(b.year, 10);
    if (!year || year < 1990 || year > new Date().getUTCFullYear()) errors.push('year is required and cannot be in the future.');
    if (!EMISSION_SOURCES.includes(b.source)) errors.push(`source must be one of: ${EMISSION_SOURCES.join(', ')}.`);
    numbers(b, ['scope1', 'scope2', 'scope3'], errors, data);
    if (data.scope1 == null && data.scope2 == null) errors.push('Give Scope 1 and/or Scope 2 emissions (tCO2e).');
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    const rec = await prisma.feCounterpartyEmissions.create({
      data: { counterpartyId: c.id, year, source: b.source, verified: b.source === 'reported' && !!b.verified, ...data, notes: str(b.notes, 500) },
    });
    logActivity(req.user.id, req.user.companyId, 'FE_EMISSIONS_ADD', `Added ${b.source} emissions ${year} for counterparty ${c.stableId.slice(0, 10)}`, { counterpartyId: c.id, recordId: rec.id }, req.ip);
    res.status(201).json(rec);
  } catch (err) { sendError(res, err); }
});

router.delete('/counterparties/:id/emissions/:eid', async (req, res) => {
  try {
    const c = await findCounterparty(req, req.params.id);
    if (!c) return notFound(res, 'Counterparty');
    const rec = await prisma.feCounterpartyEmissions.findFirst({ where: { id: req.params.eid, counterpartyId: c.id } });
    if (!rec) return notFound(res, 'Emissions record');
    if (await counterpartyFrozen(c.id)) return res.status(409).json({ error: 'This counterparty only appears in periods that are in review or locked.', code: 'PERIOD_LOCKED' });
    await prisma.feCounterpartyEmissions.delete({ where: { id: rec.id } });
    logActivity(req.user.id, req.user.companyId, 'FE_EMISSIONS_DELETE', `Deleted emissions ${rec.year} for counterparty ${c.stableId.slice(0, 10)}`, { counterpartyId: c.id }, req.ip);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// ─── Sector mapping & unmapped queue (FE-05) ────────────────────────────────

router.get('/sector-map', async (req, res) => {
  try {
    res.json(await prisma.feSectorMap.findMany({ where: { companyId: req.user.companyId }, orderBy: { code: 'asc' } }));
  } catch (err) { sendError(res, err); }
});

// Codes used by counterparties of corporate lines that cannot be matched.
router.get('/periods/:id/unmapped', async (req, res) => {
  try {
    const period = await findPeriod(req, req.params.id);
    if (!period) return notFound(res, 'Period');
    const map = await sectorMapFor(req.user.companyId);
    const lines = await prisma.feExposure.findMany({
      where: { periodId: period.id, assetClass: { in: ['business_loans', 'project_finance'] } },
      select: { outstanding: true, counterparty: { select: { id: true, naceCode: true, localSectorCode: true } } },
    });
    const groups = new Map();
    for (const l of lines) {
      if (!l.counterparty || pcaf.resolveSector(l.counterparty, map).mapped) continue;
      const code = (l.counterparty.localSectorCode || l.counterparty.naceCode || '').toUpperCase();
      const g = groups.get(code) || { code, counterparties: new Set(), lines: 0, outstanding: 0 };
      g.counterparties.add(l.counterparty.id); g.lines += 1; g.outstanding += l.outstanding || 0;
      groups.set(code, g);
    }
    res.json([...groups.values()].map((g) => ({ ...g, counterparties: g.counterparties.size })).sort((a, b) => b.outstanding - a.outstanding));
  } catch (err) { sendError(res, err); }
});

// Bulk map { mappings: [{ code, factorKey }], periodId? }.  When a period is
// given (the unmapped queue), it must be open.
router.post('/sector-map', async (req, res) => {
  try {
    const companyId = req.user.companyId;
    if (req.body.periodId) {
      const period = await findPeriod(req, String(req.body.periodId));
      if (!period) return notFound(res, 'Period');
      if (blockIfFrozen(res, period)) return;
    }
    const list = Array.isArray(req.body.mappings) ? req.body.mappings : [];
    if (!list.length || list.length > 500) return res.status(400).json({ error: 'Send 1–500 mappings.' });
    const errors = [];
    const clean = list.map((m, i) => {
      const code = str(m && m.code, 40); const key = str(m && m.factorKey, 20);
      if (!code) errors.push(`Row ${i + 1}: code is required (counterparties with no code need a NACE code instead).`);
      const parsed = key && nace.parse(key);
      if (!parsed) errors.push(`Row ${i + 1}: "${key || ''}" is not a NACE Rev.2 code.`);
      return { code: code && code.toUpperCase(), factorKey: parsed ? (parsed.division ? parsed.code : parsed.section) : null };
    });
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    await prisma.$transaction(clean.map((m) => prisma.feSectorMap.upsert({
      where: { companyId_code: { companyId, code: m.code } },
      create: { companyId, ...m },
      update: { factorKey: m.factorKey },
    })));
    logActivity(req.user.id, companyId, 'FE_SECTOR_MAP', `Mapped ${clean.length} sector code(s)`, { mappings: clean }, req.ip);
    res.status(201).json({ saved: clean.length });
  } catch (err) { sendError(res, err); }
});

router.delete('/sector-map/:id', async (req, res) => {
  try {
    const m = await prisma.feSectorMap.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!m) return notFound(res, 'Mapping');
    await prisma.feSectorMap.delete({ where: { id: m.id } });
    logActivity(req.user.id, req.user.companyId, 'FE_SECTOR_UNMAP', `Removed mapping ${m.code} → ${m.factorKey}`, { code: m.code }, req.ip);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// ─── Factor library (FE-E5) ─────────────────────────────────────────────────

const setAccess = (req) => ({ OR: [{ companyId: req.user.companyId }, { companyId: null }] });

router.get('/factor-sets/template', (_req, res) => csv(res, 'fe-factor-template.csv', factorLib.factorTemplateCsv()));

router.get('/factor-sets', async (req, res) => {
  try {
    const sets = await prisma.feFactorSet.findMany({ where: setAccess(req), orderBy: { createdAt: 'desc' }, include: { _count: { select: { factors: true } } } });
    res.json(sets.map((s) => ({ ...s, global: s.companyId == null })));
  } catch (err) { sendError(res, err); }
});

router.get('/factor-sets/:id', async (req, res) => {
  try {
    const set = await prisma.feFactorSet.findFirst({ where: { id: req.params.id, ...setAccess(req) }, include: { factors: { orderBy: [{ kind: 'asc' }, { key: 'asc' }] } } });
    if (!set) return notFound(res, 'Factor set');
    res.json({ ...set, global: set.companyId == null, usedByRuns: await prisma.feCalcRun.count({ where: { factorSetId: set.id } }) });
  } catch (err) { sendError(res, err); }
});

router.post('/factor-sets', async (req, res) => {
  try {
    const name = str(req.body.name, 120); const version = str(req.body.version, 40); const source = str(req.body.source, 500);
    const errors = [];
    if (!name) errors.push('name is required.');
    if (!version) errors.push('version is required.');
    if (!source) errors.push('source is required (publisher, table, year).');
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    const set = await prisma.feFactorSet.create({ data: { companyId: req.user.companyId, name, version, source, illustrative: !!req.body.illustrative } });
    logActivity(req.user.id, req.user.companyId, 'FE_FACTOR_SET_CREATE', `Created factor set ${name} v${version}`, { setId: set.id }, req.ip);
    res.status(201).json(set);
  } catch (err) { sendError(res, err); }
});

// Upload factors (CSV/XLSX).  All-or-nothing; replaces the set's factors.
// A set used by a run is frozen — create a new version instead.
router.post('/factor-sets/:id/factors', upload.single('file'), async (req, res) => {
  try {
    const set = await prisma.feFactorSet.findFirst({ where: { id: req.params.id, ...setAccess(req) } });
    if (!set) return notFound(res, 'Factor set');
    if (set.companyId == null) return res.status(403).json({ error: 'Global factor sets are read-only.' });
    if (await prisma.feCalcRun.count({ where: { factorSetId: set.id } })) {
      return res.status(409).json({ error: 'This factor set was used by a calculation run; create a new version instead.', code: 'FACTOR_SET_IN_USE' });
    }
    if (!req.file) return res.status(400).json({ error: 'Attach a CSV or XLSX file.' });
    let parsed;
    try { parsed = factorLib.parseFactorFile(req.file.buffer, req.file.originalname); } catch { return res.status(400).json({ error: 'The file could not be read.' }); }
    if (parsed.errors.length) return res.status(400).json({ error: `${parsed.errors.length} row(s) have errors; nothing was imported.`, rowErrors: parsed.errors.slice(0, 200) });
    if (!parsed.factors.length) return res.status(400).json({ error: 'The file has no factor rows.' });
    await prisma.$transaction([
      prisma.feFactor.deleteMany({ where: { setId: set.id } }),
      prisma.feFactor.createMany({ data: parsed.factors.map((f) => ({ ...f, setId: set.id })) }),
    ]);
    logActivity(req.user.id, req.user.companyId, 'FE_FACTORS_UPLOAD', `Uploaded ${parsed.factors.length} factors to ${set.name} v${set.version}`, { setId: set.id }, req.ip);
    res.status(201).json({ imported: parsed.factors.length });
  } catch (err) { sendError(res, err); }
});

router.delete('/factor-sets/:id', async (req, res) => {
  try {
    const set = await prisma.feFactorSet.findFirst({ where: { id: req.params.id, ...setAccess(req) } });
    if (!set) return notFound(res, 'Factor set');
    if (set.companyId == null) return res.status(403).json({ error: 'Global factor sets are read-only.' });
    if (await prisma.feCalcRun.count({ where: { factorSetId: set.id } })) {
      return res.status(409).json({ error: 'This factor set was used by a calculation run and is kept for reproducibility.', code: 'FACTOR_SET_IN_USE' });
    }
    await prisma.feFactorSet.delete({ where: { id: set.id } });
    logActivity(req.user.id, req.user.companyId, 'FE_FACTOR_SET_DELETE', `Deleted factor set ${set.name} v${set.version}`, { setId: set.id }, req.ip);
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// ─── Calculation runs (FE-06/07/10, P-12) ───────────────────────────────────

const runSummary = (r) => ({
  id: r.id, periodId: r.periodId, status: r.status, methodologyVersion: r.methodologyVersion, factorSetId: r.factorSetId,
  factorSetVersion: r.factorSetVersion, inputsHash: r.inputsHash, outputsHash: r.outputsHash, totals: r.totals, createdById: r.createdById, createdAt: r.createdAt,
});

router.post('/periods/:id/runs', async (req, res) => {
  try {
    const period = await findPeriod(req, req.params.id);
    if (!period) return notFound(res, 'Period');
    if (blockIfFrozen(res, period)) return;
    if (!await prisma.feExposure.count({ where: { periodId: period.id } })) return res.status(400).json({ error: 'Upload a loan tape before running a calculation.' });
    const run = await runService.runPeriod({
      period, portfolio: period.portfolio, companyId: req.user.companyId, factorSetId: req.body && req.body.factorSetId ? String(req.body.factorSetId) : null, userId: req.user.id,
    });
    logActivity(req.user.id, req.user.companyId, 'FE_RUN', `Calculated ${period.name}: ${run.totals.absoluteFinanced} tCO2e, coverage ${run.totals.coveragePct}%`, { periodId: period.id, runId: run.id, inputsHash: run.inputsHash }, req.ip);
    res.status(201).json(runSummary(run));
  } catch (err) { sendError(res, err); }
});

router.get('/periods/:id/runs', async (req, res) => {
  try {
    const period = await findPeriod(req, req.params.id);
    if (!period) return notFound(res, 'Period');
    const runs = await prisma.feCalcRun.findMany({ where: { periodId: period.id }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json(runs.map(runSummary));
  } catch (err) { sendError(res, err); }
});

router.get('/runs/:id', async (req, res) => {
  try {
    const run = await findRun(req, req.params.id);
    if (!run) return notFound(res, 'Run');
    res.json({ ...runSummary(run), period: { id: run.period.id, name: run.period.name, status: run.period.status } });
  } catch (err) { sendError(res, err); }
});

router.get('/runs/:id/results', async (req, res) => {
  try {
    const run = await findRun(req, req.params.id);
    if (!run) return notFound(res, 'Run');
    const { take, skip, page: p, pageSize } = page(req.query);
    const where = { runId: run.id };
    if (req.query.exceptions === '1') where.exception = { not: null };
    if (req.query.assetClass) where.exposure = { assetClass: String(req.query.assetClass) };
    const [rows, total] = await Promise.all([
      prisma.feLineResult.findMany({
        where, take, skip, orderBy: { exposure: { facilityRef: 'asc' } },
        include: { exposure: { select: { id: true, facilityRef: true, assetClass: true, outstanding: true, currency: true, branch: true, segment: true, counterparty: { select: { id: true, stableId: true, name: true } } } } },
      }),
      prisma.feLineResult.count({ where }),
    ]);
    res.json({ rows, total, page: p, pageSize });
  } catch (err) { sendError(res, err); }
});

// Recompute in memory and compare hashes (allowed in any status).
router.post('/runs/:id/verify', async (req, res) => {
  try {
    const run = await findRun(req, req.params.id);
    if (!run) return notFound(res, 'Run');
    const r = await runService.compute({ period: run.period, portfolio: run.period.portfolio, companyId: req.user.companyId, factorSetId: run.factorSetId });
    const out = {
      runId: run.id,
      inputsMatch: r.inputsHash === run.inputsHash,
      outputsMatch: r.outputsHash === run.outputsHash,
      stored: { inputsHash: run.inputsHash, outputsHash: run.outputsHash },
      recomputed: { inputsHash: r.inputsHash, outputsHash: r.outputsHash, absoluteFinanced: r.totals.absoluteFinanced },
    };
    out.reproducible = out.inputsMatch && out.outputsMatch;
    logActivity(req.user.id, req.user.companyId, 'FE_RUN_VERIFY', `Verified run ${run.id.slice(0, 8)}: ${out.reproducible ? 'reproducible' : 'differs'}`, { runId: run.id, ...out }, req.ip);
    res.json(out);
  } catch (err) { sendError(res, err); }
});

// Flat line rows for exports and the dashboard.
async function flatLines(run, companyId) {
  const results = await prisma.feLineResult.findMany({
    where: { runId: run.id },
    include: { exposure: { select: { id: true, facilityRef: true, assetClass: true, outstanding: true, currency: true, branch: true, segment: true, counterparty: { select: { id: true, stableId: true, name: true, naceCode: true, localSectorCode: true } } } } },
  });
  const map = await sectorMapFor(companyId);
  return results.map((r) => {
    const e = r.exposure; const c = e.counterparty;
    return {
      exposureId: e.id, facilityRef: e.facilityRef, assetClass: e.assetClass, outstanding: e.outstanding, currency: e.currency,
      branch: e.branch, segment: e.segment, counterpartyId: c ? c.id : null, stableId: c ? c.stableId : null, name: c ? c.name : null,
      sector: pcaf.lineSector(e, pcaf.resolveSector(c, map)),
      unmapped: !!(r.exception && /not a valid NACE|no sector code/.test(r.exception)),
      attribution: r.attribution, financedScope1: r.financedScope1, financedScope2: r.financedScope2, financedTotal: r.financedTotal,
      undrawnFinanced: r.undrawnFinanced, dqScore: r.dqScore, method: r.method, explanation: r.explanation, exception: r.exception,
    };
  }).sort((a, b) => (a.facilityRef < b.facilityRef ? -1 : 1));
}

router.get('/runs/:id/exceptions.csv', async (req, res) => {
  try {
    const run = await findRun(req, req.params.id);
    if (!run) return notFound(res, 'Run');
    csv(res, `fe-exceptions-${run.period.name}-${run.id.slice(0, 8)}.csv`, report.exceptionsCsv(await flatLines(run, req.user.companyId)));
  } catch (err) { sendError(res, err); }
});

// ─── Reports (FE-24 / FE-25) ────────────────────────────────────────────────

router.get('/runs/:id/report.xlsx', async (req, res) => {
  try {
    const run = await findRun(req, req.params.id);
    if (!run) return notFound(res, 'Run');
    const includeNames = req.query.includeNames === '1';
    if (includeNames && !isAdmin(req)) return res.status(403).json({ error: 'Only admins can export counterparty names.' });
    const lines = await flatLines(run, req.user.companyId);
    const buf = report.buildWorkbook({ period: run.period, portfolio: run.period.portfolio, run, lines, includeNames });
    logActivity(req.user.id, req.user.companyId, 'FE_REPORT_EXPORT', `Exported PCAF report for ${run.period.name}${includeNames ? ' (with names)' : ''}`, { runId: run.id, includeNames }, req.ip);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="PCAF_${run.period.name.replace(/[^\w.-]/g, '_')}_${run.id.slice(0, 8)}.xlsx"`);
    res.send(buf);
  } catch (err) { sendError(res, err); }
});

// ─── Dashboard (FE-11) ──────────────────────────────────────────────────────

router.get('/periods/:id/dashboard', async (req, res) => {
  try {
    const period = await findPeriod(req, req.params.id);
    if (!period) return notFound(res, 'Period');
    const run = req.query.runId
      ? await prisma.feCalcRun.findFirst({ where: { id: String(req.query.runId), periodId: period.id } })
      : await latestRun(period.id);
    const exposures = await prisma.feExposure.findMany({ where: { periodId: period.id }, select: { branch: true, segment: true, assetClass: true } });
    const uniq = (k) => [...new Set(exposures.map((e) => e[k]).filter(Boolean))].sort();
    const filterOptions = { branches: uniq('branch'), segments: uniq('segment'), assetClasses: uniq('assetClass') };
    if (!run) return res.json({ period: { id: period.id, name: period.name, status: period.status }, run: null, filterOptions });

    let lines = await flatLines(run, req.user.companyId);
    const f = { branch: req.query.branch, segment: req.query.segment, assetClass: req.query.assetClass };
    for (const [k, v] of Object.entries(f)) if (v) lines = lines.filter((l) => l[k] === v);
    const totals = metrics.computeTotals(lines);

    const top = lines.filter((l) => l.financedTotal != null).sort((a, b) => b.financedTotal - a.financedTotal).slice(0, 20)
      .map((l) => ({ exposureId: l.exposureId, facilityRef: l.facilityRef, stableId: l.stableId, name: l.name, assetClass: l.assetClass, sector: l.sector, outstanding: l.outstanding, financedTotal: l.financedTotal, dqScore: l.dqScore }));

    // Trend vs the previous period of the same portfolio (unfiltered totals).
    let trend = null;
    const prev = await prisma.fePeriod.findFirst({ where: { portfolioId: period.portfolioId, reportingDate: { lt: period.reportingDate } }, orderBy: { reportingDate: 'desc' } });
    if (prev) {
      const prevRun = await latestRun(prev.id);
      if (prevRun && prevRun.totals) {
        const t = prevRun.totals;
        trend = { periodId: prev.id, periodName: prev.name, absoluteFinanced: t.absoluteFinanced, economicIntensity: t.economicIntensity, coveragePct: t.coveragePct, weightedDq: t.weightedDq };
      }
    }
    res.json({
      period: { id: period.id, name: period.name, status: period.status, baseCurrency: period.portfolio.baseCurrency },
      run: runSummary(run),
      factorSet: run.totals ? run.totals.factorSet : null,
      filtered: Object.values(f).some(Boolean),
      totals,
      top,
      trend,
      filterOptions,
    });
  } catch (err) { sendError(res, err); }
});

// ─── Review & audit (FE-26 / FE-27) ─────────────────────────────────────────

async function transition(req, res, { action, from, to, adminOnly, needComment, commentLabel = 'comment' }) {
  const period = await findPeriod(req, req.params.id);
  if (!period) return notFound(res, 'Period');
  if (adminOnly && !isAdmin(req)) return res.status(403).json({ error: 'Only admins can approve, reject or reopen a period.' });
  if (period.status !== from) return res.status(409).json({ error: `The period is ${period.status}; this action needs ${from}.`, code: 'BAD_STATUS' });
  const comment = str(req.body && (req.body[commentLabel] ?? req.body.comment), 2000);
  if (needComment && !comment) return res.status(400).json({ error: `A ${commentLabel} is required.` });
  if (action === 'SUBMIT' && !await latestRun(period.id)) return res.status(409).json({ error: 'Run a calculation before submitting for review.', code: 'NO_RUN' });
  // Guard against a concurrent transition: update only if still in `from`.
  const [updated] = await prisma.$transaction([
    prisma.fePeriod.updateMany({ where: { id: period.id, status: from }, data: { status: to } }),
    prisma.fePeriodEvent.create({ data: { periodId: period.id, action, fromStatus: from, toStatus: to, comment, userId: req.user.id } }),
  ]);
  if (!updated.count) return res.status(409).json({ error: 'The period changed meanwhile; reload.', code: 'BAD_STATUS' });
  logActivity(req.user.id, req.user.companyId, `FE_PERIOD_${action}`, `${action} ${period.name}: ${from} → ${to}${comment ? ` (${comment.slice(0, 200)})` : ''}`, { periodId: period.id }, req.ip);
  res.json({ ...period, portfolio: undefined, status: to });
}

router.post('/periods/:id/submit', (req, res) => transition(req, res, { action: 'SUBMIT', from: 'OPEN', to: 'IN_REVIEW' }).catch((e) => sendError(res, e)));
router.post('/periods/:id/approve', (req, res) => transition(req, res, { action: 'APPROVE', from: 'IN_REVIEW', to: 'LOCKED', adminOnly: true }).catch((e) => sendError(res, e)));
router.post('/periods/:id/reject', (req, res) => transition(req, res, { action: 'REJECT', from: 'IN_REVIEW', to: 'OPEN', adminOnly: true, needComment: true }).catch((e) => sendError(res, e)));
router.post('/periods/:id/reopen', (req, res) => transition(req, res, { action: 'REOPEN', from: 'LOCKED', to: 'OPEN', adminOnly: true, needComment: true, commentLabel: 'reason' }).catch((e) => sendError(res, e)));

router.post('/periods/:id/comments', async (req, res) => {
  try {
    const period = await findPeriod(req, req.params.id);
    if (!period) return notFound(res, 'Period');
    const comment = str(req.body && req.body.comment, 2000);
    if (!comment) return res.status(400).json({ error: 'comment is required.' });
    const ev = await prisma.fePeriodEvent.create({ data: { periodId: period.id, action: 'COMMENT', comment, userId: req.user.id } });
    logActivity(req.user.id, req.user.companyId, 'FE_PERIOD_COMMENT', `Commented on ${period.name}`, { periodId: period.id }, req.ip);
    res.status(201).json(ev);
  } catch (err) { sendError(res, err); }
});

router.get('/periods/:id/events', async (req, res) => {
  try {
    const period = await findPeriod(req, req.params.id);
    if (!period) return notFound(res, 'Period');
    const events = await prisma.fePeriodEvent.findMany({ where: { periodId: period.id }, orderBy: { createdAt: 'desc' } });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(events.map((e) => e.userId))] }, companyId: req.user.companyId }, select: { id: true, firstName: true, lastName: true, email: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    res.json(events.map((e) => {
      const u = byId.get(e.userId);
      return { ...e, user: u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : 'Unknown user' };
    }));
  } catch (err) { sendError(res, err); }
});

module.exports = router;
// Exposed for tests.
module.exports.STATUSES = STATUSES;
