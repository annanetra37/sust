'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// report.js — PCAF disclosure workbook (FE-24) and IFRS S2 Category 15
// sector table (FE-25) for one calculation run.
//
// Sheets: PCAF disclosure · By sector · Line results · Methodology.
// Line results are pseudonymised (stable id only) unless includeNames.
// ─────────────────────────────────────────────────────────────────────────────

const XLSX = require('xlsx');
const { SECTION_NAMES } = require('./nace');
const loanTape = require('./loanTape');

const CLASS_LABELS = {
  business_loans: 'Business loans & unlisted equity',
  commercial_re: 'Commercial real estate',
  mortgages: 'Mortgages',
  motor_vehicle: 'Motor vehicle loans',
  project_finance: 'Project finance',
};
const SECTOR_LABELS = { ...SECTION_NAMES, HH: 'Households (mortgages / retail)', UNMAPPED: 'Unmapped sector' };

const r2 = (v, dp = 2) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

function illustrativeNote(totals) {
  return totals.factorSet && totals.factorSet.illustrative
    ? 'WARNING: computed with an ILLUSTRATIVE factor set — not for disclosure.'
    : null;
}

function disclosureSheet(totals, base) {
  const head = ['Asset class', 'Lines', `Outstanding (${base})`, `Calculated outstanding (${base})`, 'Absolute financed emissions (tCO2e)',
    `Economic intensity (tCO2e / M ${base})`, 'Weighted data quality score (1 best – 5)', 'Coverage (% of outstanding)', 'Exceptions',
    'Undrawn commitments financed (tCO2e, shown separately)'];
  const row = (label, b) => [label, b.lines, r2(b.outstanding), r2(b.calculatedOutstanding), r2(b.financed, 3), r2(b.intensity, 4),
    r2(b.weightedDq), r2(b.coveragePct), b.exceptions, r2(b.undrawnFinanced, 3)];
  const aoa = [];
  const warn = illustrativeNote(totals);
  if (warn) aoa.push([warn], []);
  aoa.push(head);
  for (const [k, b] of Object.entries(totals.byAssetClass || {})) aoa.push(row(CLASS_LABELS[k] || k, b));
  aoa.push(row('Total', {
    lines: totals.lines, outstanding: totals.totalOutstanding, calculatedOutstanding: totals.calculatedOutstanding, financed: totals.absoluteFinanced,
    intensity: totals.economicIntensity, weightedDq: totals.weightedDq, coveragePct: totals.coveragePct, exceptions: totals.exceptions, undrawnFinanced: totals.undrawnFinanced,
  }));
  aoa.push([], ['Scope split of financed emissions (tCO2e)', 'Scope 1', r2(totals.financedScope1, 3), 'Scope 2', r2(totals.financedScope2, 3), 'Not split', r2(totals.financedUnsplit, 3)]);
  return XLSX.utils.aoa_to_sheet(aoa);
}

function sectorSheet(totals, base) {
  const aoa = [];
  const warn = illustrativeNote(totals);
  if (warn) aoa.push([warn], []);
  aoa.push(['NACE section', 'Industry', `Gross exposure (${base})`, 'Financed emissions (tCO2e)', '% of exposure covered', 'Weighted data quality score', `Economic intensity (tCO2e / M ${base})`, 'Lines']);
  for (const [k, b] of Object.entries(totals.bySector || {})) {
    aoa.push([k, SECTOR_LABELS[k] || k, r2(b.outstanding), r2(b.financed, 3), r2(b.coveragePct), r2(b.weightedDq), r2(b.intensity, 4), b.lines]);
  }
  return XLSX.utils.aoa_to_sheet(aoa);
}

function linesSheet(lines, includeNames) {
  const head = ['Facility ref', 'Counterparty (pseudonymised id)', ...(includeNames ? ['Counterparty name'] : []), 'Asset class', 'Branch', 'Segment', 'Sector',
    'Outstanding', 'Currency', 'Attribution factor', 'Financed Scope 1 (tCO2e)', 'Financed Scope 2 (tCO2e)', 'Financed total (tCO2e)',
    'Undrawn financed (tCO2e)', 'PCAF score', 'Method', 'Explanation', 'Exception'];
  const aoa = [head];
  for (const l of lines) {
    aoa.push([l.facilityRef, l.stableId || '', ...(includeNames ? [l.name || ''] : []), l.assetClass, l.branch || '', l.segment || '', l.sector || '',
      l.outstanding, l.currency, r2(l.attribution, 6), r2(l.financedScope1, 4), r2(l.financedScope2, 4), r2(l.financedTotal, 4),
      r2(l.undrawnFinanced, 4), l.dqScore, l.method || '', l.explanation || '', l.exception || '']);
  }
  return XLSX.utils.aoa_to_sheet(aoa);
}

function methodologySheet({ period, portfolio, run }) {
  const t = run.totals || {};
  const fs = t.factorSet || {};
  const aoa = [
    ['Item', 'Value'],
    ['Portfolio', portfolio.name],
    ['Legal entity', portfolio.legalEntity || ''],
    ['Reporting period', period.name],
    ['Reporting date', new Date(period.reportingDate).toISOString().slice(0, 10)],
    ['Period status', period.status],
    ['Base currency', portfolio.baseCurrency],
    ['Methodology', 'PCAF Global GHG Accounting & Reporting Standard, Part A (3rd edition): financed emissions = attribution factor × counterparty or asset emissions (Scope 1 + 2).'],
    ['Methodology version', run.methodologyVersion],
    ['Factor set', fs.name ? `${fs.name} v${fs.version}` : 'none'],
    ['Factor set source', fs.source || ''],
    ['Illustrative factor set', fs.illustrative ? 'YES — figures are not for disclosure' : 'No'],
    ['Sector mapping', `${(t.mapping && t.mapping.entries) || 0} tenant mapping entries; hash ${(t.mapping && t.mapping.hash) || ''}`],
    ['Lines in scope', t.lines],
    ['Exclusions / exceptions', `${t.exceptions} lines without a result (see exceptions CSV); excluded from absolute emissions, counted in coverage.`],
    ['Coverage', `${t.coveragePct}% of outstanding calculated`],
    ['Undrawn commitments', 'Computed on the undrawn amount and shown separately; never added to absolute financed emissions.'],
    ['Scope 3 of counterparties', 'Not included in the MVP.'],
    ['Avoided emissions', 'Not included in the MVP.'],
    ['Calculation run id', run.id],
    ['Run date', new Date(run.createdAt).toISOString()],
    ['Inputs hash (sha256)', run.inputsHash],
    ['Outputs hash (sha256)', run.outputsHash || ''],
  ];
  return XLSX.utils.aoa_to_sheet(aoa);
}

/** Build the workbook buffer. `lines` are flat rows (see the route). */
function buildWorkbook({ period, portfolio, run, lines, includeNames }) {
  const base = portfolio.baseCurrency || 'AMD';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, disclosureSheet(run.totals || {}, base), 'PCAF disclosure');
  XLSX.utils.book_append_sheet(wb, sectorSheet(run.totals || {}, base), 'By sector (IFRS S2 C15)');
  XLSX.utils.book_append_sheet(wb, linesSheet(lines, includeNames), 'Line results');
  XLSX.utils.book_append_sheet(wb, methodologySheet({ period, portfolio, run }), 'Methodology');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function exceptionsCsv(lines) {
  return loanTape.toCsv(['facilityRef', 'counterparty', 'assetClass', 'outstanding', 'currency', 'exception'],
    lines.filter((l) => l.exception).map((l) => ({ ...l, counterparty: l.stableId || '' })));
}

module.exports = { buildWorkbook, exceptionsCsv, CLASS_LABELS, SECTOR_LABELS };
