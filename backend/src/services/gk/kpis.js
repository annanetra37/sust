'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// kpis.js — Green Key Readiness carbon and intensity KPIs (GK-14/15). Pure.
//
// Energy → kWh → kgCO2e uses the shared buildingEnergy engine (location-based,
// country of the establishment; pending Armenian factors come back as
// warnings).  Scope 1 = on-site combustion (gas, LPG, oil); biomass CO2 is
// biogenic and reported separately; Scope 2 = electricity and district
// heat/cooling.  Market-based Scope 2 is out of scope for the MVP.
//
// Intensities over the chosen period:
//   kWh / guest-night, litres water / guest-night, kg waste / guest-night,
//   kgCO2e / occupied room (room-night, HCMI-style), recycling rate
//   (recycled + composted kg ÷ all waste kg).
// ─────────────────────────────────────────────────────────────────────────────

const buildingEnergy = require('../buildingEnergy');

const SCOPE1_FUELS = new Set(['natural_gas', 'lpg', 'oil', 'biomass']);
const WATER_UNITS = { m3: 1, litre: 0.001 };
const WASTE_UNITS = { kg: 1, t: 1000 };
const RECYCLED = new Set(['recycled', 'composted']);

const key = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const round = (n, dp = 2) => (n == null || !isFinite(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp);
const div = (a, b) => (b > 0 ? a / b : null);

function waterM3(rec) { return rec.quantity * (WATER_UNITS[rec.unit] ?? 1); }
function wasteKg(rec) { return rec.quantity * (WASTE_UNITS[rec.unit] ?? 1); }

/** Last month key that has any resource or occupancy data. */
function latestMonth(records, occupancy) {
  const keys = [...(records || []), ...(occupancy || [])].map((r) => key(r.year, r.month)).sort();
  return keys.length ? keys[keys.length - 1] : null;
}

function monthsBack(toKey, n) {
  let [y, m] = toKey.split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i++) { out.unshift(key(y, m)); m--; if (m === 0) { m = 12; y--; } }
  return out;
}

/**
 * Compute KPIs for one establishment.
 * opts: { from: 'YYYY-MM', to: 'YYYY-MM' } — default: 12 months to the latest data month.
 */
function computeKpis(est, records, occupancy, opts = {}) {
  const country = est.country || 'GLO';
  const to = opts.to || latestMonth(records, occupancy);
  const warnings = new Set();
  if (!to) {
    return { period: null, totals: null, intensities: null, monthly: [], warnings: [], marketBased: 'out_of_scope' };
  }
  let months;
  if (opts.from) {
    months = [];
    let [y, m] = opts.from.split('-').map(Number);
    while (key(y, m) <= to && months.length < 120) { months.push(key(y, m)); m++; if (m === 13) { m = 1; y++; } }
  } else months = monthsBack(to, 12);
  const inRange = new Set(months);
  const monthly = new Map(months.map((k) => [k, {
    month: k, kwh: 0, scope1: 0, scope2: 0, biogenic: 0, waterM3: 0, wasteKg: 0, recycledKg: 0,
    guestNights: null, occupiedRooms: null, estimated: false,
  }]));
  const byFuel = {};
  const factors = new Map();
  let estimatedCount = 0; let recordCount = 0;

  for (const rec of records || []) {
    const k = key(rec.year, rec.month);
    if (!inRange.has(k)) continue;
    const row = monthly.get(k);
    recordCount++;
    if (rec.estimated) { row.estimated = true; estimatedCount++; }
    if (rec.kind === 'energy') {
      const conv = buildingEnergy.convertRecord({ fuel: rec.source, unit: rec.unit, quantity: rec.quantity }, country);
      conv.warnings.forEach((w) => warnings.add(w));
      if (conv.kwh == null) continue;
      row.kwh += conv.kwh;
      byFuel[rec.source] = (byFuel[rec.source] || 0) + conv.kwh;
      if (SCOPE1_FUELS.has(rec.source)) row.scope1 += conv.kgCo2e; else row.scope2 += conv.kgCo2e;
      row.biogenic += conv.biogenicKgCo2;
      const fk = `${rec.source}:${rec.unit}`;
      if (!factors.has(fk)) {
        factors.set(fk, {
          fuel: rec.source, unit: rec.unit, toKwh: conv.toKwh, kgCo2ePerKwh: conv.kgCo2ePerKwh,
          toKwhSource: conv.convFactor?.source || null, toKwhStatus: conv.convFactor?.status || null,
          emissionSource: conv.emFactor?.source || null, emissionStatus: conv.emFactor?.status || null,
        });
      }
    } else if (rec.kind === 'water') {
      row.waterM3 += waterM3(rec);
    } else if (rec.kind === 'waste') {
      const kg = wasteKg(rec);
      row.wasteKg += kg;
      if (RECYCLED.has(rec.disposal)) row.recycledKg += kg;
    }
  }
  for (const o of occupancy || []) {
    const k = key(o.year, o.month);
    if (!inRange.has(k)) continue;
    const row = monthly.get(k);
    row.guestNights = o.guestNights;
    row.occupiedRooms = o.occupiedRooms;
  }

  const rows = [...monthly.values()];
  const sum = (f) => rows.reduce((s, r) => s + (r[f] || 0), 0);
  const totals = {
    kwh: sum('kwh'), scope1KgCo2e: sum('scope1'), scope2KgCo2e: sum('scope2'), biogenicKgCo2: sum('biogenic'),
    waterM3: sum('waterM3'), wasteKg: sum('wasteKg'), recycledKg: sum('recycledKg'),
    guestNights: sum('guestNights'), occupiedRooms: sum('occupiedRooms'),
  };
  totals.totalKgCo2e = totals.scope1KgCo2e + totals.scope2KgCo2e;
  const intensities = {
    kwhPerGuestNight: round(div(totals.kwh, totals.guestNights), 2),
    litresPerGuestNight: round(div(totals.waterM3 * 1000, totals.guestNights), 1),
    wasteKgPerGuestNight: round(div(totals.wasteKg, totals.guestNights), 3),
    kgCo2ePerOccupiedRoom: round(div(totals.totalKgCo2e, totals.occupiedRooms), 2),
    kgCo2ePerGuestNight: round(div(totals.totalKgCo2e, totals.guestNights), 2),
    recyclingRatePct: totals.wasteKg > 0 ? round((totals.recycledKg / totals.wasteKg) * 100, 1) : null,
  };
  const monthlyOut = rows.map((r) => ({
    ...r,
    kwh: round(r.kwh, 1), scope1: round(r.scope1, 1), scope2: round(r.scope2, 1), biogenic: round(r.biogenic, 1),
    waterM3: round(r.waterM3, 2), wasteKg: round(r.wasteKg, 1), recycledKg: round(r.recycledKg, 1),
    kgCo2e: round(r.scope1 + r.scope2, 1),
    kwhPerGuestNight: round(div(r.kwh, r.guestNights), 2),
    litresPerGuestNight: round(div(r.waterM3 * 1000, r.guestNights), 1),
    kgCo2ePerOccupiedRoom: round(div(r.scope1 + r.scope2, r.occupiedRooms), 2),
  }));
  if (months.some((k) => monthly.get(k).guestNights == null)) warnings.add('Occupancy is missing for some months in the period; intensities use the months available.');
  return {
    period: { from: months[0], to: months[months.length - 1], months: months.length },
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round(v, 2)])),
    intensities,
    byFuelKwh: Object.fromEntries(Object.entries(byFuel).map(([k, v]) => [k, round(v, 1)])),
    monthly: monthlyOut,
    factors: [...factors.values()],
    estimatedShare: recordCount ? round((estimatedCount / recordCount) * 100, 1) : null,
    warnings: [...warnings],
    method: 'location-based',
    marketBased: 'out_of_scope',
  };
}

module.exports = { computeKpis, latestMonth, SCOPE1_FUELS };
