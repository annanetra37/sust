'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic SYNTHETIC loan book for the Financed Emissions demo: the
// golden lines plus ~45 generated lines (seeded PRNG, so every seed run
// produces the same tape).  No real clients, amounts or factors.
// ─────────────────────────────────────────────────────────────────────────────

const { GOLDEN } = require('./golden');

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BRANCHES = ['Yerevan Centre', 'Gyumri', 'Vanadzor', 'Dilijan'];
const SECTORS = ['55.10', '56.10', '10.11', '25.11', '46.90', '47.19', '41.20', '01.13', '35.11', '49.41', '62.01', '86.10', '68.20'];
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Lines: [{ exposure, counterparty?, emissions? }] with currency AMD. */
function demoBook() {
  const rnd = mulberry32(20251231);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const round = (v, step) => Math.round(v / step) * step;
  const lines = GOLDEN.map(({ expect, ...l }) => l);

  // 25 business loans across sectors and ladder steps.
  for (let i = 1; i <= 25; i++) {
    const outstanding = round(5e6 + rnd() * 150e6, 1e5);
    const equityPlusDebt = round(outstanding * (2 + rnd() * 8), 1e6);
    const naceCode = SECTORS[i % SECTORS.length];
    const counterparty = { clientId: `SYN-B${String(i).padStart(3, '0')}`, country: 'AM', naceCode, revenueCurrency: 'AMD', equityPlusDebt };
    const emissions = [];
    if (i % 6 === 0) emissions.push({ year: 2025, source: 'reported', verified: i % 12 === 0, scope1: round(rnd() * 2000, 1), scope2: round(rnd() * 800, 1) });
    else if (i % 4 !== 0) counterparty.revenue = round(equityPlusDebt * (0.5 + rnd()), 1e6);
    if (i === 23) { delete counterparty.naceCode; counterparty.localSectorCode = 'AM-HOTEL'; counterparty.revenue = 300e6; } // mapped via tenant override
    if (i === 24) delete counterparty.equityPlusDebt; // exception: missing equity + debt
    lines.push({
      exposure: { facilityRef: `SYN-BL-${String(i).padStart(3, '0')}`, assetClass: 'business_loans', outstanding, undrawn: i % 5 === 0 ? round(outstanding * 0.2, 1e5) : null, branch: pick(BRANCHES), segment: outstanding > 60e6 ? 'Corporate' : 'SME' },
      counterparty,
      emissions,
    });
  }

  // 8 commercial real estate loans.
  const types = ['office', 'retail', 'hotel', 'warehouse'];
  for (let i = 1; i <= 8; i++) {
    const valueAtOrigination = round(100e6 + rnd() * 900e6, 1e6);
    const outstanding = round(valueAtOrigination * (0.3 + rnd() * 0.5), 1e5);
    const floorAreaM2 = round(500 + rnd() * 5000, 10);
    const exposure = { facilityRef: `SYN-CRE-${String(i).padStart(3, '0')}`, assetClass: 'commercial_re', outstanding, valueAtOrigination, propertyType: types[i % types.length], floorAreaM2, country: 'AM', branch: pick(BRANCHES), segment: 'Corporate' };
    if (i % 3 === 0) exposure.energyKwh = round(floorAreaM2 * (100 + rnd() * 150), 100);
    else if (i % 3 === 1) exposure.energyLabel = pick(LABELS);
    lines.push({ exposure, counterparty: { clientId: `SYN-R${String(i).padStart(3, '0')}`, country: 'AM', naceCode: '68.20', equityPlusDebt: round(valueAtOrigination * 1.5, 1e6) } });
  }

  // 12 mortgages (households, no counterparty).
  for (let i = 1; i <= 12; i++) {
    const valueAtOrigination = round(20e6 + rnd() * 80e6, 1e5);
    const exposure = { facilityRef: `SYN-MTG-${String(i).padStart(3, '0')}`, assetClass: 'mortgages', outstanding: round(valueAtOrigination * (0.2 + rnd() * 0.6), 1e4), valueAtOrigination, propertyType: 'residential', country: 'AM', branch: pick(BRANCHES), segment: 'Retail' };
    if (i % 4 !== 0) exposure.floorAreaM2 = round(45 + rnd() * 120, 1);
    if (i % 3 === 0) exposure.energyLabel = pick(LABELS);
    if (i === 5) exposure.energyKwh = 9000;
    lines.push({ exposure });
  }
  return lines;
}

module.exports = { demoBook };
