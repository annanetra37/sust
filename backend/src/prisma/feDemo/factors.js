'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// ILLUSTRATIVE factor set for the Financed Emissions demo and golden tests.
//
// Every value below is a made-up round number chosen so results can be
// checked by hand.  None is taken from PCAF, IEA, a national inventory or
// any other source, and none may be used for disclosure.  The set is stored
// with illustrative = true and the UI shows a warning on every result.
// ─────────────────────────────────────────────────────────────────────────────

const SET = {
  name: 'ILLUSTRATIVE — not for disclosure (Triple I demo factors)',
  version: 'demo-1',
  source: 'Synthetic round numbers made up for the demo and tests; not from any published source.',
  illustrative: true,
};

const f = (kind, key, value, extra = {}) => ({ kind, key, value, region: null, currency: null, scope1Share: null, notes: 'ILLUSTRATIVE', ...extra });
const UNITS = { revenue_sector: 'tCO2e/M revenue', asset_sector: 'tCO2e/M outstanding', building_benchmark: 'kWh/m2/yr', energy_label: 'kWh/m2/yr', grid: 'kgCO2e/kWh' };

const RAW = [
  // tCO2e per million AMD of revenue, by NACE key.
  ...[['55.10', 0.4], ['I', 0.5], ['10', 0.8], ['C', 1.0], ['G', 0.2], ['F', 0.6], ['A', 1.5], ['D', 4.0], ['H', 1.2], ['L', 0.1], ['M', 0.1], ['J', 0.05], ['Q', 0.15]]
    .map(([k, v]) => f('revenue_sector', k, v, { currency: 'AMD', scope1Share: 0.5 })),
  // tCO2e per million AMD of assets / outstanding.
  ...[['I', 0.3], ['C', 0.6], ['G', 0.1], ['F', 0.4], ['A', 1.0], ['D', 2.5], ['H', 0.8], ['L', 0.05], ['M', 0.05], ['J', 0.05], ['Q', 0.1],
    ['commercial_re', 0.08], ['mortgages', 0.05], ['motor_vehicle', 0.15]]
    .map(([k, v]) => f('asset_sector', k, v, { currency: 'AMD' })),
  // kWh per m² per year.
  ...[['office', 180], ['retail', 220], ['hotel', 260], ['residential', 150], ['warehouse', 90]]
    .map(([k, v]) => f('building_benchmark', k, v, { region: 'AM' })),
  ...[['A', 50], ['B', 80], ['C', 120], ['D', 170], ['E', 230], ['F', 300], ['G', 380]]
    .map(([k, v]) => f('energy_label', k, v, { region: 'AM' })),
  // kgCO2e per kWh.
  f('grid', 'AM', 0.2, { region: 'AM', scope1Share: 0 }),
];

const FACTORS = RAW.map((x) => ({ ...x, unit: UNITS[x.kind] }));

module.exports = { SET, FACTORS };
