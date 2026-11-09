'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// metrics.js — portfolio metrics (FE-10) and reproducibility hashes (P-12)
//
//   weighted DQ  = Σ(score × outstanding) ÷ Σ outstanding of calculated lines
//   coverage %   = calculated outstanding ÷ total outstanding
//   intensity    = financed tCO2e ÷ (calculated outstanding / 1e6)
// Total outstanding counts positive balances only (negative balances are
// excluded lines, not reductions of the book).
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

const round = (v, dp = 6) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp);

function emptyBucket() {
  return { lines: 0, exceptions: 0, outstanding: 0, calculatedOutstanding: 0, financed: 0, undrawnFinanced: 0, dqWeighted: 0 };
}

function add(b, l) {
  b.lines += 1;
  const os = l.outstanding > 0 ? l.outstanding : 0;
  b.outstanding += os;
  if (l.financedTotal == null) { b.exceptions += 1; return; }
  b.calculatedOutstanding += os;
  b.financed += l.financedTotal;
  b.undrawnFinanced += l.undrawnFinanced || 0;
  b.dqWeighted += (l.dqScore || 0) * os;
}

function finish(b) {
  return {
    lines: b.lines,
    exceptions: b.exceptions,
    outstanding: round(b.outstanding, 2),
    calculatedOutstanding: round(b.calculatedOutstanding, 2),
    financed: round(b.financed),
    undrawnFinanced: round(b.undrawnFinanced),
    coveragePct: b.outstanding > 0 ? round((b.calculatedOutstanding / b.outstanding) * 100, 2) : null,
    weightedDq: b.calculatedOutstanding > 0 ? round(b.dqWeighted / b.calculatedOutstanding, 2) : null,
    intensity: b.calculatedOutstanding > 0 ? round(b.financed / (b.calculatedOutstanding / 1e6), 4) : null,
  };
}

/**
 * Totals for a list of line results (each with assetClass, sector,
 * outstanding, financedTotal, financedScope1/2, undrawnFinanced, dqScore).
 */
function computeTotals(lines) {
  const total = emptyBucket();
  const byClass = {}; const bySector = {};
  const dq = { 1: { lines: 0, outstanding: 0 }, 2: { lines: 0, outstanding: 0 }, 3: { lines: 0, outstanding: 0 }, 4: { lines: 0, outstanding: 0 }, 5: { lines: 0, outstanding: 0 } };
  let scope1 = 0; let scope2 = 0; let unsplit = 0; let unmapped = 0;
  for (const l of lines) {
    add(total, l);
    add(byClass[l.assetClass] ||= emptyBucket(), l);
    add(bySector[l.sector || 'UNMAPPED'] ||= emptyBucket(), l);
    if (l.unmapped) unmapped += 1;
    if (l.financedTotal == null) continue;
    if (l.financedScope1 != null) { scope1 += l.financedScope1; scope2 += l.financedScope2 || 0; } else unsplit += l.financedTotal;
    if (dq[l.dqScore]) { dq[l.dqScore].lines += 1; dq[l.dqScore].outstanding += l.outstanding; }
  }
  const t = finish(total);
  return {
    absoluteFinanced: t.financed,
    financedScope1: round(scope1),
    financedScope2: round(scope2),
    financedUnsplit: round(unsplit),
    undrawnFinanced: t.undrawnFinanced,
    totalOutstanding: t.outstanding,
    calculatedOutstanding: t.calculatedOutstanding,
    coveragePct: t.coveragePct,
    weightedDq: t.weightedDq,
    economicIntensity: t.intensity,
    lines: t.lines,
    exceptions: t.exceptions,
    unmapped,
    byAssetClass: Object.fromEntries(Object.keys(byClass).sort().map((k) => [k, finish(byClass[k])])),
    bySector: Object.fromEntries(Object.keys(bySector).sort().map((k) => [k, finish(bySector[k])])),
    dqDistribution: Object.fromEntries(Object.entries(dq).map(([k, v]) => [k, { lines: v.lines, outstanding: round(v.outstanding, 2) }])),
  };
}

// ─── Canonical JSON + hashes ────────────────────────────────────────────────

/** JSON with object keys sorted recursively (arrays keep their order). */
function canonical(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hash = (value) => sha256(canonical(value));

/** Hash of the line results + totals, rounded so float noise cannot flip it. */
function outputsHash(lines, totals) {
  const rows = [...lines]
    .sort((a, b) => (a.facilityRef < b.facilityRef ? -1 : a.facilityRef > b.facilityRef ? 1 : 0))
    .map((l) => ({
      f: l.facilityRef,
      a: round(l.attribution, 9),
      s1: round(l.financedScope1),
      s2: round(l.financedScope2),
      t: round(l.financedTotal),
      u: round(l.undrawnFinanced),
      q: l.dqScore,
      m: l.method,
      x: l.exception,
    }));
  return hash({ rows, totals });
}

module.exports = { computeTotals, canonical, hash, sha256, outputsHash, round };
