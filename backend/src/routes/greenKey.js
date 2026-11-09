'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// /api/gk — Green Key Readiness module (hotels).
//
// Consultant workspace (tenant) → Client → Brand (optional) → Establishment.
// Every route is gated by the green_key module entitlement and scoped to the
// caller's company: another tenant's record answers 404.
// Logic lives in services/gk/* (pure engines + workspace aggregation).
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const fs = require('fs');
const multer = require('multer');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { requireModule } = require('../middleware/module');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const { saveFile, getFilePath } = require('../utils/fileStore');
const buildingEnergy = require('../services/buildingEnergy');
const applicability = require('../services/gk/applicability');
const readiness = require('../services/gk/readiness');
const rules = require('../services/gk/rules');
const lifecycle = require('../services/gk/lifecycle');
const kpis = require('../services/gk/kpis');
const library = require('../services/gk/library');
const workspace = require('../services/gk/workspace');
const { buildAuditPack } = require('../services/gk/auditPack');

router.use(authenticate, requireModule('green_key'));

// ─── Constants ──────────────────────────────────────────────────────────────

const CLIENT_TYPES = ['group', 'owner', 'operator'];
const ESTABLISHMENT_CATEGORIES = library.CATEGORIES;
const WATER_SOURCES = ['municipal', 'well', 'surface', 'rainwater', 'tanker'];
const WATER_UNITS = ['m3', 'litre'];
const WASTE_STREAMS = ['mixed', 'paper', 'plastic', 'glass', 'metal', 'organic', 'hazardous', 'other'];
const WASTE_UNITS = ['kg', 't'];
const DISPOSAL = ['landfill', 'recycled', 'composted', 'incinerated'];
const ESTIMATION_METHODS = ['area_allocation', 'occupancy_allocation', 'tank_refills', 'delivery_logs', 'other'];
const ACTION_STATUSES = ['planned', 'in_progress', 'done', 'not_fulfilled'];
const TEAM_ROLES = ['representative', 'substitute', 'committee'];
const TRAINING_KINDS = ['briefing', 'general_training', 'departmental_training', 'new_hire'];
const CERT_STATUSES = ['applied', 'certified', 'suspended', 'expired', 'withdrawn'];
const IMPORT_COLUMNS = ['year', 'month', 'kind', 'source', 'quantity', 'unit', 'disposal', 'estimated', 'estimationMethod', 'guestNights', 'occupiedRooms', 'notes'];
const MAX_IMPORT = 3000;
const EVIDENCE_MIMES = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (EVIDENCE_MIMES[file.mimetype]) return cb(null, true);
    const err = new Error('File type not allowed. Use PDF, JPG, PNG, WEBP, DOCX or XLSX.');
    err.code = 'BAD_TYPE';
    return cb(err);
  },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const sendError = (res, err) => { const { status, error } = formatError(err); res.status(status).json({ error }); };
const bad = (res, errors) => res.status(400).json({ error: errors.join(' '), errors });
const notFound = (res, what = 'Record') => res.status(404).json({ error: `${what} not found.` });
const has = (b, k) => Object.prototype.hasOwnProperty.call(b, k);
const str = (v, max = 500) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const int = (v) => (v === '' || v == null ? null : Number.isInteger(Number(v)) ? Number(v) : NaN);
const num = (v) => (v === '' || v == null ? null : Number(v));
const bool = (v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'yes';
const date = (v) => (v === '' || v == null ? null : new Date(v));
const badDate = (d) => d != null && isNaN(d.getTime());
const userName = (u) => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
const log = (req, action, detail, meta) => logActivity(req.user.id, req.user.companyId, action, detail, meta, req.ip);

const ownEst = (req) => ({ establishment: { client: { companyId: req.user.companyId } } });

async function findClient(req, id) {
  return prisma.gkClient.findFirst({ where: { id, companyId: req.user.companyId } });
}
async function findEst(req, id = req.params.id) {
  return prisma.gkEstablishment.findFirst({ where: { id, client: { companyId: req.user.companyId } }, include: { client: true, brand: true } });
}
async function findOwned(model, req, id = req.params.id) {
  return prisma[model].findFirst({ where: { id, ...ownEst(req) } });
}
// Criteria visible to the tenant (global library or its own).
async function visibleCriteria(req, ids) {
  if (!ids.length) return [];
  return prisma.gkCriterion.findMany({ where: { id: { in: ids }, OR: [{ companyId: null }, { companyId: req.user.companyId }] } });
}

// Generic field parser: spec = { field: [kind, opts] }.
function parseFields(body, spec, partial) {
  const data = {};
  const errors = [];
  for (const [k, [kind, opts = {}]] of Object.entries(spec)) {
    if (!has(body, k)) {
      if (!partial && opts.required) errors.push(`${k} is required.`);
      if (!partial && opts.default !== undefined) data[k] = opts.default;
      continue;
    }
    const v = body[k];
    let out;
    switch (kind) {
      case 'str': out = str(v, opts.max || 500); break;
      case 'int': out = int(v); if (Number.isNaN(out)) { errors.push(`${k} must be a whole number.`); continue; } break;
      case 'num': out = num(v); if (out != null && !Number.isFinite(out)) { errors.push(`${k} must be a number.`); continue; } break;
      case 'bool': out = bool(v); break;
      case 'date': out = date(v); if (badDate(out)) { errors.push(`${k} is not a valid date.`); continue; } break;
      case 'enum': out = v == null || v === '' ? null : String(v); if (out != null && !opts.values.includes(out)) { errors.push(`${k} must be one of: ${opts.values.join(', ')}.`); continue; } break;
      default: out = v;
    }
    if (opts.required && (out == null || out === '')) { errors.push(`${k} is required.`); continue; }
    if (out != null && opts.min != null && out < opts.min) { errors.push(`${k} must be at least ${opts.min}.`); continue; }
    if (out != null && opts.max != null && kind !== 'str' && out > opts.max) { errors.push(`${k} must be at most ${opts.max}.`); continue; }
    data[k] = out;
  }
  return { data, errors };
}

// ─── Reference data ─────────────────────────────────────────────────────────

router.get('/meta', (_req, res) => {
  const lib = library.libraryData();
  res.json({
    areas: lib.areas,
    versions: library.VERSIONS,
    categories: ESTABLISHMENT_CATEGORIES,
    clientTypes: CLIENT_TYPES,
    statuses: readiness.STATUSES,
    facilities: applicability.FACILITIES,
    auditMethods: library.AUDIT_METHODS,
    dataLinks: library.DATA_LINKS,
    fuels: Object.entries(buildingEnergy.FUELS).map(([key, f]) => ({ key, label: f.label, units: f.units })),
    waterSources: WATER_SOURCES, waterUnits: WATER_UNITS,
    wasteStreams: WASTE_STREAMS, wasteUnits: WASTE_UNITS, disposal: DISPOSAL,
    estimationMethods: ESTIMATION_METHODS,
    actionStatuses: ACTION_STATUSES, teamRoles: TEAM_ROLES, trainingKinds: TRAINING_KINDS, certStatuses: CERT_STATUSES,
    importColumns: IMPORT_COLUMNS, criteriaImportColumns: library.IMPORT_COLUMNS,
    guidelineTable: rules.GUIDELINE_TABLE, transitionEnds: rules.TRANSITION_END.toISOString().slice(0, 10),
    evidenceMimes: Object.keys(EVIDENCE_MIMES), evidenceMaxMb: 20,
  });
});

// ─── Clients and brands (GK-01) ─────────────────────────────────────────────

const CLIENT_SPEC = {
  name: ['str', { required: true, max: 200 }],
  clientType: ['enum', { values: CLIENT_TYPES, default: 'group' }],
  country: ['str', { max: 10 }],
};

router.get('/clients', async (req, res) => {
  try {
    const clients = await prisma.gkClient.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { name: 'asc' },
      include: { brands: { orderBy: { name: 'asc' } }, establishments: { select: { id: true, name: true, city: true, country: true, brandId: true }, orderBy: { name: 'asc' } } },
    });
    res.json(clients);
  } catch (err) { sendError(res, err); }
});

router.post('/clients', async (req, res) => {
  try {
    const { data, errors } = parseFields(req.body, CLIENT_SPEC, false);
    if (data.country && !/^[A-Za-z]{2}$/.test(data.country)) errors.push('country must be a 2-letter code.');
    if (errors.length) return bad(res, errors);
    if (data.country) data.country = data.country.toUpperCase();
    const client = await prisma.gkClient.create({ data: { ...data, companyId: req.user.companyId } });
    log(req, 'GK_CLIENT_CREATE', `Created client ${client.name}`, { clientId: client.id });
    res.status(201).json(client);
  } catch (err) { sendError(res, err); }
});

router.get('/clients/:id', async (req, res) => {
  try {
    const client = await prisma.gkClient.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: { brands: true, establishments: { orderBy: { name: 'asc' } } },
    });
    if (!client) return notFound(res, 'Client');
    res.json(client);
  } catch (err) { sendError(res, err); }
});

router.put('/clients/:id', async (req, res) => {
  try {
    const client = await findClient(req, req.params.id);
    if (!client) return notFound(res, 'Client');
    const { data, errors } = parseFields(req.body, CLIENT_SPEC, true);
    if (data.country && !/^[A-Za-z]{2}$/.test(data.country)) errors.push('country must be a 2-letter code.');
    if (errors.length) return bad(res, errors);
    if (data.country) data.country = data.country.toUpperCase();
    const out = await prisma.gkClient.update({ where: { id: client.id }, data });
    log(req, 'GK_CLIENT_UPDATE', `Updated client ${out.name}`, { clientId: out.id });
    res.json(out);
  } catch (err) { sendError(res, err); }
});

router.delete('/clients/:id', async (req, res) => {
  try {
    const client = await findClient(req, req.params.id);
    if (!client) return notFound(res, 'Client');
    await prisma.gkClient.delete({ where: { id: client.id } });
    log(req, 'GK_CLIENT_DELETE', `Deleted client ${client.name}`, { clientId: client.id });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

router.post('/clients/:id/brands', async (req, res) => {
  try {
    const client = await findClient(req, req.params.id);
    if (!client) return notFound(res, 'Client');
    const name = str(req.body.name, 200);
    if (!name) return bad(res, ['name is required.']);
    const brand = await prisma.gkBrand.create({ data: { clientId: client.id, name } });
    log(req, 'GK_BRAND_CREATE', `Created brand ${name}`, { clientId: client.id, brandId: brand.id });
    res.status(201).json(brand);
  } catch (err) { sendError(res, err); }
});

router.delete('/brands/:id', async (req, res) => {
  try {
    const brand = await prisma.gkBrand.findFirst({ where: { id: req.params.id, client: { companyId: req.user.companyId } } });
    if (!brand) return notFound(res, 'Brand');
    await prisma.gkBrand.delete({ where: { id: brand.id } });
    log(req, 'GK_BRAND_DELETE', `Deleted brand ${brand.name}`, { brandId: brand.id });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// ─── Establishments and profile (GK-01/02/04) ───────────────────────────────

const EST_SPEC = {
  name: ['str', { required: true, max: 200 }],
  category: ['enum', { values: ESTABLISHMENT_CATEGORIES }],
  country: ['str', { max: 10 }],
  city: ['str', { max: 120 }],
  rooms: ['int', { min: 0, max: 100000 }],
  beds: ['int', { min: 0, max: 100000 }],
  employees: ['int', { min: 0, max: 1000000 }],
  seasonal: ['bool'],
  criteriaVersion: ['enum', { values: library.VERSIONS }],
  priorPeriods: ['int', { min: 0, max: 50 }],
  transition: ['bool'],
  dispensation: ['bool'],
};

function parseEstablishment(body, partial) {
  const { data, errors } = parseFields(body, EST_SPEC, partial);
  if (data.country !== undefined) {
    if (data.country == null) { if (!partial) delete data.country; else errors.push('country is required.'); } else if (!/^[A-Za-z]{2}$/.test(data.country)) errors.push('country must be a 2-letter code.');
    else data.country = data.country.toUpperCase();
  }
  if (data.priorPeriods === null) data.priorPeriods = 0;
  if (has(body, 'facilities')) {
    const f = body.facilities || {};
    if (typeof f !== 'object' || Array.isArray(f)) errors.push('facilities must be an object.');
    else {
      const m = num(f.meetingSpaceM2);
      if (m != null && !(Number.isFinite(m) && m >= 0)) errors.push('facilities.meetingSpaceM2 must be a positive number.');
      data.facilities = {
        restaurant: bool(f.restaurant), animals: bool(f.animals), outsourcedHousekeeping: bool(f.outsourcedHousekeeping),
        pool: bool(f.pool), meetingSpaceM2: m,
      };
    }
  }
  if (data.transition && !data.priorPeriods && !partial) {
    // A transition establishment was certified before — keep the profile coherent.
    data.priorPeriods = 1;
  }
  return { data, errors };
}

function categoryCheck(est) {
  return {
    status: 'not_configured',
    category: est.category,
    message: 'Category check: the Hotels & Hostels eligibility thresholds are not configured yet. Confirm the category with the certification body.',
  };
}

router.get('/establishments', async (req, res) => {
  try {
    const where = { client: { companyId: req.user.companyId } };
    if (req.query.clientId) where.clientId = String(req.query.clientId);
    const list = await prisma.gkEstablishment.findMany({ where, orderBy: { name: 'asc' }, include: { client: { select: { id: true, name: true } }, brand: { select: { id: true, name: true } } } });
    res.json(list);
  } catch (err) { sendError(res, err); }
});

router.post('/establishments', async (req, res) => {
  try {
    const client = req.body.clientId ? await findClient(req, String(req.body.clientId)) : null;
    if (!client) return bad(res, ['clientId must reference one of your clients.']);
    const { data, errors } = parseEstablishment(req.body, false);
    if (req.body.brandId) {
      const brand = await prisma.gkBrand.findFirst({ where: { id: String(req.body.brandId), clientId: client.id } });
      if (!brand) errors.push('brandId must be a brand of this client.');
      else data.brandId = brand.id;
    }
    if (errors.length) return bad(res, errors);
    const est = await prisma.gkEstablishment.create({ data: { ...data, clientId: client.id } });
    log(req, 'GK_ESTABLISHMENT_CREATE', `Created establishment ${est.name}`, { establishmentId: est.id, clientId: client.id });
    res.status(201).json(est);
  } catch (err) { sendError(res, err); }
});

router.get('/establishments/:id', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const certs = await prisma.gkCertification.findMany({ where: { establishmentId: est.id } });
    res.json({ ...est, categoryCheck: categoryCheck(est), requirement: rules.guidelineRequirement(est, certs) });
  } catch (err) { sendError(res, err); }
});

router.put('/establishments/:id', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const { data, errors } = parseEstablishment(req.body, true);
    if (has(req.body, 'brandId')) {
      if (!req.body.brandId) data.brandId = null;
      else {
        const brand = await prisma.gkBrand.findFirst({ where: { id: String(req.body.brandId), clientId: est.clientId } });
        if (!brand) errors.push('brandId must be a brand of this client.');
        else data.brandId = brand.id;
      }
    }
    if (errors.length) return bad(res, errors);
    const before = await workspace.computeApplicability(prisma, req.user.companyId, est);
    const updated = await prisma.gkEstablishment.update({ where: { id: est.id }, data, include: { client: true, brand: true } });
    const after = await workspace.computeApplicability(prisma, req.user.companyId, updated);
    const changeNotice = applicability.diff(before.appl, after.appl);
    log(req, 'GK_ESTABLISHMENT_UPDATE', `Updated profile of ${updated.name}`, { establishmentId: est.id, changed: Object.keys(data), applicabilityChanged: changeNotice.changed });
    res.json({ establishment: { ...updated, categoryCheck: categoryCheck(updated) }, changeNotice });
  } catch (err) { sendError(res, err); }
});

router.delete('/establishments/:id', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const files = await prisma.gkEvidence.findMany({ where: { establishmentId: est.id }, select: { storedFilePath: true } });
    await prisma.gkEstablishment.delete({ where: { id: est.id } });
    for (const f of files) fs.promises.unlink(getFilePath(f.storedFilePath)).catch(() => {});
    log(req, 'GK_ESTABLISHMENT_DELETE', `Deleted establishment ${est.name}`, { establishmentId: est.id });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

router.get('/establishments/:id/overview', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    res.json(await workspace.overview(prisma, req.user.companyId, est));
  } catch (err) { sendError(res, err); }
});

// ─── Criteria library (GK-03) ───────────────────────────────────────────────

router.get('/criteria', async (req, res) => {
  try {
    const list = await library.loadCriteria(prisma, req.user.companyId, {
      version: req.query.version || undefined, area: req.query.area || undefined, type: req.query.type || undefined,
    });
    res.json({ criteria: list, starterSet: library.libraryData().starterSet, areas: library.libraryData().areas });
  } catch (err) { sendError(res, err); }
});

router.post('/criteria', async (req, res) => {
  try {
    const { data, errors } = library.parseCriterion(req.body, false);
    if (errors.length) return bad(res, errors);
    const dup = await prisma.gkCriterion.findFirst({ where: { companyId: req.user.companyId, version: data.version, category: data.category || library.CATEGORY, code: data.code } });
    if (dup) return res.status(409).json({ error: `Your library already has criterion ${data.code} for ${data.version}.` });
    const c = await prisma.gkCriterion.create({ data: { ...data, companyId: req.user.companyId } });
    log(req, 'GK_CRITERION_CREATE', `Added criterion ${c.code} (${c.version})`, { criterionId: c.id });
    res.status(201).json(c);
  } catch (err) { sendError(res, err); }
});

router.put('/criteria/:id', async (req, res) => {
  try {
    const c = await prisma.gkCriterion.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!c) {
      const global = await prisma.gkCriterion.findFirst({ where: { id: req.params.id, companyId: null } });
      if (global) return res.status(403).json({ error: 'The Triple i starter library is read-only. Add a criterion with the same code to override it for your workspace.' });
      return notFound(res, 'Criterion');
    }
    const { data, errors } = library.parseCriterion(req.body, true);
    if (errors.length) return bad(res, errors);
    const out = await prisma.gkCriterion.update({ where: { id: c.id }, data });
    log(req, 'GK_CRITERION_UPDATE', `Updated criterion ${out.code}`, { criterionId: out.id });
    res.json(out);
  } catch (err) { sendError(res, err); }
});

router.delete('/criteria/:id', async (req, res) => {
  try {
    const c = await prisma.gkCriterion.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!c) return notFound(res, 'Criterion');
    await prisma.gkCriterion.delete({ where: { id: c.id } });
    log(req, 'GK_CRITERION_DELETE', `Deleted criterion ${c.code}`, { criterionId: c.id });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// Import a list: { criteria: [...] } (JSON) or { csv: "code,version,..." }.
// Upserts the tenant's criteria by version + code. All-or-nothing.
router.post('/criteria/import', async (req, res) => {
  try {
    let rows = Array.isArray(req.body) ? req.body : req.body.criteria;
    if (!rows && typeof req.body.csv === 'string') rows = library.parseCsv(req.body.csv);
    if (!Array.isArray(rows) || !rows.length) return bad(res, ['Send { criteria: [...] } or { csv: "..." } with at least one row.']);
    if (rows.length > 1000) return bad(res, ['At most 1000 criteria per import.']);
    const parsed = []; const errors = [];
    rows.forEach((row, i) => {
      const { data, errors: e } = library.parseCriterion(row, false);
      if (e.length) errors.push(`Row ${i + 1}: ${e.join(' ')}`); else parsed.push({ ...data, sortOrder: data.sortOrder ?? i });
    });
    if (errors.length) return res.status(400).json({ error: `${errors.length} row(s) invalid.`, errors });
    let created = 0; let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const d of parsed) {
        const category = d.category || library.CATEGORY;
        const ex = await tx.gkCriterion.findFirst({ where: { companyId: req.user.companyId, version: d.version, category, code: d.code } });
        if (ex) { await tx.gkCriterion.update({ where: { id: ex.id }, data: d }); updated++; } else { await tx.gkCriterion.create({ data: { ...d, category, companyId: req.user.companyId } }); created++; }
      }
    });
    log(req, 'GK_CRITERIA_IMPORT', `Imported ${parsed.length} criteria`, { created, updated });
    res.status(201).json({ created, updated });
  } catch (err) { sendError(res, err); }
});

// ─── Readiness board (GK-04/05/06) ──────────────────────────────────────────

router.get('/establishments/:id/criteria', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const board = await workspace.loadBoard(prisma, req.user.companyId, est);
    res.json({ rows: board.rows, notApplicable: board.notApplicable, summary: board.summary, requirement: board.requirement });
  } catch (err) { sendError(res, err); }
});

async function upsertStatus(establishmentId, criterionId, data, entry) {
  const ex = await prisma.gkCriterionStatus.findUnique({ where: { establishmentId_criterionId: { establishmentId, criterionId } } });
  const comments = [...((ex && ex.comments) || [])];
  if (entry) comments.push(entry);
  if (ex) return prisma.gkCriterionStatus.update({ where: { id: ex.id }, data: { ...data, comments } });
  return prisma.gkCriterionStatus.create({ data: { establishmentId, criterionId, ...data, comments } });
}

router.put('/establishments/:id/criteria/:criterionId', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const [criterion] = await visibleCriteria(req, [req.params.criterionId]);
    if (!criterion) return notFound(res, 'Criterion');
    const { data, errors } = parseFields(req.body, {
      status: ['enum', { values: readiness.STATUSES }],
      naJustification: ['str', { max: 2000 }],
      ownerName: ['str', { max: 120 }],
      dueDate: ['date'],
    }, true);
    if (errors.length) return bad(res, errors);
    const ex = await prisma.gkCriterionStatus.findUnique({ where: { establishmentId_criterionId: { establishmentId: est.id, criterionId: criterion.id } } });
    const prevStatus = ex ? ex.status : 'not_started';
    const nextStatus = data.status || prevStatus;
    if (nextStatus === 'na') {
      const just = has(req.body, 'naJustification') ? data.naJustification : ex && ex.naJustification;
      if (!just) return bad(res, ['A justification is required to mark a criterion not applicable.']);
    } else if (data.status && data.status !== 'na') data.naJustification = null;
    if (data.status === 'approved' && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Only an administrator (consultant) can approve a criterion.' });
    const entry = data.status && data.status !== prevStatus
      ? { kind: 'status', by: userName(req.user), at: new Date().toISOString(), from: prevStatus, to: data.status, text: data.status === 'na' ? `N/A: ${data.naJustification || ex?.naJustification}` : null }
      : null;
    const out = await upsertStatus(est.id, criterion.id, data, entry);
    log(req, 'GK_CRITERION_STATUS', `${criterion.code} → ${out.status} (${est.name})`, { establishmentId: est.id, criterionId: criterion.id, from: prevStatus, to: out.status });
    res.json(out);
  } catch (err) { sendError(res, err); }
});

router.post('/establishments/:id/criteria/:criterionId/comments', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const [criterion] = await visibleCriteria(req, [req.params.criterionId]);
    if (!criterion) return notFound(res, 'Criterion');
    const text = str(req.body.text, 2000);
    if (!text) return bad(res, ['text is required.']);
    const out = await upsertStatus(est.id, criterion.id, {}, { kind: 'comment', by: userName(req.user), at: new Date().toISOString(), text });
    log(req, 'GK_CRITERION_COMMENT', `Comment on ${criterion.code} (${est.name})`, { establishmentId: est.id, criterionId: criterion.id });
    res.status(201).json(out);
  } catch (err) { sendError(res, err); }
});

// ─── Evidence vault (GK-07) ─────────────────────────────────────────────────

function parseIds(v) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.map(String);
  const s = String(v).trim();
  if (s.startsWith('[')) { try { return JSON.parse(s).map(String); } catch { return null; } }
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

// Link evidence → criteria; moves not_started / in_progress to evidence_uploaded.
async function linkCriteria(req, est, evidence, criterionIds) {
  for (const cid of criterionIds) {
    await prisma.gkEvidenceLink.upsert({
      where: { evidenceId_criterionId: { evidenceId: evidence.id, criterionId: cid } },
      update: {},
      create: { evidenceId: evidence.id, criterionId: cid },
    });
    const ex = await prisma.gkCriterionStatus.findUnique({ where: { establishmentId_criterionId: { establishmentId: est.id, criterionId: cid } } });
    const prev = ex ? ex.status : 'not_started';
    if (['not_started', 'in_progress'].includes(prev)) {
      await upsertStatus(est.id, cid, { status: 'evidence_uploaded' }, { kind: 'status', by: userName(req.user), at: new Date().toISOString(), from: prev, to: 'evidence_uploaded', text: `Evidence linked: ${evidence.fileName}` });
    }
  }
}

router.get('/establishments/:id/evidence', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const board = await workspace.loadBoard(prisma, req.user.companyId, est);
    res.json(board.evidence.map(({ links, storedFilePath, ...e }) => e));
  } catch (err) { sendError(res, err); }
});

router.post('/establishments/:id/evidence', (req, res, next) => {
  evidenceUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File is larger than 20 MB.' });
    return res.status(400).json({ error: err.message || 'Upload failed.' });
  });
}, async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    if (!req.file) return bad(res, ['file is required (PDF, JPG, PNG, WEBP, DOCX or XLSX, up to 20 MB).']);
    const { data, errors } = parseFields(req.body, { description: ['str', { max: 500 }], documentDate: ['date'], validUntil: ['date'] }, true);
    const ids = parseIds(req.body.criterionIds);
    if (ids === null) errors.push('criterionIds must be a list.');
    const crit = ids ? await visibleCriteria(req, ids) : [];
    if (ids && crit.length !== new Set(ids).size) errors.push('Unknown criterion in criterionIds.');
    if (errors.length) return bad(res, errors);
    // Photo evidence: when no document date is given, the upload time is the timestamp.
    if (!data.documentDate && req.file.mimetype.startsWith('image/')) data.documentDate = new Date();
    const stored = saveFile(req.file, req.user.companyId);
    const ev = await prisma.gkEvidence.create({
      data: {
        establishmentId: est.id, fileName: req.file.originalname.slice(0, 255), storedFilePath: stored.storedFilePath,
        mime: req.file.mimetype, size: req.file.size, uploadedById: req.user.id, ...data,
      },
    });
    await linkCriteria(req, est, ev, crit.map((c) => c.id));
    log(req, 'GK_EVIDENCE_UPLOAD', `Uploaded evidence ${ev.fileName} (${est.name})`, { establishmentId: est.id, evidenceId: ev.id, criteria: crit.map((c) => c.code) });
    const { storedFilePath, ...out } = ev;
    res.status(201).json({ ...out, criteria: crit.map((c) => ({ id: c.id, code: c.code })) });
  } catch (err) { sendError(res, err); }
});

router.put('/evidence/:id', async (req, res) => {
  try {
    const ev = await prisma.gkEvidence.findFirst({ where: { id: req.params.id, ...ownEst(req) }, include: { links: true } });
    if (!ev) return notFound(res, 'Evidence');
    const est = await findEst(req, ev.establishmentId);
    const { data, errors } = parseFields(req.body, { description: ['str', { max: 500 }], documentDate: ['date'], validUntil: ['date'] }, true);
    let crit = null;
    if (has(req.body, 'criterionIds')) {
      const ids = parseIds(req.body.criterionIds);
      if (ids === null) errors.push('criterionIds must be a list.');
      else {
        crit = await visibleCriteria(req, ids);
        if (crit.length !== new Set(ids).size) errors.push('Unknown criterion in criterionIds.');
      }
    }
    if (errors.length) return bad(res, errors);
    const out = await prisma.gkEvidence.update({ where: { id: ev.id }, data });
    if (crit) {
      const keep = new Set(crit.map((c) => c.id));
      await prisma.gkEvidenceLink.deleteMany({ where: { evidenceId: ev.id, criterionId: { notIn: [...keep] } } });
      await linkCriteria(req, est, ev, [...keep].filter((id) => !ev.links.some((l) => l.criterionId === id)));
    }
    log(req, 'GK_EVIDENCE_UPDATE', `Updated evidence ${ev.fileName}`, { evidenceId: ev.id });
    const { storedFilePath, ...rest } = out;
    res.json(rest);
  } catch (err) { sendError(res, err); }
});

// Approval step: ADMIN (consultant) approves or rejects. Approval moves linked
// criteria in evidence_uploaded to approved.
router.post('/evidence/:id/review', async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Only an administrator (consultant) can review evidence.' });
    const ev = await prisma.gkEvidence.findFirst({ where: { id: req.params.id, ...ownEst(req) }, include: { links: true } });
    if (!ev) return notFound(res, 'Evidence');
    const decision = req.body.decision;
    if (!['approved', 'rejected'].includes(decision)) return bad(res, ['decision must be approved or rejected.']);
    const note = str(req.body.note, 1000);
    if (decision === 'rejected' && !note) return bad(res, ['A note is required when rejecting evidence.']);
    const out = await prisma.gkEvidence.update({ where: { id: ev.id }, data: { status: decision, reviewNote: note, reviewedById: req.user.id, reviewedAt: new Date() } });
    if (decision === 'approved') {
      for (const l of ev.links) {
        const s = await prisma.gkCriterionStatus.findUnique({ where: { establishmentId_criterionId: { establishmentId: ev.establishmentId, criterionId: l.criterionId } } });
        if (s && s.status === 'evidence_uploaded') {
          await upsertStatus(ev.establishmentId, l.criterionId, { status: 'approved' }, { kind: 'status', by: userName(req.user), at: new Date().toISOString(), from: 'evidence_uploaded', to: 'approved', text: `Evidence approved: ${ev.fileName}` });
        }
      }
    }
    log(req, 'GK_EVIDENCE_REVIEW', `Evidence ${ev.fileName} ${decision}`, { evidenceId: ev.id, decision });
    const { storedFilePath, ...rest } = out;
    res.json(rest);
  } catch (err) { sendError(res, err); }
});

router.get('/evidence/:id/file', async (req, res) => {
  try {
    const ev = await prisma.gkEvidence.findFirst({ where: { id: req.params.id, ...ownEst(req) } });
    if (!ev) return notFound(res, 'Evidence');
    const p = getFilePath(ev.storedFilePath);
    if (!fs.existsSync(p)) return notFound(res, 'File');
    const inline = req.query.download ? 'attachment' : 'inline';
    res.setHeader('Content-Type', ev.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline}; filename="${encodeURIComponent(ev.fileName)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(p).pipe(res);
  } catch (err) { sendError(res, err); }
});

router.delete('/evidence/:id', async (req, res) => {
  try {
    const ev = await prisma.gkEvidence.findFirst({ where: { id: req.params.id, ...ownEst(req) } });
    if (!ev) return notFound(res, 'Evidence');
    await prisma.gkEvidence.delete({ where: { id: ev.id } });
    fs.promises.unlink(getFilePath(ev.storedFilePath)).catch(() => {});
    log(req, 'GK_EVIDENCE_DELETE', `Deleted evidence ${ev.fileName}`, { evidenceId: ev.id });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// ─── Resource data (GK-09/10/12) ────────────────────────────────────────────

function parseResource(body, partial = false, existing = null) {
  const errors = [];
  const d = {};
  const now = new Date();
  const merged = { ...(existing || {}), ...body };
  const pick = (k) => (partial && !has(body, k) ? undefined : body[k]);
  const y = pick('year') === undefined ? undefined : int(body.year);
  const m = pick('month') === undefined ? undefined : int(body.month);
  if (y !== undefined) { if (!(y >= 2000 && y <= now.getUTCFullYear())) errors.push('year must be 2000 or later and not in the future.'); else d.year = y; }
  if (m !== undefined) { if (!(m >= 1 && m <= 12)) errors.push('month must be 1–12.'); else d.month = m; }
  const yy = d.year ?? merged.year; const mm = d.month ?? merged.month;
  if (yy && mm && yy * 12 + mm > now.getUTCFullYear() * 12 + now.getUTCMonth() + 1) errors.push('month cannot be in the future.');
  const kind = merged.kind;
  if (!partial || has(body, 'kind')) {
    if (!['energy', 'water', 'waste'].includes(kind)) errors.push('kind must be energy, water or waste.');
    else d.kind = kind;
  }
  if (!partial || has(body, 'source') || has(body, 'unit') || has(body, 'kind')) {
    const source = merged.source;
    if (kind === 'energy') {
      const unit = buildingEnergy.normaliseUnit(merged.unit || 'kWh');
      if (!buildingEnergy.isValidFuel(source)) errors.push(`source must be one of: ${Object.keys(buildingEnergy.FUELS).join(', ')}.`);
      else if (!buildingEnergy.isValidUnit(source, unit)) errors.push(`unit for ${source} must be one of: ${buildingEnergy.FUELS[source].units.join(', ')}.`);
      else { d.source = source; d.unit = unit; }
    } else if (kind === 'water') {
      const unit = merged.unit === 'm³' ? 'm3' : (merged.unit || 'm3');
      if (!WATER_SOURCES.includes(source)) errors.push(`source must be one of: ${WATER_SOURCES.join(', ')}.`);
      else if (!WATER_UNITS.includes(unit)) errors.push(`unit for water must be one of: ${WATER_UNITS.join(', ')}.`);
      else { d.source = source; d.unit = unit; }
    } else if (kind === 'waste') {
      const unit = merged.unit || 'kg';
      if (!WASTE_STREAMS.includes(source)) errors.push(`source (waste stream) must be one of: ${WASTE_STREAMS.join(', ')}.`);
      else if (!WASTE_UNITS.includes(unit)) errors.push(`unit for waste must be one of: ${WASTE_UNITS.join(', ')}.`);
      else { d.source = source; d.unit = unit; }
    }
  }
  if (!partial || has(body, 'quantity')) {
    const q = num(body.quantity);
    if (q == null || !Number.isFinite(q) || q < 0) errors.push('quantity must be 0 or more.');
    else d.quantity = q;
  }
  if (has(body, 'disposal') || (!partial && kind === 'waste')) {
    const disp = body.disposal || null;
    if (kind === 'waste' && !DISPOSAL.includes(disp)) errors.push(`disposal must be one of: ${DISPOSAL.join(', ')}.`);
    else d.disposal = kind === 'waste' ? disp : null;
  }
  if (has(body, 'estimated')) d.estimated = bool(body.estimated);
  if (has(body, 'estimationMethod')) {
    const em = body.estimationMethod || null;
    if (em && !ESTIMATION_METHODS.includes(em)) errors.push(`estimationMethod must be one of: ${ESTIMATION_METHODS.join(', ')}.`);
    else d.estimationMethod = em;
  }
  const est = d.estimated ?? merged.estimated;
  const meth = has(body, 'estimationMethod') ? d.estimationMethod : merged.estimationMethod;
  if (est && !meth) errors.push('estimationMethod is required for estimated values.');
  if (has(body, 'estimated') && !d.estimated) d.estimationMethod = null;
  if (has(body, 'cost')) { const c = num(body.cost); if (c != null && !(Number.isFinite(c) && c >= 0)) errors.push('cost must be a positive number.'); else d.cost = c; }
  if (has(body, 'currency')) d.currency = str(body.currency, 3)?.toUpperCase() || null;
  if (has(body, 'notes')) d.notes = str(body.notes, 1000);
  return { data: d, errors };
}

function parseOccupancy(body) {
  const errors = [];
  const now = new Date();
  const y = int(body.year); const m = int(body.month);
  const gn = int(body.guestNights); const orr = int(body.occupiedRooms);
  if (!(y >= 2000 && y <= now.getUTCFullYear())) errors.push('year must be 2000 or later and not in the future.');
  if (!(m >= 1 && m <= 12)) errors.push('month must be 1–12.');
  else if (y * 12 + m > now.getUTCFullYear() * 12 + now.getUTCMonth() + 1) errors.push('month cannot be in the future.');
  if (gn == null || Number.isNaN(gn) || gn < 0) errors.push('guestNights must be a whole number, 0 or more.');
  if (orr == null || Number.isNaN(orr) || orr < 0) errors.push('occupiedRooms must be a whole number, 0 or more.');
  if (!errors.length && orr > gn && gn > 0) errors.push('occupiedRooms (room-nights) cannot exceed guestNights.');
  return { data: { year: y, month: m, guestNights: gn, occupiedRooms: orr }, errors };
}

// Same month + kind + source (+ disposal) replaces the existing record.
async function upsertResource(tx, establishmentId, d) {
  const ex = await tx.gkResourceRecord.findFirst({
    where: { establishmentId, year: d.year, month: d.month, kind: d.kind, source: d.source, disposal: d.kind === 'waste' ? d.disposal : null },
  });
  if (ex) return { rec: await tx.gkResourceRecord.update({ where: { id: ex.id }, data: d }), created: false };
  return { rec: await tx.gkResourceRecord.create({ data: { ...d, establishmentId } }), created: true };
}

router.get('/establishments/:id/resources', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const where = { establishmentId: est.id };
    if (req.query.kind) where.kind = String(req.query.kind);
    if (req.query.year) where.year = int(req.query.year);
    const [records, occupancy, certs] = await Promise.all([
      prisma.gkResourceRecord.findMany({ where, orderBy: [{ year: 'asc' }, { month: 'asc' }, { kind: 'asc' }, { source: 'asc' }] }),
      prisma.gkOccupancy.findMany({ where: { establishmentId: est.id }, orderBy: [{ year: 'asc' }, { month: 'asc' }] }),
      prisma.gkCertification.findMany({ where: { establishmentId: est.id } }),
    ]);
    const requirement = rules.guidelineRequirement(est, certs);
    const all = req.query.kind || req.query.year ? await prisma.gkResourceRecord.findMany({ where: { establishmentId: est.id }, select: { kind: true, year: true, month: true } }) : records;
    const coverage = {};
    for (const kind of ['water', 'energy', 'waste']) coverage[kind] = rules.dataCoverage(all.filter((r) => r.kind === kind), requirement);
    coverage.occupancy = rules.dataCoverage(occupancy, requirement);
    res.json({ records, occupancy, coverage, requirement });
  } catch (err) { sendError(res, err); }
});

// One record or an array (monthly grid save). All-or-nothing.
router.post('/establishments/:id/resources', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const list = Array.isArray(req.body) ? req.body : [req.body];
    if (!list.length || list.length > MAX_IMPORT) return bad(res, [`Send 1–${MAX_IMPORT} records.`]);
    const parsed = []; const errors = [];
    list.forEach((b, i) => { const { data, errors: e } = parseResource(b || {}); if (e.length) errors.push(list.length > 1 ? `Row ${i + 1}: ${e.join(' ')}` : e.join(' ')); else parsed.push(data); });
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    let created = 0;
    const out = await prisma.$transaction(async (tx) => {
      const recs = [];
      for (const d of parsed) { const r = await upsertResource(tx, est.id, d); if (r.created) created++; recs.push(r.rec); }
      return recs;
    });
    log(req, 'GK_RESOURCE_SAVE', `Saved ${out.length} resource record(s) for ${est.name}`, { establishmentId: est.id, created, updated: out.length - created });
    res.status(201).json(Array.isArray(req.body) ? { saved: out.length, created, updated: out.length - created } : out[0]);
  } catch (err) { sendError(res, err); }
});

router.put('/resources/:id', async (req, res) => {
  try {
    const rec = await findOwned('gkResourceRecord', req);
    if (!rec) return notFound(res, 'Record');
    const { data, errors } = parseResource(req.body, true, rec);
    if (errors.length) return bad(res, errors);
    const out = await prisma.gkResourceRecord.update({ where: { id: rec.id }, data });
    log(req, 'GK_RESOURCE_UPDATE', `Updated ${out.kind} record ${out.year}-${out.month}`, { recordId: out.id });
    res.json(out);
  } catch (err) { sendError(res, err); }
});

router.delete('/resources/:id', async (req, res) => {
  try {
    const rec = await findOwned('gkResourceRecord', req);
    if (!rec) return notFound(res, 'Record');
    await prisma.gkResourceRecord.delete({ where: { id: rec.id } });
    log(req, 'GK_RESOURCE_DELETE', `Deleted ${rec.kind} record ${rec.year}-${rec.month}`, { recordId: rec.id });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

router.put('/establishments/:id/occupancy', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const list = Array.isArray(req.body) ? req.body : [req.body];
    const parsed = []; const errors = [];
    list.forEach((b, i) => { const { data, errors: e } = parseOccupancy(b || {}); if (e.length) errors.push(`Row ${i + 1}: ${e.join(' ')}`); else parsed.push(data); });
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    await prisma.$transaction(parsed.map((d) => prisma.gkOccupancy.upsert({
      where: { establishmentId_year_month: { establishmentId: est.id, year: d.year, month: d.month } },
      update: { guestNights: d.guestNights, occupiedRooms: d.occupiedRooms },
      create: { ...d, establishmentId: est.id },
    })));
    log(req, 'GK_OCCUPANCY_SAVE', `Saved ${parsed.length} occupancy month(s) for ${est.name}`, { establishmentId: est.id });
    res.json({ saved: parsed.length });
  } catch (err) { sendError(res, err); }
});

router.delete('/establishments/:id/occupancy/:year/:month', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const r = await prisma.gkOccupancy.deleteMany({ where: { establishmentId: est.id, year: int(req.params.year), month: int(req.params.month) } });
    if (!r.count) return notFound(res, 'Occupancy month');
    log(req, 'GK_OCCUPANCY_DELETE', `Deleted occupancy ${req.params.year}-${req.params.month}`, { establishmentId: est.id });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// CSV import (rows parsed client-side; columns in IMPORT_COLUMNS).
// kind = energy | water | waste | occupancy. All-or-nothing.
router.post('/establishments/:id/import', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const rows = Array.isArray(req.body) ? req.body : req.body.rows;
    if (!Array.isArray(rows) || !rows.length) return bad(res, ['Send { rows: [...] } with at least one row.']);
    if (rows.length > MAX_IMPORT) return bad(res, [`At most ${MAX_IMPORT} rows per import.`]);
    const resources = []; const occ = []; const errors = [];
    rows.forEach((row, i) => {
      const r = { ...row };
      for (const k of Object.keys(r)) if (r[k] === '') delete r[k];
      if (r.kind === 'occupancy') {
        const { data, errors: e } = parseOccupancy(r);
        if (e.length) errors.push(`Row ${i + 2}: ${e.join(' ')}`); else occ.push(data);
      } else {
        const { data, errors: e } = parseResource(r);
        if (e.length) errors.push(`Row ${i + 2}: ${e.join(' ')}`); else resources.push(data);
      }
    });
    if (errors.length) return res.status(400).json({ error: `${errors.length} row(s) invalid — nothing imported.`, errors: errors.slice(0, 50) });
    await prisma.$transaction(async (tx) => {
      for (const d of resources) await upsertResource(tx, est.id, d);
      for (const d of occ) {
        await tx.gkOccupancy.upsert({
          where: { establishmentId_year_month: { establishmentId: est.id, year: d.year, month: d.month } },
          update: { guestNights: d.guestNights, occupiedRooms: d.occupiedRooms },
          create: { ...d, establishmentId: est.id },
        });
      }
    }, { timeout: 60000 });
    log(req, 'GK_DATA_IMPORT', `Imported ${resources.length} resource and ${occ.length} occupancy rows for ${est.name}`, { establishmentId: est.id });
    res.status(201).json({ resources: resources.length, occupancy: occ.length });
  } catch (err) { sendError(res, err); }
});

// ─── Carbon and KPIs (GK-14/15) ─────────────────────────────────────────────

const monthParam = (v) => (v && /^\d{4}-\d{2}$/.test(String(v)) ? String(v) : undefined);

router.get('/establishments/:id/kpis', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const [records, occupancy] = await Promise.all([
      prisma.gkResourceRecord.findMany({ where: { establishmentId: est.id } }),
      prisma.gkOccupancy.findMany({ where: { establishmentId: est.id } }),
    ]);
    res.json(kpis.computeKpis(est, records, occupancy, { from: monthParam(req.query.from), to: monthParam(req.query.to) }));
  } catch (err) { sendError(res, err); }
});

// Comparison across the establishments of one client.
router.get('/clients/:id/kpis', async (req, res) => {
  try {
    const client = await findClient(req, req.params.id);
    if (!client) return notFound(res, 'Client');
    const ests = await prisma.gkEstablishment.findMany({ where: { clientId: client.id }, include: { resources: true, occupancy: true }, orderBy: { name: 'asc' } });
    res.json(ests.map((e) => {
      const k = kpis.computeKpis(e, e.resources, e.occupancy);
      return { establishmentId: e.id, name: e.name, city: e.city, period: k.period, intensities: k.intensities, totals: k.totals };
    }));
  } catch (err) { sendError(res, err); }
});

// ─── Targets and action plan (GK-16/17) ─────────────────────────────────────

const TARGET_SPEC = {
  area: ['int', { required: true, min: 1, max: 7 }],
  description: ['str', { required: true, max: 500 }],
  metric: ['str', { max: 120 }],
  baselineYear: ['int', { min: 1990, max: 2100 }],
  baselineValue: ['num'],
  targetValue: ['num'],
  targetYear: ['int', { min: 1990, max: 2100 }],
  documentDate: ['date'],
};
const ACTION_SPEC = {
  description: ['str', { required: true, max: 500 }],
  owner: ['str', { max: 120 }],
  measure: ['str', { max: 300 }],
  dueDate: ['date'],
  status: ['enum', { values: ACTION_STATUSES, default: 'planned' }],
  justification: ['str', { max: 1000 }],
  nextStep: ['str', { max: 500 }],
};

router.get('/establishments/:id/plan', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const [targets, actions] = await Promise.all([
      prisma.gkTarget.findMany({ where: { establishmentId: est.id }, orderBy: [{ area: 'asc' }, { createdAt: 'asc' }] }),
      prisma.gkAction.findMany({ where: { establishmentId: est.id }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    res.json({ targets, actions, checks: { targets: rules.checkTargets(targets, est), actions: rules.checkActions(actions, est) } });
  } catch (err) { sendError(res, err); }
});

router.post('/establishments/:id/targets', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const { data, errors } = parseFields(req.body, TARGET_SPEC, false);
    if (errors.length) return bad(res, errors);
    const t = await prisma.gkTarget.create({ data: { ...data, establishmentId: est.id } });
    log(req, 'GK_TARGET_CREATE', `Added target for ${est.name}`, { establishmentId: est.id, targetId: t.id });
    res.status(201).json(t);
  } catch (err) { sendError(res, err); }
});

router.put('/targets/:id', async (req, res) => {
  try {
    const t = await findOwned('gkTarget', req);
    if (!t) return notFound(res, 'Target');
    const { data, errors } = parseFields(req.body, TARGET_SPEC, true);
    if (errors.length) return bad(res, errors);
    const out = await prisma.gkTarget.update({ where: { id: t.id }, data });
    log(req, 'GK_TARGET_UPDATE', 'Updated target', { targetId: t.id });
    res.json(out);
  } catch (err) { sendError(res, err); }
});

router.delete('/targets/:id', async (req, res) => {
  try {
    const t = await findOwned('gkTarget', req);
    if (!t) return notFound(res, 'Target');
    await prisma.gkTarget.delete({ where: { id: t.id } });
    log(req, 'GK_TARGET_DELETE', 'Deleted target', { targetId: t.id });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

async function checkTargetRef(req, establishmentId, errors, data) {
  if (!has(req.body, 'targetId')) return;
  if (!req.body.targetId) { data.targetId = null; return; }
  const t = await prisma.gkTarget.findFirst({ where: { id: String(req.body.targetId), establishmentId } });
  if (!t) errors.push('targetId must be a target of this establishment.');
  else data.targetId = t.id;
}

router.post('/establishments/:id/actions', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const { data, errors } = parseFields(req.body, ACTION_SPEC, false);
    await checkTargetRef(req, est.id, errors, data);
    if (errors.length) return bad(res, errors);
    const a = await prisma.gkAction.create({ data: { ...data, establishmentId: est.id } });
    log(req, 'GK_ACTION_CREATE', `Added action for ${est.name}`, { establishmentId: est.id, actionId: a.id });
    res.status(201).json(a);
  } catch (err) { sendError(res, err); }
});

router.put('/actions/:id', async (req, res) => {
  try {
    const a = await findOwned('gkAction', req);
    if (!a) return notFound(res, 'Action');
    const { data, errors } = parseFields(req.body, ACTION_SPEC, true);
    await checkTargetRef(req, a.establishmentId, errors, data);
    if (errors.length) return bad(res, errors);
    const out = await prisma.gkAction.update({ where: { id: a.id }, data });
    log(req, 'GK_ACTION_UPDATE', 'Updated action', { actionId: a.id });
    res.json(out);
  } catch (err) { sendError(res, err); }
});

router.delete('/actions/:id', async (req, res) => {
  try {
    const a = await findOwned('gkAction', req);
    if (!a) return notFound(res, 'Action');
    await prisma.gkAction.delete({ where: { id: a.id } });
    log(req, 'GK_ACTION_DELETE', 'Deleted action', { actionId: a.id });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// ─── People and training (GK-18/19) ─────────────────────────────────────────

const TEAM_SPEC = {
  role: ['enum', { values: TEAM_ROLES, required: true }],
  name: ['str', { required: true, max: 120 }],
  position: ['str', { max: 120 }],
  email: ['str', { max: 200 }],
  permanentStaff: ['bool', { default: true }],
  fromDate: ['date'],
  toDate: ['date'],
};
const TRAINING_SPEC = {
  kind: ['enum', { values: TRAINING_KINDS, required: true }],
  topic: ['str', { required: true, max: 300 }],
  department: ['str', { max: 120 }],
  date: ['date', { required: true }],
  durationMin: ['int', { min: 0, max: 10000 }],
  format: ['str', { max: 60 }],
  participants: ['int', { min: 0, max: 100000 }],
  staffName: ['str', { max: 120 }],
  hireDate: ['date'],
  notes: ['str', { max: 1000 }],
};

router.get('/establishments/:id/people', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const [team, trainings] = await Promise.all([
      prisma.gkTeamMember.findMany({ where: { establishmentId: est.id }, orderBy: [{ toDate: 'desc' }, { fromDate: 'desc' }] }),
      prisma.gkTraining.findMany({ where: { establishmentId: est.id }, orderBy: { date: 'desc' } }),
    ]);
    const now = new Date();
    const year = int(req.query.year) || now.getUTCFullYear();
    res.json({
      team, trainings,
      checks: {
        team: rules.checkTeam(team, now),
        training: rules.checkTraining(trainings, est, { now, year }),
        trainingPrevious: rules.checkTraining(trainings, est, { now, year: year - 1 }),
      },
    });
  } catch (err) { sendError(res, err); }
});

// replaceCurrent: true closes the current representative/substitute (history kept).
router.post('/establishments/:id/team', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const { data, errors } = parseFields(req.body, TEAM_SPEC, false);
    if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) errors.push('email is not valid.');
    if (data.fromDate && data.toDate && data.toDate < data.fromDate) errors.push('toDate must be after fromDate.');
    if (errors.length) return bad(res, errors);
    const from = data.fromDate || new Date();
    const member = await prisma.$transaction(async (tx) => {
      if (bool(req.body.replaceCurrent) && data.role !== 'committee') {
        await tx.gkTeamMember.updateMany({ where: { establishmentId: est.id, role: data.role, OR: [{ toDate: null }, { toDate: { gt: from } }] }, data: { toDate: from } });
      }
      return tx.gkTeamMember.create({ data: { ...data, fromDate: from, establishmentId: est.id } });
    });
    log(req, 'GK_TEAM_ADD', `Added ${data.role} ${data.name} (${est.name})`, { establishmentId: est.id, memberId: member.id });
    res.status(201).json(member);
  } catch (err) { sendError(res, err); }
});

router.put('/team/:id', async (req, res) => {
  try {
    const m = await findOwned('gkTeamMember', req);
    if (!m) return notFound(res, 'Team member');
    const { data, errors } = parseFields(req.body, TEAM_SPEC, true);
    if (errors.length) return bad(res, errors);
    const out = await prisma.gkTeamMember.update({ where: { id: m.id }, data });
    log(req, 'GK_TEAM_UPDATE', `Updated team member ${out.name}`, { memberId: m.id });
    res.json(out);
  } catch (err) { sendError(res, err); }
});

router.delete('/team/:id', async (req, res) => {
  try {
    const m = await findOwned('gkTeamMember', req);
    if (!m) return notFound(res, 'Team member');
    await prisma.gkTeamMember.delete({ where: { id: m.id } });
    log(req, 'GK_TEAM_DELETE', `Deleted team member ${m.name}`, { memberId: m.id });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

function trainingErrors(d, merged) {
  const e = [];
  if (merged.kind === 'new_hire' && (!merged.hireDate || !merged.staffName)) e.push('New-hire trainings need staffName and hireDate.');
  if (merged.hireDate && merged.date && new Date(merged.date) < new Date(merged.hireDate)) e.push('Training date cannot be before the hire date.');
  void d;
  return e;
}

router.post('/establishments/:id/trainings', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const { data, errors } = parseFields(req.body, TRAINING_SPEC, false);
    if (!errors.length) errors.push(...trainingErrors(data, data));
    if (errors.length) return bad(res, errors);
    const t = await prisma.gkTraining.create({ data: { ...data, establishmentId: est.id } });
    log(req, 'GK_TRAINING_ADD', `Logged ${data.kind} (${est.name})`, { establishmentId: est.id, trainingId: t.id });
    res.status(201).json(t);
  } catch (err) { sendError(res, err); }
});

router.put('/trainings/:id', async (req, res) => {
  try {
    const t = await findOwned('gkTraining', req);
    if (!t) return notFound(res, 'Training');
    const { data, errors } = parseFields(req.body, TRAINING_SPEC, true);
    if (!errors.length) errors.push(...trainingErrors(data, { ...t, ...data }));
    if (errors.length) return bad(res, errors);
    const out = await prisma.gkTraining.update({ where: { id: t.id }, data });
    log(req, 'GK_TRAINING_UPDATE', 'Updated training', { trainingId: t.id });
    res.json(out);
  } catch (err) { sendError(res, err); }
});

router.delete('/trainings/:id', async (req, res) => {
  try {
    const t = await findOwned('gkTraining', req);
    if (!t) return notFound(res, 'Training');
    await prisma.gkTraining.delete({ where: { id: t.id } });
    log(req, 'GK_TRAINING_DELETE', 'Deleted training', { trainingId: t.id });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// ─── Audit and certification (GK-27/28) ─────────────────────────────────────

const CERT_SPEC = {
  periodNumber: ['int', { required: true, min: 1, max: 50 }],
  criteriaVersion: ['enum', { values: library.VERSIONS }],
  status: ['enum', { values: CERT_STATUSES, default: 'applied' }],
  auditDate: ['date'],
  validFrom: ['date'],
  validTo: ['date'],
  surveillanceDate: ['date'],
  notes: ['str', { max: 1000 }],
};
const NC_SPEC = {
  criterionCode: ['str', { max: 20 }],
  description: ['str', { required: true, max: 1000 }],
  raisedAt: ['date'],
  deadline: ['date'],
  status: ['enum', { values: ['open', 'closed'], default: 'open' }],
  closureNote: ['str', { max: 1000 }],
};

router.get('/establishments/:id/audit', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const [certs, ncs] = await Promise.all([
      prisma.gkCertification.findMany({ where: { establishmentId: est.id } }),
      prisma.gkNonConformity.findMany({ where: { establishmentId: est.id }, orderBy: [{ status: 'desc' }, { deadline: 'asc' }] }),
    ]);
    const now = new Date();
    res.json({
      certifications: workspace.certificatesWithTimers(certs, now),
      nonConformities: ncs.map((n) => ({ ...n, overdue: n.status === 'open' && new Date(n.deadline) < now })),
      ncSummary: lifecycle.ncSummary(ncs, now),
      requirement: rules.guidelineRequirement(est, certs, now),
    });
  } catch (err) { sendError(res, err); }
});

router.post('/establishments/:id/certifications', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const { data, errors } = parseFields(req.body, CERT_SPEC, false);
    if (data.validFrom && data.validTo && data.validTo <= data.validFrom) errors.push('validTo must be after validFrom.');
    if (errors.length) return bad(res, errors);
    if (!data.criteriaVersion) data.criteriaVersion = est.criteriaVersion;
    if (data.validFrom && !data.validTo) data.validTo = lifecycle.defaultValidTo(data.validFrom);
    const c = await prisma.gkCertification.create({ data: { ...data, establishmentId: est.id } });
    log(req, 'GK_CERT_CREATE', `Recorded certificate period ${c.periodNumber} (${c.status}) for ${est.name}`, { establishmentId: est.id, certificationId: c.id });
    res.status(201).json({ ...c, timers: lifecycle.certificateTimers(c) });
  } catch (err) { sendError(res, err); }
});

router.put('/certifications/:id', async (req, res) => {
  try {
    const c = await findOwned('gkCertification', req);
    if (!c) return notFound(res, 'Certificate');
    const { data, errors } = parseFields(req.body, CERT_SPEC, true);
    const vf = data.validFrom !== undefined ? data.validFrom : c.validFrom;
    if (data.validFrom && !has(req.body, 'validTo')) data.validTo = lifecycle.defaultValidTo(data.validFrom);
    const vt = data.validTo !== undefined ? data.validTo : c.validTo;
    if (vf && vt && vt <= vf) errors.push('validTo must be after validFrom.');
    if (errors.length) return bad(res, errors);
    const out = await prisma.gkCertification.update({ where: { id: c.id }, data });
    log(req, 'GK_CERT_UPDATE', `Certificate period ${out.periodNumber} → ${out.status}`, { certificationId: c.id, from: c.status, to: out.status });
    res.json({ ...out, timers: lifecycle.certificateTimers(out) });
  } catch (err) { sendError(res, err); }
});

router.delete('/certifications/:id', async (req, res) => {
  try {
    const c = await findOwned('gkCertification', req);
    if (!c) return notFound(res, 'Certificate');
    await prisma.gkCertification.delete({ where: { id: c.id } });
    log(req, 'GK_CERT_DELETE', `Deleted certificate period ${c.periodNumber}`, { certificationId: c.id });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

router.post('/establishments/:id/ncs', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const { data, errors } = parseFields(req.body, NC_SPEC, false);
    if (req.body.certificationId) {
      const c = await prisma.gkCertification.findFirst({ where: { id: String(req.body.certificationId), establishmentId: est.id } });
      if (!c) errors.push('certificationId must be a certificate of this establishment.');
      else data.certificationId = c.id;
    }
    if (errors.length) return bad(res, errors);
    const raisedAt = data.raisedAt || new Date();
    const nc = await prisma.gkNonConformity.create({
      data: { ...data, raisedAt, deadline: data.deadline || lifecycle.defaultNcDeadline(raisedAt), closedAt: data.status === 'closed' ? new Date() : null, establishmentId: est.id },
    });
    log(req, 'GK_NC_CREATE', `Non-conformity ${nc.criterionCode || ''} raised for ${est.name}`, { establishmentId: est.id, ncId: nc.id });
    res.status(201).json(nc);
  } catch (err) { sendError(res, err); }
});

router.put('/ncs/:id', async (req, res) => {
  try {
    const nc = await findOwned('gkNonConformity', req);
    if (!nc) return notFound(res, 'Non-conformity');
    const { data, errors } = parseFields(req.body, NC_SPEC, true);
    if (errors.length) return bad(res, errors);
    if (data.status === 'closed' && nc.status !== 'closed') data.closedAt = new Date();
    if (data.status === 'open') data.closedAt = null;
    const out = await prisma.gkNonConformity.update({ where: { id: nc.id }, data });
    log(req, 'GK_NC_UPDATE', `Non-conformity ${out.criterionCode || ''} → ${out.status}`, { ncId: nc.id });
    res.json(out);
  } catch (err) { sendError(res, err); }
});

router.delete('/ncs/:id', async (req, res) => {
  try {
    const nc = await findOwned('gkNonConformity', req);
    if (!nc) return notFound(res, 'Non-conformity');
    await prisma.gkNonConformity.delete({ where: { id: nc.id } });
    log(req, 'GK_NC_DELETE', 'Deleted non-conformity', { ncId: nc.id });
    res.json({ ok: true });
  } catch (err) { sendError(res, err); }
});

// All certificates across establishments (expiry calendar).
router.get('/certificates', async (req, res) => {
  try {
    const certs = await prisma.gkCertification.findMany({
      where: { establishment: { client: { companyId: req.user.companyId } } },
      include: { establishment: { select: { id: true, name: true, city: true, client: { select: { id: true, name: true } } } } },
    });
    const out = workspace.certificatesWithTimers(certs)
      .sort((a, b) => String(a.timers.validTo || '9999').localeCompare(String(b.timers.validTo || '9999')));
    res.json(out);
  } catch (err) { sendError(res, err); }
});

// ─── Portfolio (GK-29) ──────────────────────────────────────────────────────

router.get('/portfolio', async (req, res) => {
  try {
    const ests = await prisma.gkEstablishment.findMany({
      where: { client: { companyId: req.user.companyId } },
      include: { client: { select: { id: true, name: true } }, brand: { select: { id: true, name: true } } },
      orderBy: [{ client: { name: 'asc' } }, { name: 'asc' }],
    });
    const now = new Date();
    const cards = [];
    for (const est of ests) {
      const o = await workspace.overview(prisma, req.user.companyId, est, now);
      const cert = o.currentCertificate;
      const deadlines = [
        ...o.alerts.filter((a) => a.due).map((a) => ({ date: a.due, label: a.text })),
        ...o.tasks.filter((t) => t.dueDate).map((t) => ({ date: new Date(t.dueDate).toISOString().slice(0, 10), label: `${t.code} ${t.title}` })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      cards.push({
        id: est.id, name: est.name, city: est.city, country: est.country, client: est.client, brand: est.brand,
        readinessPct: o.summary.readinessPct, imperativeGaps: o.summary.imperativeGaps, applicable: o.summary.applicable,
        guideline: o.summary.guideline, period: o.requirement.period,
        certificate: cert ? { id: cert.id, status: cert.timers.effectiveStatus, validTo: cert.timers.validTo, daysToExpiry: cert.timers.daysToExpiry, periodNumber: cert.periodNumber } : null,
        nextDeadline: deadlines.find((d) => d.date >= now.toISOString().slice(0, 10)) || deadlines[0] || null,
        kpis: o.kpis.intensities, kpiPeriod: o.kpis.period,
        alerts: o.alerts,
      });
    }
    const league = cards
      .map((c) => ({ id: c.id, name: c.name, client: c.client.name, kwhPerGuestNight: c.kpis?.kwhPerGuestNight ?? null, kgCo2ePerOccupiedRoom: c.kpis?.kgCo2ePerOccupiedRoom ?? null, litresPerGuestNight: c.kpis?.litresPerGuestNight ?? null, recyclingRatePct: c.kpis?.recyclingRatePct ?? null }))
      .sort((a, b) => (a.kwhPerGuestNight ?? Infinity) - (b.kwhPerGuestNight ?? Infinity));
    const alerts = cards.flatMap((c) => c.alerts);
    res.json({
      establishments: cards.map(({ alerts: _a, ...c }) => c),
      league,
      alerts,
      totals: {
        establishments: cards.length,
        clients: new Set(cards.map((c) => c.client.id)).size,
        avgReadiness: cards.length ? Math.round((cards.reduce((s, c) => s + c.readinessPct, 0) / cards.length) * 10) / 10 : 0,
        imperativeGaps: cards.reduce((s, c) => s + c.imperativeGaps, 0),
        criticalAlerts: alerts.filter((a) => a.severity === 'critical').length,
      },
    });
  } catch (err) { sendError(res, err); }
});

// ─── Audit pack (GK-25, simplified XLSX) ────────────────────────────────────

router.get('/establishments/:id/audit-pack', async (req, res) => {
  try {
    const est = await findEst(req);
    if (!est) return notFound(res, 'Establishment');
    const buf = await buildAuditPack(prisma, req.user.companyId, est);
    const safe = est.name.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '_') || 'establishment';
    log(req, 'GK_AUDIT_PACK', `Exported audit pack for ${est.name}`, { establishmentId: est.id });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="GreenKeyReadiness_AuditPack_${safe}.xlsx"`);
    res.send(buf);
  } catch (err) { sendError(res, err); }
});

module.exports = router;
// Exposed for unit tests.
module.exports._internals = { parseResource, parseOccupancy, parseEstablishment };
