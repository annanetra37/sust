'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// factors.js — factor library upload and the grid fallback (FE-E5)
//
// Factor CSV columns: kind,key,region,currency,unit,value,scope1Share,notes
// Units are fixed per kind (pcaf.FACTOR_KINDS); a blank unit takes the default.
// No real factor values ship in code: tenants upload their own, and the demo
// seed ships a set flagged illustrative.
// ─────────────────────────────────────────────────────────────────────────────

const loanTape = require('./loanTape');
const { FACTOR_KINDS } = require('./pcaf');
const buildingEnergy = require('../buildingEnergy');

const FACTOR_COLUMNS = ['kind', 'key', 'region', 'currency', 'unit', 'value', 'scope1Share', 'notes'];
const MAX_FACTORS = 5000;

/** Parse a factor CSV/XLSX → { factors, errors }. All-or-nothing at the route. */
function parseFactorFile(buffer, fileName) {
  const XLSX = require('xlsx');
  const isCsv = /\.(csv|txt)$/i.test(fileName || '');
  const wb = isCsv
    ? XLSX.read(buffer.toString('utf8').replace(/^﻿/, ''), { type: 'string', raw: true })
    : XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = ws ? XLSX.utils.sheet_to_json(ws, { raw: true, defval: null }) : [];
  return validateFactors(rows.map((r, i) => ({ ...r, _row: i + 2 })));
}

function validateFactors(rows) {
  const factors = []; const errors = [];
  if (rows.length > MAX_FACTORS) return { factors, errors: [{ row: 0, field: 'file', message: `At most ${MAX_FACTORS} factors per upload.` }] };
  const seen = new Set();
  for (const r of rows) {
    const row = r._row;
    const get = (k) => (r[k] == null || String(r[k]).trim() === '' ? null : String(r[k]).trim());
    const err = (field, message) => errors.push({ row, field, message });
    const kind = get('kind');
    if (!FACTOR_KINDS[kind]) { err('kind', `Must be one of: ${Object.keys(FACTOR_KINDS).join(', ')}.`); continue; }
    const key = get('key');
    if (!key) { err('key', 'Required.'); continue; }
    const value = Number(get('value'));
    if (get('value') == null || !isFinite(value) || value < 0) { err('value', 'Must be a non-negative number.'); continue; }
    const share = get('scope1Share') == null ? null : Number(get('scope1Share'));
    if (share != null && !(share >= 0 && share <= 1)) { err('scope1Share', 'Must be between 0 and 1.'); continue; }
    const currency = get('currency') ? get('currency').toUpperCase() : null;
    if (currency && !/^[A-Z]{3}$/.test(currency)) { err('currency', 'Must be a 3-letter currency code.'); continue; }
    if ((kind === 'revenue_sector' || kind === 'asset_sector') && !currency) { err('currency', `Required for ${kind} factors.`); continue; }
    const region = get('region') ? get('region').toUpperCase() : null;
    const unit = get('unit') || FACTOR_KINDS[kind];
    if (unit !== FACTOR_KINDS[kind]) { err('unit', `Unit for ${kind} must be "${FACTOR_KINDS[kind]}".`); continue; }
    const dup = `${kind}|${key.toUpperCase()}|${region || ''}|${currency || ''}`;
    if (seen.has(dup)) { err('key', 'Duplicate kind/key/region/currency in this file.'); continue; }
    seen.add(dup);
    factors.push({ kind, key: key.toUpperCase(), region, currency, unit, value, scope1Share: share, notes: get('notes') ? get('notes').slice(0, 500) : null });
  }
  return { factors, errors };
}

function factorTemplateCsv() {
  return loanTape.toCsv(FACTOR_COLUMNS, [
    { kind: 'revenue_sector', key: '55.10', region: 'AM', currency: 'AMD', unit: FACTOR_KINDS.revenue_sector, value: '', scope1Share: '', notes: 'Fill in from your licensed source' },
    { kind: 'asset_sector', key: 'C', region: '', currency: 'AMD', unit: FACTOR_KINDS.asset_sector, value: '', notes: '' },
    { kind: 'building_benchmark', key: 'office', region: 'AM', unit: FACTOR_KINDS.building_benchmark, value: '', notes: '' },
    { kind: 'energy_label', key: 'C', region: 'AM', unit: FACTOR_KINDS.energy_label, value: '', notes: '' },
    { kind: 'grid', key: 'AM', region: 'AM', unit: FACTOR_KINDS.grid, value: '', notes: '' },
  ]);
}

/**
 * Electricity grid factor from the building-energy module, used when the
 * factor set has no `grid` entry.  Returns { value, source } or null.
 */
function gridFallback(country) {
  const { factor, warning } = buildingEnergy.emissionFactor('electricity', country || 'GLO');
  if (!factor || factor.value == null) return null;
  const src = factor.status === 'legacy' ? 'legacy Triple I default, source not documented' : (factor.source || factor.status);
  return { value: factor.value, source: warning ? `${src}; ${warning}` : src };
}

module.exports = { FACTOR_COLUMNS, parseFactorFile, validateFactors, factorTemplateCsv, gridFallback };
