'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// library.js — criteria library (GK-03).
//
// Global criteria (companyId null) are seeded from data/gk-criteria-2026-2031.json
// on first use (idempotent: create missing, refresh content of existing).
// A tenant (consultant) can add its own criteria; a tenant criterion with the
// same version + category + code replaces the global one for that tenant —
// this is how the domain owner loads and corrects the full library.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs');
const { validateRules } = require('./applicability');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'gk-criteria-2026-2031.json');
const VERSIONS = ['2026-2031', '2022-2026'];
const CATEGORIES = ['hotels_hostels', 'small_accommodations', 'campsites', 'other'];
const AUDIT_METHODS = ['document', 'sampling', 'visual', 'interview'];
const DATA_LINKS = ['energy', 'water', 'waste', 'occupancy', 'targets', 'actions', 'team', 'training'];
const CATEGORY = 'hotels_hostels';

let data = null;
function libraryData() {
  if (!data) data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  return data;
}

let seeding = null;
/** Idempotently seed the global library. Safe to call on every request. */
function ensureGlobalLibrary(prisma) {
  if (!seeding) {
    seeding = seedGlobal(prisma).catch((err) => { seeding = null; throw err; });
  }
  return seeding;
}

async function seedGlobal(prisma) {
  const lib = libraryData();
  let created = 0; let updated = 0;
  for (const [version, list] of Object.entries(lib.versions)) {
    const existing = await prisma.gkCriterion.findMany({ where: { companyId: null, version, category: CATEGORY } });
    const byCode = new Map(existing.map((c) => [c.code, c]));
    for (const [i, c] of list.entries()) {
      const row = {
        version, category: CATEGORY, code: c.code, area: c.area, subArea: c.subArea || null,
        title: c.title, guidance: c.guidance || null, type: c.type, applicability: c.applicability || {},
        evidenceTypes: c.evidenceTypes || [], auditMethod: c.auditMethod || null, dataLink: c.dataLink || null,
        sortOrder: i,
      };
      const ex = byCode.get(c.code);
      if (!ex) { await prisma.gkCriterion.create({ data: { ...row, companyId: null } }); created++; } else if (ex.title !== row.title || ex.guidance !== row.guidance || ex.type !== row.type || JSON.stringify(ex.applicability) !== JSON.stringify(row.applicability)) {
        await prisma.gkCriterion.update({ where: { id: ex.id }, data: row });
        updated++;
      }
    }
  }
  return { created, updated };
}

/**
 * Criteria in force for a tenant: global ∪ tenant, tenant overriding global by code.
 * filters: { version, category, area, type }
 */
async function loadCriteria(prisma, companyId, filters = {}) {
  await ensureGlobalLibrary(prisma);
  const where = { OR: [{ companyId: null }, { companyId }] };
  if (filters.version) where.version = filters.version;
  where.category = filters.category || CATEGORY;
  if (filters.area) where.area = Number(filters.area);
  const all = await prisma.gkCriterion.findMany({ where, orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }] });
  const byKey = new Map();
  for (const c of all) {
    const k = `${c.version}|${c.code}`;
    const prev = byKey.get(k);
    if (!prev || (c.companyId && !prev.companyId)) byKey.set(k, { ...c, overridesGlobal: !!(prev && c.companyId) });
    else if (prev && prev.companyId && !c.companyId) prev.overridesGlobal = true;
  }
  let list = [...byKey.values()];
  if (filters.type) list = list.filter((c) => c.type === filters.type || (c.applicability && c.applicability.typeByEmployees && [c.applicability.typeByEmployees.above, c.applicability.typeByEmployees.atOrBelow].includes(filters.type)));
  return list;
}

/** Validate / normalise a criterion from user input. */
function parseCriterion(body, partial = false) {
  const errors = [];
  const d = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (!partial || has('code')) {
    d.code = String(body.code ?? '').trim();
    if (!/^[0-9]{1,2}(\.[0-9]{1,3}){0,2}[a-z]?$/i.test(d.code)) errors.push('code must look like 3.1 or 1.20.');
  }
  if (!partial || has('version')) {
    d.version = body.version || '2026-2031';
    if (!VERSIONS.includes(d.version)) errors.push(`version must be one of ${VERSIONS.join(', ')}.`);
  }
  if (has('category')) {
    d.category = body.category || CATEGORY;
    if (!CATEGORIES.includes(d.category)) errors.push(`category must be one of ${CATEGORIES.join(', ')}.`);
  }
  if (!partial || has('area')) {
    d.area = parseInt(body.area, 10);
    if (!(d.area >= 1 && d.area <= 7)) errors.push('area must be 1–7.');
  }
  if (!partial || has('title')) {
    d.title = String(body.title ?? '').trim();
    if (!d.title) errors.push('title is required.');
    else if (d.title.length > 200) errors.push('title must be 200 characters or fewer (paraphrase, do not copy criteria text).');
  }
  if (has('subArea')) d.subArea = body.subArea ? String(body.subArea).trim().slice(0, 120) : null;
  if (has('guidance')) {
    d.guidance = body.guidance ? String(body.guidance).trim() : null;
    if (d.guidance && d.guidance.length > 1500) errors.push('guidance must be 1500 characters or fewer (paraphrased guidance only).');
  }
  if (!partial || has('type')) {
    d.type = body.type;
    if (!['imperative', 'guideline'].includes(d.type)) errors.push('type must be imperative or guideline.');
  }
  if (has('applicability')) {
    let a = body.applicability;
    if (typeof a === 'string') {
      try { a = a.trim() ? JSON.parse(a) : {}; } catch { errors.push('applicability is not valid JSON.'); a = undefined; }
    }
    if (a !== undefined) {
      const e = validateRules(a);
      if (e.length) errors.push(...e); else d.applicability = a || {};
    }
  } else if (!partial) d.applicability = {};
  if (has('evidenceTypes')) {
    const v = body.evidenceTypes;
    d.evidenceTypes = (Array.isArray(v) ? v : String(v || '').split(/[;|]/)).map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
  }
  if (has('auditMethod')) {
    d.auditMethod = body.auditMethod || null;
    if (d.auditMethod && !AUDIT_METHODS.includes(d.auditMethod)) errors.push(`auditMethod must be one of ${AUDIT_METHODS.join(', ')}.`);
  }
  if (has('dataLink')) {
    d.dataLink = body.dataLink || null;
    if (d.dataLink && !DATA_LINKS.includes(d.dataLink)) errors.push(`dataLink must be one of ${DATA_LINKS.join(', ')}.`);
  }
  if (has('sortOrder')) d.sortOrder = parseInt(body.sortOrder, 10) || 0;
  return { data: d, errors };
}

// CSV columns accepted by the import (header row required).
const IMPORT_COLUMNS = ['code', 'version', 'area', 'subArea', 'title', 'guidance', 'type', 'applicability', 'evidenceTypes', 'auditMethod', 'dataLink'];

function parseCsv(text) {
  const rows = [];
  let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

module.exports = {
  VERSIONS, CATEGORIES, AUDIT_METHODS, DATA_LINKS, CATEGORY, IMPORT_COLUMNS,
  libraryData, ensureGlobalLibrary, loadCriteria, parseCriterion, parseCsv,
};
