'use strict';

// Unit tests for the Financed Emissions engine (no database).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const pcaf = require('../src/services/fe/pcaf');
const metrics = require('../src/services/fe/metrics');
const nace = require('../src/services/fe/nace');
const loanTape = require('../src/services/fe/loanTape');
const factorLib = require('../src/services/fe/factors');
const { SET, FACTORS } = require('../src/prisma/feDemo/factors');
const { GOLDEN, REPORTING_YEAR } = require('../src/prisma/feDemo/golden');
const { demoBook } = require('../src/prisma/feDemo/generate');

const index = pcaf.buildFactorIndex({ id: 'set-1', ...SET }, FACTORS);
const ctx = (extra = {}) => ({
  reportingYear: REPORTING_YEAR, baseCurrency: 'AMD', defaultCountry: 'AM', factors: index, sectorMap: new Map(),
  gridFallback: () => ({ value: 0.45, source: 'stub' }), ...extra,
});
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} ≠ ${b}`);
const line = (g, i) => pcaf.calculateLine({
  exposure: { id: `e${i}`, currency: 'AMD', ...g.exposure },
  counterparty: g.counterparty || null,
  emissions: g.emissions || [],
}, ctx());

test('golden lines: attribution, financed tCO2e, score, method', () => {
  GOLDEN.forEach((g, i) => {
    const r = line(g, i);
    const ref = g.exposure.facilityRef;
    if (g.expect.exception) {
      assert.match(r.exception || '', g.expect.exception, ref);
      assert.equal(r.financedTotal, null, ref);
      assert.equal(r.dqScore, null, ref);
      if (g.expect.unmapped) assert.equal(r.unmapped, true, ref);
      return;
    }
    assert.equal(r.exception, null, `${ref}: ${r.exception}`);
    near(r.attribution, g.expect.attribution, `${ref} attribution`);
    near(r.financedTotal, g.expect.financed, `${ref} financed`);
    assert.equal(r.dqScore, g.expect.score, ref);
    if (g.expect.method) assert.equal(r.method, g.expect.method, ref);
    if (g.expect.undrawn != null) near(r.undrawnFinanced, g.expect.undrawn, `${ref} undrawn`);
    if (g.expect.capped) assert.equal(r.attributionCapped, true, ref);
    assert.ok(r.explanation.includes(`PCAF score ${g.expect.score}`), r.explanation);
  });
});

test('explanation reads as one sentence with inputs, factor set and attribution', () => {
  const r = line(GOLDEN.find((g) => g.exposure.facilityRef === 'G-BL-05'), 0);
  assert.equal(r.explanation, 'Revenue AMD 850M × sector 55.10 factor 0.4 tCO2e/M revenue (ILLUSTRATIVE — not for disclosure (Triple I demo factors) vdemo-1) = 340 tCO2e × attribution 0.18 = 61.2 tCO2e; PCAF score 4.');
  const capped = line(GOLDEN.find((g) => g.exposure.facilityRef === 'G-BL-07'), 0);
  assert.match(capped.explanation, /capped at 1/);
  const cre = line(GOLDEN.find((g) => g.exposure.facilityRef === 'G-CRE-01'), 0);
  assert.match(cre.explanation, /no fuel split/);
});

test('attribution per asset class uses the right denominator', () => {
  const c = { equityPlusDebt: 400e6, naceCode: 'C', revenue: 100e6, revenueCurrency: 'AMD' };
  const pf = pcaf.calculateLine({ exposure: { id: 'p', facilityRef: 'PF', assetClass: 'project_finance', outstanding: 100e6, currency: 'AMD' }, counterparty: c }, ctx());
  near(pf.attribution, 0.25, 'project finance');
  const mv = pcaf.calculateLine({ exposure: { id: 'v', facilityRef: 'MV', assetClass: 'motor_vehicle', outstanding: 6e6, valueAtOrigination: 12e6, currency: 'AMD' } }, ctx());
  near(mv.attribution, 0.5, 'vehicle');
  near(mv.financedTotal, 0.5 * 12 * 0.15, 'vehicle financed');
  assert.equal(mv.dqScore, 5);
  const noVal = pcaf.calculateLine({ exposure: { id: 'v2', facilityRef: 'MV2', assetClass: 'motor_vehicle', outstanding: 6e6, currency: 'AMD' } }, ctx());
  assert.match(noVal.exception, /Vehicle value at origination is missing/);
});

test('never defaults a missing or bad denominator', () => {
  const run = (exposure, counterparty) => pcaf.calculateLine({ exposure: { id: 'x', facilityRef: 'X', currency: 'AMD', ...exposure }, counterparty }, ctx());
  assert.match(run({ assetClass: 'business_loans', outstanding: 1e6 }, { naceCode: 'C', revenue: 1e6 }).exception, /missing/);
  assert.match(run({ assetClass: 'business_loans', outstanding: 1e6 }, { naceCode: 'C', equityPlusDebt: 0 }).exception, /zero or negative/);
  assert.match(run({ assetClass: 'business_loans', outstanding: 1e6 }, null).exception, /No counterparty/);
  assert.match(run({ assetClass: 'mortgages', outstanding: 1e6, valueAtOrigination: 0 }).exception, /zero or negative/);
  assert.match(run({ assetClass: 'mortgages', outstanding: 0, valueAtOrigination: 1e6 }).exception, /zero/);
  assert.match(run({ assetClass: 'mortgages', outstanding: -5, valueAtOrigination: 1e6 }).exception, /negative/);
  assert.match(run({ assetClass: 'mortgages', outstanding: 1e6, valueAtOrigination: 2e6, currency: 'USD' }).exception, /differs from the portfolio base currency/);
});

test('ladder picks the best record not after the reporting year', () => {
  const c = { equityPlusDebt: 100e6, naceCode: 'C' };
  const exposure = { id: 'e', facilityRef: 'L', assetClass: 'business_loans', outstanding: 10e6, currency: 'AMD' };
  const r = pcaf.calculateLine({ exposure, counterparty: c, emissions: [
    { year: 2026, source: 'reported', verified: true, scope1: 9999 }, // future → ignored
    { year: 2023, source: 'production', scope1: 100 },
    { year: 2024, source: 'reported', verified: false, scope1: 200 },
  ] }, ctx());
  assert.equal(r.dqScore, 2);
  near(r.financedTotal, 20, 'reported 2024');
  // No usable record, no revenue → asset factor (score 5).
  const r5 = pcaf.calculateLine({ exposure, counterparty: c, emissions: [{ year: 2025, source: 'reported', scope3: 5 }] }, ctx());
  assert.equal(r5.dqScore, 5);
  near(r5.financedTotal, 10 * 0.6, 'asset based = outstanding × factor');
  // Revenue in another currency than every revenue factor → falls to score 5.
  const usd = pcaf.calculateLine({ exposure, counterparty: { ...c, revenue: 5e6, revenueCurrency: 'USD' } }, ctx());
  assert.equal(usd.dqScore, 5);
});

test('real estate ladder and grid fallback', () => {
  const base = { id: 'r', facilityRef: 'R', assetClass: 'commercial_re', outstanding: 50e6, valueAtOrigination: 100e6, currency: 'AMD', country: 'AM' };
  // No grid factor in the set → building-energy fallback, named in the text.
  const noGrid = pcaf.buildFactorIndex({ ...SET }, FACTORS.filter((f) => f.kind !== 'grid'));
  const r = pcaf.calculateLine({ exposure: { ...base, energyKwh: 100000 } }, ctx({ factors: noGrid }));
  near(r.financedTotal, 0.5 * 100000 * 0.45 / 1000, 'fallback grid');
  assert.match(r.explanation, /building-energy default: stub/);
  assert.equal(r.method, 're_actual_energy');
  // Label without area falls through to the outstanding-based fallback.
  const lbl = pcaf.calculateLine({ exposure: { ...base, energyLabel: 'B' } }, ctx());
  assert.equal(lbl.dqScore, 5);
  // Nothing at all and no fallback factor → exception.
  const empty = pcaf.buildFactorIndex(null, []);
  assert.match(pcaf.calculateLine({ exposure: base }, ctx({ factors: empty })).exception, /floor area/);
});

test('sector lookup: exact → division → section → tenant override', () => {
  assert.deepEqual(nace.lookupKeys('55.10'), ['55.10', '55', 'I']);
  assert.deepEqual(nace.lookupKeys('I55.10'), ['55.10', '55', 'I']);
  assert.deepEqual(nace.lookupKeys('F'), ['F']);
  assert.deepEqual(nace.lookupKeys('04'), []); // no such division
  assert.equal(nace.parse('C55'), null); // letter contradicts division
  const s = pcaf.resolveSector({ localSectorCode: 'am-hotel' }, new Map([['AM-HOTEL', '55']]));
  assert.deepEqual(s.keys, ['55', 'I']);
  assert.equal(s.section, 'I');
  assert.equal(pcaf.resolveSector({ naceCode: 'ZZ' }, new Map()).mapped, false);
  const r = pcaf.calculateLine({
    exposure: { id: 'o', facilityRef: 'O', assetClass: 'business_loans', outstanding: 10e6, currency: 'AMD' },
    counterparty: { localSectorCode: 'AM-HOTEL', revenue: 100e6, revenueCurrency: 'AMD', equityPlusDebt: 100e6 },
  }, ctx({ sectorMap: new Map([['AM-HOTEL', '55']]) }));
  assert.equal(r.method, 'revenue@revenue_sector:I');
  near(r.financedTotal, 0.1 * 100 * 0.5, 'override');
});

test('weighted DQ, coverage and intensity per asset class and total', () => {
  const lines = [
    { assetClass: 'business_loans', sector: 'C', outstanding: 100, financedTotal: 10, dqScore: 2 },
    { assetClass: 'business_loans', sector: 'C', outstanding: 300, financedTotal: 30, dqScore: 4 },
    { assetClass: 'business_loans', sector: 'F', outstanding: 100, financedTotal: null, dqScore: null, exception: 'x' },
    { assetClass: 'mortgages', sector: 'HH', outstanding: 500, financedTotal: 5, dqScore: 5, undrawnFinanced: 1 },
    { assetClass: 'mortgages', sector: 'HH', outstanding: -50, financedTotal: null, exception: 'neg' },
  ];
  const t = metrics.computeTotals(lines);
  assert.equal(t.totalOutstanding, 1000);
  assert.equal(t.calculatedOutstanding, 900);
  assert.equal(t.coveragePct, 90);
  assert.equal(t.weightedDq, Math.round(((2 * 100 + 4 * 300 + 5 * 500) / 900) * 100) / 100);
  assert.equal(t.absoluteFinanced, 45);
  assert.equal(t.undrawnFinanced, 1); // separate, not in absolute
  assert.equal(t.economicIntensity, 45 / (900 / 1e6));
  assert.equal(t.byAssetClass.business_loans.weightedDq, 3.5);
  assert.equal(t.byAssetClass.business_loans.coveragePct, 80);
  assert.equal(t.exceptions, 2);
  assert.equal(t.dqDistribution[4].outstanding, 300);
  assert.equal(t.bySector.C.financed, 40);
});

test('outputs hash is stable and order-independent', () => {
  const book = demoBook().map((l, i) => ({ ...l, exposure: { id: `e${i}`, currency: 'AMD', ...l.exposure } }));
  const calc = (lines) => {
    const out = lines.map((l) => pcaf.calculateLine({ exposure: l.exposure, counterparty: l.counterparty || null, emissions: l.emissions || [] }, ctx()));
    return metrics.outputsHash(out, metrics.computeTotals(out));
  };
  const h1 = calc(book);
  assert.equal(h1, calc([...book].reverse()));
  assert.match(h1, /^[0-9a-f]{64}$/);
  const changed = book.map((l, i) => (i === 0 ? { ...l, exposure: { ...l.exposure, outstanding: l.exposure.outstanding + 1 } } : l));
  assert.notEqual(h1, calc(changed));
  assert.equal(metrics.canonical({ b: 1, a: [2, { d: 1, c: null }] }), '{"a":[2,{"c":null,"d":1}],"b":1}');
});

test('synthetic demo book covers every ladder step and some exceptions', () => {
  const out = demoBook().map((l, i) => pcaf.calculateLine({ exposure: { id: `e${i}`, currency: 'AMD', ...l.exposure }, counterparty: l.counterparty || null, emissions: l.emissions || [] }, ctx({ sectorMap: new Map([['AM-HOTEL', '55']]) })));
  assert.ok(out.length >= 55 && out.length <= 65, `lines: ${out.length}`);
  for (const s of [1, 2, 3, 4, 5]) assert.ok(out.some((r) => r.dqScore === s), `score ${s}`);
  const paths = { business_loans: [1, 2, 3, 4, 5], commercial_re: [2, 3, 4], mortgages: [2, 3, 4, 5] };
  for (const [cls, scores] of Object.entries(paths)) for (const s of scores) {
    assert.ok(out.some((r) => r.assetClass === cls && r.dqScore === s), `${cls} score ${s}`);
  }
  assert.ok(out.filter((r) => r.exception).length >= 3);
});

test('loan tape validation reports row, field and message', () => {
  const csv = [
    'facilityRef,counterpartyId,outstanding,currency,naceCode,equityPlusDebt,originationDate',
    'A1,C1,1000,AMD,55.10,5000,2024-01-15',
    'A2,,-5,dollars,5X,0,15.01.2024',
    'A1,C2,10,AMD,I,100,2030-01-01',
    'A3,C3,"1,250,000",amd,55,,',
    'B9,C9,10,AMD,I,100,',
  ].join('\n');
  const { rows } = loanTape.parseFile(Buffer.from(csv), 'tape.csv');
  const { valid, errors } = loanTape.validateRows(rows, 'business_loans', { existing: new Map([['B9', 'mortgages']]) });
  assert.deepEqual(valid.map((v) => v.data.facilityRef), ['A1', 'A3']);
  assert.equal(valid[1].data.outstanding, 1250000);
  assert.equal(valid[1].data.currency, 'AMD');
  const has = (row, field, re) => assert.ok(errors.some((e) => e.row === row && e.field === field && re.test(e.message)), `${row} ${field}`);
  has(3, 'counterpartyId', /Required/);
  has(3, 'outstanding', /negative/);
  has(3, 'currency', /ISO 4217/);
  has(3, 'naceCode', /NACE/);
  has(3, 'equityPlusDebt', /greater than 0/);
  has(4, 'facilityRef', /Duplicate of row 2/);
  has(4, 'originationDate', /future/);
  has(6, 'facilityRef', /mortgages/);
  // Real estate needs value at origination.
  const re = loanTape.parseFile(Buffer.from('facilityRef,outstanding,currency\nM1,10,AMD\n'), 'm.csv');
  const v = loanTape.validateRows(re.rows, 'mortgages');
  assert.ok(v.errors.some((e) => e.field === 'valueAtOrigination'));
  assert.equal(loanTape.stableIdFor('co', 'C1'), require('crypto').createHash('sha256').update('co:C1').digest('hex'));
  // Every template parses back into valid rows.
  for (const cls of loanTape.TAPE_CLASSES) {
    const t = loanTape.parseFile(Buffer.from(loanTape.templateCsv(cls)), 't.csv');
    assert.deepEqual(loanTape.validateRows(t.rows, cls).errors, [], cls);
  }
});

test('factor upload validation', () => {
  const { factors, errors } = factorLib.validateFactors([
    { _row: 2, kind: 'revenue_sector', key: '55.10', currency: 'amd', value: '0.4' },
    { _row: 3, kind: 'revenue_sector', key: 'C', value: '1' },
    { _row: 4, kind: 'bogus', key: 'x', value: '1' },
    { _row: 5, kind: 'grid', key: 'AM', value: '-1' },
    { _row: 6, kind: 'grid', key: 'AM', value: '0.2', unit: 'kg/kWh' },
  ]);
  assert.equal(factors.length, 1);
  assert.equal(factors[0].unit, 'tCO2e/M revenue');
  assert.deepEqual(errors.map((e) => [e.row, e.field]), [[3, 'currency'], [4, 'kind'], [5, 'value'], [6, 'unit']]);
});
