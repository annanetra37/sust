'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// loanTape.js — loan tape templates, parsing and row validation (FE-02/FE-03)
//
// Policy: a file is validated row by row; valid rows are accepted and invalid
// rows are rejected with a list of { row, field, message } (row = spreadsheet
// row number, header = row 1).  Re-uploading a facilityRef that already
// exists in the period with the same asset class updates that line (delta);
// the same facilityRef under another asset class is rejected.
// ─────────────────────────────────────────────────────────────────────────────

const XLSX = require('xlsx');
const crypto = require('crypto');
const nace = require('./nace');

const TAPE_CLASSES = ['business_loans', 'commercial_re', 'mortgages', 'motor_vehicle', 'project_finance'];
const CORPORATE = ['business_loans', 'project_finance'];
const REAL_ESTATE = ['commercial_re', 'mortgages'];
const VALUE_BASED = ['commercial_re', 'mortgages', 'motor_vehicle'];
const MAX_ROWS = 20000;

// key, type, which classes show it in the template, which require it.
const COLUMNS = [
  { key: 'facilityRef', type: 'string', classes: TAPE_CLASSES, required: TAPE_CLASSES },
  { key: 'counterpartyId', type: 'string', classes: TAPE_CLASSES, required: CORPORATE },
  { key: 'counterpartyIsPseudonym', type: 'bool', classes: TAPE_CLASSES },
  { key: 'counterpartyName', type: 'string', classes: TAPE_CLASSES },
  { key: 'outstanding', type: 'number', classes: TAPE_CLASSES, required: TAPE_CLASSES },
  { key: 'undrawn', type: 'number', classes: TAPE_CLASSES },
  { key: 'currency', type: 'string', classes: TAPE_CLASSES, required: TAPE_CLASSES },
  { key: 'originationDate', type: 'date', classes: TAPE_CLASSES },
  { key: 'branch', type: 'string', classes: TAPE_CLASSES },
  { key: 'segment', type: 'string', classes: TAPE_CLASSES },
  { key: 'relationshipManager', type: 'string', classes: TAPE_CLASSES },
  { key: 'country', type: 'string', classes: TAPE_CLASSES },
  { key: 'naceCode', type: 'string', classes: [...CORPORATE, 'commercial_re'] },
  { key: 'localSectorCode', type: 'string', classes: [...CORPORATE, 'commercial_re'] },
  { key: 'revenue', type: 'number', classes: CORPORATE },
  { key: 'revenueCurrency', type: 'string', classes: CORPORATE },
  { key: 'equityPlusDebt', type: 'number', classes: CORPORATE },
  { key: 'valueAtOrigination', type: 'number', classes: VALUE_BASED, required: VALUE_BASED },
  { key: 'propertyType', type: 'string', classes: REAL_ESTATE },
  { key: 'floorAreaM2', type: 'number', classes: REAL_ESTATE },
  { key: 'energyKwh', type: 'number', classes: REAL_ESTATE },
  { key: 'energyLabel', type: 'string', classes: REAL_ESTATE },
];
const BY_NORM = new Map(COLUMNS.map((c) => [c.key.toLowerCase(), c]));
const ALIASES = { facilityid: 'facilityRef', clientid: 'counterpartyId', counterparty: 'counterpartyId', nace: 'naceCode', amount: 'outstanding', outstandingamount: 'outstanding', ccy: 'currency', floorarea: 'floorAreaM2', energy: 'energyKwh' };

const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function columnFor(header) {
  const h = norm(header);
  return BY_NORM.get(h) || (ALIASES[h] ? BY_NORM.get(ALIASES[h].toLowerCase()) : null);
}

/** Template columns for an asset class. */
function templateColumns(assetClass) {
  return COLUMNS.filter((c) => c.classes.includes(assetClass)).map((c) => c.key);
}

// Synthetic sample rows (clearly fake references) for the templates.
const SAMPLES = {
  business_loans: [
    { facilityRef: 'BL-0001', counterpartyId: 'CLIENT-1001', counterpartyName: '', outstanding: 90000000, undrawn: 10000000, currency: 'AMD', originationDate: '2023-03-15', branch: 'Yerevan Centre', segment: 'SME', country: 'AM', naceCode: '55.10', revenue: 850000000, revenueCurrency: 'AMD', equityPlusDebt: 500000000 },
    { facilityRef: 'BL-0002', counterpartyId: 'CLIENT-1002', outstanding: 40000000, currency: 'AMD', branch: 'Gyumri', segment: 'Corporate', country: 'AM', naceCode: '10', equityPlusDebt: 300000000 },
  ],
  commercial_re: [
    { facilityRef: 'CRE-0001', counterpartyId: 'CLIENT-2001', outstanding: 300000000, currency: 'AMD', originationDate: '2022-06-01', branch: 'Yerevan Centre', segment: 'Corporate', country: 'AM', naceCode: '68.20', valueAtOrigination: 600000000, propertyType: 'office', floorAreaM2: 2400, energyKwh: 360000 },
  ],
  mortgages: [
    { facilityRef: 'MTG-0001', outstanding: 25000000, currency: 'AMD', originationDate: '2021-09-10', branch: 'Vanadzor', segment: 'Retail', country: 'AM', valueAtOrigination: 40000000, propertyType: 'residential', floorAreaM2: 85, energyLabel: 'C' },
  ],
  motor_vehicle: [
    { facilityRef: 'MV-0001', counterpartyId: 'CLIENT-3001', outstanding: 6000000, currency: 'AMD', originationDate: '2024-02-01', segment: 'Retail', country: 'AM', valueAtOrigination: 9000000 },
  ],
  project_finance: [
    { facilityRef: 'PF-0001', counterpartyId: 'SPV-4001', outstanding: 800000000, currency: 'AMD', originationDate: '2023-01-20', segment: 'Project', country: 'AM', naceCode: '35.11', equityPlusDebt: 2000000000 },
  ],
};

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function toCsv(header, rows) {
  return `${[header.map(csvCell).join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n')}\n`;
}

function templateCsv(assetClass) {
  return toCsv(templateColumns(assetClass), SAMPLES[assetClass] || []);
}

/** Pseudonymised stable id: sha256(companyId + ':' + bank client id), hex. */
function stableIdFor(companyId, clientId) {
  return crypto.createHash('sha256').update(`${companyId}:${String(clientId).trim()}`).digest('hex');
}

// ─── Parsing ────────────────────────────────────────────────────────────────

/**
 * Read a CSV or XLSX buffer into { rows: [{ rowNumber, values }], unknown }.
 * CSV is read as text (so "55.10" stays "55.10"); XLSX keeps typed cells.
 */
function parseFile(buffer, fileName = '') {
  const isCsv = /\.(csv|txt)$/i.test(fileName);
  const wb = isCsv
    ? XLSX.read(buffer.toString('utf8').replace(/^﻿/, ''), { type: 'string', raw: true })
    : XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], unknown: [], header: [] };
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  if (!aoa.length) return { rows: [], unknown: [], header: [] };
  const header = aoa[0].map((h) => (h == null ? '' : String(h).trim()));
  const cols = header.map(columnFor);
  const unknown = header.filter((h, i) => h && !cols[i]);
  const rows = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || r.every((v) => v == null || String(v).trim() === '')) continue;
    const values = {};
    cols.forEach((c, j) => { if (c && r[j] != null && String(r[j]).trim() !== '') values[c.key] = r[j]; });
    rows.push({ rowNumber: i + 1, values });
  }
  return { rows, unknown, header };
}

// ─── Validation ─────────────────────────────────────────────────────────────

function toNumber(v) {
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/[\s_]/g, '');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s) ? Number(s) : NaN;
}

function toDate(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{2})[./](\d{2})[./](\d{4})$/); // DD.MM.YYYY
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}

const toBool = (v) => (typeof v === 'boolean' ? v : /^(y|yes|true|1)$/i.test(String(v).trim()));

/**
 * Validate parsed rows for one asset class.
 *   existing: Map facilityRef → assetClass of lines already in the period.
 * Returns { valid: [{ rowNumber, data }], errors: [{ row, field, message }] }.
 */
function validateRows(rows, assetClass, { existing = new Map() } = {}) {
  const errors = [];
  const valid = [];
  const seen = new Map();
  const required = COLUMNS.filter((c) => (c.required || []).includes(assetClass));

  for (const { rowNumber, values } of rows) {
    const rowErrors = [];
    const err = (field, message) => rowErrors.push({ row: rowNumber, field, message });
    const data = {};

    for (const col of COLUMNS) {
      const v = values[col.key];
      if (v == null) continue;
      if (col.type === 'number') {
        const x = toNumber(v);
        if (!isFinite(x)) err(col.key, `"${v}" is not a number.`);
        else if (x < 0) err(col.key, 'Must not be negative.');
        else data[col.key] = x;
      } else if (col.type === 'date') {
        const d = toDate(v);
        if (!d) err(col.key, `"${v}" is not a date (use YYYY-MM-DD).`);
        else data[col.key] = d;
      } else if (col.type === 'bool') {
        data[col.key] = toBool(v);
      } else {
        data[col.key] = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim().slice(0, 200);
      }
    }
    for (const col of required) {
      if (values[col.key] == null) err(col.key, 'Required.');
    }
    for (const k of ['currency', 'revenueCurrency']) {
      if (data[k] != null) {
        data[k] = data[k].toUpperCase();
        if (!/^[A-Z]{3}$/.test(data[k])) err(k, `"${data[k]}" is not a 3-letter ISO 4217 currency code.`);
      }
    }
    if (data.country != null) {
      data.country = data.country.toUpperCase();
      if (!/^[A-Z]{2}$/.test(data.country)) err('country', `"${data.country}" is not a 2-letter ISO country code.`);
    }
    if (data.naceCode != null) {
      data.naceCode = data.naceCode.toUpperCase();
      if (!nace.parse(data.naceCode)) err('naceCode', `"${data.naceCode}" is not a NACE Rev.2 code (e.g. 55.10, 55 or I).`);
    }
    if (data.valueAtOrigination === 0 && VALUE_BASED.includes(assetClass)) err('valueAtOrigination', 'Must be greater than 0.');
    if (data.equityPlusDebt === 0) err('equityPlusDebt', 'Must be greater than 0 (leave empty if unknown).');
    if (data.energyLabel != null) data.energyLabel = data.energyLabel.toUpperCase();
    if (data.originationDate && data.originationDate > new Date()) err('originationDate', 'Cannot be in the future.');

    if (data.facilityRef) {
      const ref = data.facilityRef;
      if (seen.has(ref)) err('facilityRef', `Duplicate of row ${seen.get(ref)} in this file.`);
      else seen.set(ref, rowNumber);
      const other = existing.get(ref);
      if (other && other !== assetClass) err('facilityRef', `Already in this period as a ${other} line; facility references must be unique.`);
    }

    if (rowErrors.length) errors.push(...rowErrors);
    else valid.push({ rowNumber, data });
  }
  return { valid, errors };
}

function errorsCsv(errors) {
  return toCsv(['row', 'field', 'message'], errors || []);
}

module.exports = {
  TAPE_CLASSES,
  COLUMNS,
  MAX_ROWS,
  templateColumns,
  templateCsv,
  stableIdFor,
  parseFile,
  validateRows,
  errorsCsv,
  toCsv,
};
