'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Golden lines — SYNTHETIC, hand-checkable PCAF cases for the engine test and
// the demo seed.  Factors come from ./factors.js (ILLUSTRATIVE).  Amounts in
// AMD; reporting year 2025.  `expect` is worked out by hand in the comment.
// ─────────────────────────────────────────────────────────────────────────────

const cp = (id, extra = {}) => ({ clientId: id, country: 'AM', revenueCurrency: 'AMD', ...extra });

const GOLDEN = [
  // 100M ÷ 500M = 0.2; verified 300 + 200 = 500 t → 100 t; score 1.
  { exposure: { facilityRef: 'G-BL-01', assetClass: 'business_loans', outstanding: 100e6, branch: 'Yerevan Centre', segment: 'Corporate' },
    counterparty: cp('SYN-C01', { name: 'Synthetic Cement Works', naceCode: '23.51', equityPlusDebt: 500e6 }),
    emissions: [{ year: 2025, source: 'reported', verified: true, scope1: 300, scope2: 200 }],
    expect: { attribution: 0.2, financed: 100, score: 1, method: 'reported_verified' } },
  // 50M ÷ 1000M = 0.05; reported 1000 t (2024, unverified) → 50 t; score 2.
  { exposure: { facilityRef: 'G-BL-02', assetClass: 'business_loans', outstanding: 50e6, branch: 'Gyumri', segment: 'Corporate' },
    counterparty: cp('SYN-C02', { naceCode: '24.10', equityPlusDebt: 1000e6 }),
    emissions: [{ year: 2024, source: 'reported', verified: false, scope1: 1000 }],
    expect: { attribution: 0.05, financed: 50, score: 2, method: 'reported' } },
  // 20M ÷ 40M = 0.5; energy-based 80 + 20 = 100 t → 50 t; score 2.
  { exposure: { facilityRef: 'G-BL-03', assetClass: 'business_loans', outstanding: 20e6, branch: 'Yerevan Centre', segment: 'SME' },
    counterparty: cp('SYN-C03', { naceCode: '10.71', equityPlusDebt: 40e6 }),
    emissions: [{ year: 2025, source: 'energy', scope1: 80, scope2: 20 }],
    expect: { attribution: 0.5, financed: 50, score: 2, method: 'energy' } },
  // 30M ÷ 120M = 0.25; production-based 400 t → 100 t; score 3.
  { exposure: { facilityRef: 'G-BL-04', assetClass: 'business_loans', outstanding: 30e6, branch: 'Vanadzor', segment: 'Corporate' },
    counterparty: cp('SYN-C04', { naceCode: '01.11', equityPlusDebt: 120e6 }),
    emissions: [{ year: 2025, source: 'production', scope2: 400 }],
    expect: { attribution: 0.25, financed: 100, score: 3, method: 'production' } },
  // Hotel: revenue 850M × 0.4 (55.10) = 340 t; 90M ÷ 500M = 0.18 → 61.2 t;
  // undrawn 10M ÷ 500M = 0.02 × 340 = 6.8 t (separate); score 4.
  { exposure: { facilityRef: 'G-BL-05', assetClass: 'business_loans', outstanding: 90e6, undrawn: 10e6, branch: 'Yerevan Centre', segment: 'SME' },
    counterparty: cp('SYN-C05', { name: 'Synthetic Hotel Ararat', naceCode: '55.10', revenue: 850e6, equityPlusDebt: 500e6 }),
    expect: { attribution: 0.18, financed: 61.2, score: 4, method: 'revenue@revenue_sector:55.10', undrawn: 6.8 } },
  // Food maker, no revenue: 10.71 → 10 (no asset factor) → C 0.6 × 300M = 180 t;
  // 40M ÷ 300M = 0.1333 → 24 t; score 5.
  { exposure: { facilityRef: 'G-BL-06', assetClass: 'business_loans', outstanding: 40e6, branch: 'Gyumri', segment: 'SME' },
    counterparty: cp('SYN-C06', { naceCode: '10.71', equityPlusDebt: 300e6 }),
    expect: { attribution: 40 / 300, financed: 24, score: 5, method: 'asset@asset_sector:C' } },
  // Office: 360,000 kWh × 0.2 kg/kWh = 72 t; 300M ÷ 600M = 0.5 → 36 t; score 2.
  { exposure: { facilityRef: 'G-CRE-01', assetClass: 'commercial_re', outstanding: 300e6, valueAtOrigination: 600e6, propertyType: 'office', floorAreaM2: 2400, energyKwh: 360000, country: 'AM', branch: 'Yerevan Centre', segment: 'Corporate' },
    counterparty: cp('SYN-C07', { naceCode: '68.20', equityPlusDebt: 900e6 }),
    expect: { attribution: 0.5, financed: 36, score: 2, method: 're_actual_energy@grid:AM' } },
  // Flat, label C: 120 kWh/m² × 85 m² = 10,200 kWh × 0.2 = 2.04 t; 25M ÷ 40M = 0.625 → 1.275 t; score 3.
  { exposure: { facilityRef: 'G-MTG-01', assetClass: 'mortgages', outstanding: 25e6, valueAtOrigination: 40e6, propertyType: 'residential', floorAreaM2: 85, energyLabel: 'C', country: 'AM', branch: 'Vanadzor', segment: 'Retail' },
    expect: { attribution: 0.625, financed: 1.275, score: 3, method: 're_label@energy_label:C' } },
  // House, benchmark 150 kWh/m² × 100 m² = 15,000 kWh × 0.2 = 3 t; 30M ÷ 60M = 0.5 → 1.5 t; score 4.
  { exposure: { facilityRef: 'G-MTG-02', assetClass: 'mortgages', outstanding: 30e6, valueAtOrigination: 60e6, propertyType: 'residential', floorAreaM2: 100, country: 'AM', branch: 'Gyumri', segment: 'Retail' },
    expect: { attribution: 0.5, financed: 1.5, score: 4, method: 're_benchmark@building_benchmark:RESIDENTIAL' } },
  // No area: mortgages fallback 0.05 × 50M = 2.5 t; 20M ÷ 50M = 0.4 → 1 t; score 5.
  { exposure: { facilityRef: 'G-MTG-03', assetClass: 'mortgages', outstanding: 20e6, valueAtOrigination: 50e6, country: 'AM', branch: 'Yerevan Centre', segment: 'Retail' },
    expect: { attribution: 0.4, financed: 1, score: 5, method: 're_outstanding@asset_sector:MORTGAGES' } },
  // Over-attributed: 120M ÷ 100M capped at 1; revenue 200M × G 0.2 = 40 t → 40 t; score 4.
  { exposure: { facilityRef: 'G-BL-07', assetClass: 'business_loans', outstanding: 120e6, branch: 'Gyumri', segment: 'SME' },
    counterparty: cp('SYN-C08', { naceCode: '47.11', revenue: 200e6, equityPlusDebt: 100e6 }),
    expect: { attribution: 1, financed: 40, score: 4, capped: true } },
  // Exceptions.
  { exposure: { facilityRef: 'G-EX-01', assetClass: 'business_loans', outstanding: 15e6, branch: 'Vanadzor', segment: 'SME' },
    counterparty: cp('SYN-C09', { naceCode: '41.20', revenue: 60e6 }),
    expect: { exception: /equity \+ debt of the borrower is missing/ } },
  { exposure: { facilityRef: 'G-EX-02', assetClass: 'commercial_re', outstanding: 80e6, propertyType: 'retail', floorAreaM2: 900, country: 'AM', branch: 'Yerevan Centre', segment: 'Corporate' },
    counterparty: cp('SYN-C10', { naceCode: '68.20', equityPlusDebt: 400e6 }),
    expect: { exception: /Property value at origination is missing/ } },
  { exposure: { facilityRef: 'G-EX-03', assetClass: 'business_loans', outstanding: 12e6, branch: 'Gyumri', segment: 'SME' },
    counterparty: cp('SYN-C11', { localSectorCode: 'AM-LOC-77', equityPlusDebt: 50e6 }),
    expect: { exception: /no sector code|not a valid NACE/, unmapped: true } },
];

module.exports = { GOLDEN, REPORTING_YEAR: 2025 };
