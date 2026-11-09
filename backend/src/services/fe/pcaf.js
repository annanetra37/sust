'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// pcaf.js — PCAF Part A (3rd edition) line engine (FE-06 / FE-07 / FE-14)
//
// Pure functions: no database, no clock.  Every line gets
//   financed = attribution × asset (counterparty or property) emissions
// with a PCAF data-quality score, a method code and a one-sentence
// explanation — or an `exception` with a plain-language reason.  A missing
// denominator is never defaulted (the legacy services/pcafEngine.js fell back
// to the outstanding amount, which silently produced attribution = 1).
//
// Method codes stored on FeLineResult.method: "<code>" or "<code>@<kind>:<key>"
// when a library factor was used, so the lineage view can find the factor.
// ─────────────────────────────────────────────────────────────────────────────

const nace = require('./nace');

const METHODOLOGY_VERSION = 'PCAF-A-3ed-2025.12/triplei-1';

const ASSET_CLASSES = ['business_loans', 'commercial_re', 'mortgages', 'motor_vehicle', 'project_finance'];
const RE_CLASSES = new Set(['commercial_re', 'mortgages']);
const CORPORATE_CLASSES = new Set(['business_loans', 'project_finance']);

const FACTOR_KINDS = {
  revenue_sector: 'tCO2e/M revenue',
  asset_sector: 'tCO2e/M outstanding',
  building_benchmark: 'kWh/m2/yr',
  energy_label: 'kWh/m2/yr',
  grid: 'kgCO2e/kWh',
};

// Sourcing ladder for counterparty emission records (business loans / PF).
const EMISSION_SOURCES = ['reported', 'energy', 'production'];
function recordScore(r) {
  if (r.source === 'reported') return r.verified ? 1 : 2;
  if (r.source === 'energy') return 2;
  if (r.source === 'production') return 3;
  return null;
}
const RECORD_METHOD = { 1: 'reported_verified', 2: 'reported', 3: 'production' };

// ─── Number formatting for explanations ────────────────────────────────────

function n(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  const dp = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4;
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: dp });
}
const money = (v, cur) => `${cur} ${n(v / 1e6)}M`;

// ─── Factor library ────────────────────────────────────────────────────────

/**
 * Index a factor set for lookup.  `set` is { id, name, version, source,
 * illustrative } (or null), `factors` the FeFactor rows.
 */
function buildFactorIndex(set, factors = []) {
  const byKind = new Map();
  for (const f of factors) {
    const key = String(f.key).trim().toUpperCase();
    if (!byKind.has(f.kind)) byKind.set(f.kind, new Map());
    const m = byKind.get(f.kind);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(f);
  }
  return { set: set || null, byKind };
}

/**
 * First factor matching one of `keys` (in order).  Within a key a factor for
 * the exact region wins over a region-less one; when `currency` is given a
 * factor with a different currency is skipped.
 */
function findFactor(index, kind, keys, { region, currency } = {}) {
  const m = index && index.byKind.get(kind);
  if (!m) return null;
  const reg = region ? String(region).toUpperCase() : null;
  for (const k of keys) {
    const list = (m.get(String(k).trim().toUpperCase()) || [])
      .filter((f) => !currency || !f.currency || f.currency.toUpperCase() === currency.toUpperCase());
    const hit = (reg && list.find((f) => f.region && f.region.toUpperCase() === reg)) || list.find((f) => !f.region);
    if (hit) return { ...hit, matchedKey: String(k).toUpperCase() };
  }
  return null;
}

function setLabel(index) {
  const s = index && index.set;
  if (!s) return 'no factor set';
  const tag = s.illustrative && !/illustrative/i.test(s.name) ? 'ILLUSTRATIVE ' : '';
  return `${tag}${s.name} v${s.version}`;
}

// ─── Sector mapping (FE-05) ────────────────────────────────────────────────

/**
 * Lookup keys for a counterparty: NACE exact → division → section, then the
 * tenant override (FeSectorMap) for the local code (or an unparseable NACE).
 * `sectorMap` is a Map code → factorKey.
 */
function resolveSector(c, sectorMap = new Map()) {
  const code = c && c.naceCode ? String(c.naceCode).trim().toUpperCase() : null;
  const local = c && c.localSectorCode ? String(c.localSectorCode).trim().toUpperCase() : null;
  const keys = nace.lookupKeys(code);
  const override = (local && sectorMap.get(local)) || (code && !keys.length && sectorMap.get(code)) || null;
  if (override) {
    const extra = nace.lookupKeys(override);
    keys.push(...(extra.length ? extra : [String(override).toUpperCase()]));
  }
  const section = (nace.parse(code) || nace.parse(override) || {}).section || null;
  return { keys: [...new Set(keys)], section, mapped: keys.length > 0, code: code || local };
}

// ─── Line engine ───────────────────────────────────────────────────────────

/** Reporting sector of a line: NACE section, or HH / L / UNMAPPED. */
function lineSector(e, sector) {
  if (sector.section) return sector.section;
  if (e.assetClass === 'mortgages' || e.assetClass === 'motor_vehicle') return 'HH';
  if (e.assetClass === 'commercial_re') return 'L';
  return 'UNMAPPED';
}

/**
 * Calculate one line.
 *   input: { exposure, counterparty, emissions }
 *   ctx:   { reportingYear, baseCurrency, factors (buildFactorIndex),
 *            sectorMap (Map), gridFallback(country) → { value, source } | null,
 *            defaultCountry }
 */
function calculateLine({ exposure: e, counterparty: c = null, emissions = [] }, ctx) {
  const base = ctx.baseCurrency || 'AMD';
  const sector = resolveSector(c, ctx.sectorMap);
  const out = {
    exposureId: e.id,
    facilityRef: e.facilityRef,
    assetClass: e.assetClass,
    outstanding: e.outstanding,
    sector: lineSector(e, sector),
    attribution: null,
    attributionCapped: false,
    financedScope1: null,
    financedScope2: null,
    financedTotal: null,
    undrawnFinanced: null,
    dqScore: null,
    method: null,
    explanation: null,
    exception: null,
    unmapped: false,
  };
  const fail = (reason, extra = {}) => ({ ...out, ...extra, exception: reason });

  if (!ASSET_CLASSES.includes(e.assetClass)) return fail(`Asset class "${e.assetClass}" is not supported.`);
  if (e.outstanding == null || !isFinite(e.outstanding)) return fail('Outstanding amount is missing.');
  if (e.outstanding < 0) return fail(`Outstanding amount is negative (${money(e.outstanding, e.currency)}); negative balances are excluded.`);
  if (e.outstanding === 0) return fail('Outstanding amount is zero; there is nothing to attribute.');
  if (e.currency && e.currency.toUpperCase() !== base.toUpperCase()) {
    return fail(`Line currency ${e.currency} differs from the portfolio base currency ${base}; FX conversion is not in the MVP, so convert the amount before upload.`);
  }

  // ── Attribution denominator per asset class (spec §4.2) ──
  let den; let denLabel;
  if (CORPORATE_CLASSES.has(e.assetClass)) {
    const who = e.assetClass === 'project_finance' ? 'project' : 'borrower';
    if (!c) return fail(`No counterparty on the line, so the ${who}'s equity + debt is unknown.`);
    den = c.equityPlusDebt;
    denLabel = `${e.assetClass === 'project_finance' ? 'project ' : ''}equity + debt`;
    if (den == null) return fail(`Total ${denLabel} of the ${who} is missing, so the attribution factor cannot be computed.`);
    if (!(den > 0)) return fail(`Total ${denLabel} of the ${who} is zero or negative, so the attribution factor is undefined.`);
  } else {
    const what = e.assetClass === 'motor_vehicle' ? 'Vehicle' : 'Property';
    den = e.valueAtOrigination;
    denLabel = `${what.toLowerCase()} value at origination`;
    if (den == null) return fail(`${what} value at origination is missing, so the attribution factor cannot be computed.`);
    if (!(den > 0)) return fail(`${what} value at origination is zero or negative, so the attribution factor is undefined.`);
  }
  let attribution = e.outstanding / den;
  if (attribution > 1) { attribution = 1; out.attributionCapped = true; }
  out.attribution = attribution;

  // ── Asset emissions via the sourcing ladder ──
  const step = CORPORATE_CLASSES.has(e.assetClass)
    ? corporateStep(e, c, emissions, sector, den, ctx)
    : RE_CLASSES.has(e.assetClass)
      ? realEstateStep(e, c, ctx)
      : vehicleStep(e, ctx);
  if (step.exception) return fail(step.exception, { unmapped: !!step.unmapped });

  const financed = attribution * step.emissions;
  out.financedTotal = financed;
  if (step.scope1Share != null) {
    out.financedScope1 = financed * step.scope1Share;
    out.financedScope2 = financed - out.financedScope1;
  }
  out.dqScore = step.score;
  out.method = step.factor ? `${step.method}@${step.factor.kind}:${step.factor.matchedKey}` : step.method;

  // Undrawn commitments (FE-14): same emissions, attributed on the undrawn
  // share, never above the part of the asset not yet attributed.  Reported
  // separately, never added to totals.
  if (e.undrawn > 0) {
    const share = Math.min(e.undrawn / den, Math.max(0, 1 - attribution));
    out.undrawnFinanced = share * step.emissions;
  }

  const capNote = out.attributionCapped ? ` (capped at 1: outstanding ${money(e.outstanding, base)} exceeds ${denLabel} ${money(den, base)})` : '';
  out.explanation = `${step.text} = ${n(step.emissions)} tCO2e × attribution ${n(attribution)}${capNote} = ${n(financed)} tCO2e; PCAF score ${step.score}${step.note ? ` (${step.note})` : ''}.`;
  return out;
}

function factorText(f, index) {
  return `${n(f.value)} ${f.unit} (${setLabel(index)})`;
}

// Business loans & project finance: reported verified → reported / energy →
// production → revenue × sector factor → assets × sector factor.
function corporateStep(e, c, emissions, sector, den, ctx) {
  const year = ctx.reportingYear;
  const base = ctx.baseCurrency || 'AMD';
  const candidates = (emissions || [])
    .filter((r) => EMISSION_SOURCES.includes(r.source) && (r.scope1 != null || r.scope2 != null) && (!year || r.year <= year))
    .map((r) => ({ r, score: recordScore(r) }))
    .sort((a, b) => a.score - b.score || b.r.year - a.r.year);
  if (candidates.length) {
    const { r, score } = candidates[0];
    const s1 = r.scope1 || 0; const s2 = r.scope2 || 0;
    const total = s1 + s2;
    const label = r.source === 'reported'
      ? (r.verified ? 'Reported and verified' : 'Reported (unverified)')
      : r.source === 'energy' ? 'Emissions from primary energy data' : 'Production-based emissions';
    return {
      emissions: total,
      scope1Share: total > 0 ? s1 / total : null,
      score,
      method: r.source === 'energy' ? 'energy' : RECORD_METHOD[score],
      text: `${label} ${r.year} Scope 1+2 of ${n(total)} tCO2e`,
    };
  }

  const region = c.country || ctx.defaultCountry || null;
  if (c.revenue > 0) {
    const cur = (c.revenueCurrency || base).toUpperCase();
    const f = findFactor(ctx.factors, 'revenue_sector', sector.keys, { region, currency: cur });
    if (f) {
      return {
        emissions: (c.revenue / 1e6) * f.value,
        scope1Share: f.scope1Share ?? null,
        score: 4,
        method: 'revenue',
        factor: f,
        text: `Revenue ${money(c.revenue, cur)} × sector ${f.matchedKey} factor ${factorText(f, ctx.factors)}`,
      };
    }
  }
  const f = findFactor(ctx.factors, 'asset_sector', sector.keys, { region, currency: base });
  if (f) {
    return {
      emissions: (den / 1e6) * f.value,
      scope1Share: f.scope1Share ?? null,
      score: 5,
      method: 'asset',
      factor: f,
      text: `Equity + debt ${money(den, base)} × asset-based sector ${f.matchedKey} factor ${factorText(f, ctx.factors)}`,
    };
  }
  if (!sector.mapped) {
    return {
      unmapped: true,
      exception: sector.code
        ? `Sector code "${sector.code}" is not a valid NACE Rev.2 code and has no mapping; map it in the unmapped queue.`
        : 'The counterparty has no sector code and no reported emissions; add a NACE code or emissions data.',
    };
  }
  const why = c.revenue > 0 ? '' : ' (revenue is also missing)';
  return { exception: `No reported emissions and no revenue- or asset-based factor for sector ${sector.keys[0]} in ${setLabel(ctx.factors)}${why}.` };
}

// Grid factor: the factor set's `grid` entry for the country, else the
// building-energy module's electricity factor (passed in as gridFallback).
function gridFactor(country, ctx) {
  const f = findFactor(ctx.factors, 'grid', [country || 'GLO', 'GLO'], { region: country });
  if (f) return { value: f.value, scope1Share: f.scope1Share ?? 0, text: `grid ${n(f.value)} kgCO2e/kWh (${setLabel(ctx.factors)})`, factor: f };
  const fb = ctx.gridFallback ? ctx.gridFallback(country) : null;
  if (fb && fb.value != null) return { value: fb.value, scope1Share: 0, text: `grid ${n(fb.value)} kgCO2e/kWh (building-energy default: ${fb.source})` };
  return null;
}

const NO_FUEL_SPLIT = 'all energy at the grid electricity factor, the tape has no fuel split';

// CRE & mortgages: actual energy → label × area → benchmark × area →
// outstanding-based fallback.
function realEstateStep(e, c, ctx) {
  const country = (e.country || (c && c.country) || ctx.defaultCountry || 'GLO').toUpperCase();
  const base = ctx.baseCurrency || 'AMD';
  const grid = (e.energyKwh > 0 || e.floorAreaM2 > 0) ? gridFactor(country, ctx) : null;
  const viaGrid = (kwh, score, method, text, factor) => ({
    emissions: (kwh * grid.value) / 1000,
    scope1Share: grid.scope1Share,
    score,
    method,
    factor,
    text: `${text} × ${grid.text}`,
    note: NO_FUEL_SPLIT,
  });

  if (e.energyKwh > 0) {
    if (!grid) return { exception: `No grid emission factor for ${country}; add a "grid" factor to the factor set.` };
    return viaGrid(e.energyKwh, 2, 're_actual_energy', `Actual energy ${n(e.energyKwh)} kWh`, grid.factor);
  }
  if (e.floorAreaM2 > 0 && e.energyLabel) {
    const f = findFactor(ctx.factors, 'energy_label', [e.energyLabel], { region: country });
    if (f && grid) return viaGrid(f.value * e.floorAreaM2, 3, 're_label', `Label ${String(e.energyLabel).toUpperCase()} ${n(f.value)} kWh/m² (${setLabel(ctx.factors)}) × ${n(e.floorAreaM2)} m²`, f);
  }
  if (e.floorAreaM2 > 0 && e.propertyType) {
    const f = findFactor(ctx.factors, 'building_benchmark', [e.propertyType], { region: country });
    if (f && grid) return viaGrid(f.value * e.floorAreaM2, 4, 're_benchmark', `Benchmark ${n(f.value)} kWh/m² for ${e.propertyType} (${setLabel(ctx.factors)}) × ${n(e.floorAreaM2)} m²`, f);
  }
  const f = findFactor(ctx.factors, 'asset_sector', [e.assetClass], { region: country, currency: base });
  if (f) {
    return {
      emissions: (e.valueAtOrigination / 1e6) * f.value,
      scope1Share: f.scope1Share ?? null,
      score: 5,
      method: 're_outstanding',
      factor: f,
      text: `Property value ${money(e.valueAtOrigination, base)} × ${e.assetClass} fallback factor ${factorText(f, ctx.factors)} (no energy, label or floor-area data)`,
    };
  }
  return { exception: 'No energy use, energy label, floor area with a benchmark, or fallback factor is available for this property; add floor area and property type.' };
}

// Motor vehicles (MVP+): value-based fallback only; fuel/distance and
// make/model factors are Phase 2.
function vehicleStep(e, ctx) {
  const base = ctx.baseCurrency || 'AMD';
  const f = findFactor(ctx.factors, 'asset_sector', ['motor_vehicle'], { region: e.country || ctx.defaultCountry, currency: base });
  if (!f) return { exception: `No "motor_vehicle" fallback factor in ${setLabel(ctx.factors)}; fuel/distance factors are not in the MVP.` };
  return {
    emissions: (e.valueAtOrigination / 1e6) * f.value,
    scope1Share: f.scope1Share ?? null,
    score: 5,
    method: 'vehicle_value',
    factor: f,
    text: `Vehicle value ${money(e.valueAtOrigination, base)} × vehicle factor ${factorText(f, ctx.factors)}`,
  };
}

/**
 * Calculate a whole period.  inputs: { exposures, counterparties (by id),
 * emissions (by counterparty id) }.
 */
function calculatePeriod({ exposures, counterparties, emissions }, ctx) {
  const cps = counterparties instanceof Map ? counterparties : new Map(Object.entries(counterparties || {}));
  const ems = emissions instanceof Map ? emissions : new Map(Object.entries(emissions || {}));
  return exposures.map((e) => calculateLine({
    exposure: e,
    counterparty: e.counterpartyId ? cps.get(e.counterpartyId) || null : null,
    emissions: e.counterpartyId ? ems.get(e.counterpartyId) || [] : [],
  }, ctx));
}

module.exports = {
  METHODOLOGY_VERSION,
  ASSET_CLASSES,
  FACTOR_KINDS,
  EMISSION_SOURCES,
  recordScore,
  buildFactorIndex,
  findFactor,
  resolveSector,
  lineSector,
  calculateLine,
  calculatePeriod,
  setLabel,
};
