'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// crremEngine.js — Carbon Risk Real Estate Monitor (RE-02)
//
// For each asset, projects the current energy/emissions intensity forward
// and finds the first year it exceeds the CRREM 1.5°C or 2.0°C pathway.
// That year is the "stranding year" — the point at which the asset becomes
// non-compliant with a Paris-aligned trajectory.
//
// The engine reads CRREM pathway data from the real_estate sector pack's
// crrem-pathways.json (seeded at boot) and each asset's energy records.
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/prisma');
const path = require('path');
const fs = require('fs');

// Load the CRREM pathway lookup (seeded from sectors/real_estate/).
// Shape: { "DE::office::1.5C": [{ year, kgCo2ePerM2 }, ...], ... }
let pathwayCache = null;

function loadPathways() {
  if (pathwayCache) return pathwayCache;
  const filePath = path.join(__dirname, '..', 'sectors', 'real_estate', 'crrem-pathways.json');
  if (!fs.existsSync(filePath)) {
    console.warn('[crremEngine] crrem-pathways.json not found — using built-in defaults');
    pathwayCache = buildDefaultPathways();
    return pathwayCache;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    pathwayCache = {};
    for (const entry of raw) {
      const key = `${entry.country}::${entry.assetClass}::${entry.scenario}`;
      if (!pathwayCache[key]) pathwayCache[key] = [];
      pathwayCache[key].push({ year: entry.year, kgCo2ePerM2: entry.kgCo2ePerM2 });
    }
    for (const key of Object.keys(pathwayCache)) {
      pathwayCache[key].sort((a, b) => a.year - b.year);
    }
    return pathwayCache;
  } catch (err) {
    console.error('[crremEngine] Failed to load pathways:', err.message);
    pathwayCache = buildDefaultPathways();
    return pathwayCache;
  }
}

// Fallback: a simple linear pathway from 2020 → 2050 for any country/class.
function buildDefaultPathways() {
  const scenarios = ['1.5C', '2.0C'];
  const start2020 = { '1.5C': 35, '2.0C': 45 }; // kgCO2e/m2
  const end2050 = { '1.5C': 5, '2.0C': 15 };
  const result = {};
  for (const sc of scenarios) {
    const key = `GLO::office::${sc}`;
    const pts = [];
    for (let yr = 2020; yr <= 2050; yr++) {
      const frac = (yr - 2020) / 30;
      pts.push({ year: yr, kgCo2ePerM2: start2020[sc] + (end2050[sc] - start2020[sc]) * frac });
    }
    result[key] = pts;
  }
  return result;
}

// Get the pathway for a specific asset (country × class × scenario).
// Falls back to GLO::office if no match.
function getPathway(country, assetClass, scenario) {
  const pw = loadPathways();
  return pw[`${country}::${assetClass}::${scenario}`]
    || pw[`GLO::${assetClass}::${scenario}`]
    || pw[`GLO::office::${scenario}`]
    || [];
}

// Grid emission factor lookup (simplified — reuses the factor DB if available).
const GRID_FACTORS = {
  DE: 0.381, FR: 0.052, NL: 0.328, US: 0.389, UK: 0.207, EU: 0.238,
  CN: 0.612, GLO: 0.450,
};

function gridFactor(country) {
  return GRID_FACTORS[country] || GRID_FACTORS.GLO;
}

/**
 * Compute the CRREM stranding analysis for a single asset.
 *
 * @param {string} assetId
 * @param {string} scenario — '1.5C' or '2.0C'
 * @returns {{ currentIntensity, strandedFromYear, pathwayPoints, assetProjection }}
 */
async function analyseAsset(assetId, scenario = '1.5C') {
  const asset = await prisma.realEstateAsset.findUnique({
    where: { id: assetId },
    include: { energyRecords: { orderBy: { year: 'desc' } } },
  });
  if (!asset) throw new Error('Asset not found.');
  if (asset.grossFloorAreaM2 <= 0) throw new Error('Asset has no floor area.');

  // Sum energy by year → compute kgCO2e/m2 intensity.
  const byYear = {};
  for (const rec of asset.energyRecords) {
    if (!byYear[rec.year]) byYear[rec.year] = 0;
    let kwh = rec.quantity;
    const u = (rec.unit || '').toLowerCase();
    if (u.includes('mwh')) kwh *= 1000;
    else if (u === 'm3') kwh *= 10.55; // natural gas approx
    else if (u === 'litre') kwh *= 10; // heating oil approx

    // Convert kWh → kgCO2e using fuel type or grid factor
    let factor = gridFactor(asset.country);
    if (rec.fuel === 'natural_gas') factor = 0.184;
    else if (rec.fuel === 'oil') factor = 0.268;
    else if (rec.fuel === 'district_heat') factor = 0.15;
    else if (rec.fuel === 'district_cool') factor = 0.05;

    byYear[rec.year] += kwh * factor;
  }

  // Current intensity = most recent year with data.
  const sortedYears = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  const latestYear = sortedYears[0] || new Date().getFullYear();
  const currentKgCo2e = byYear[latestYear] || 0;
  const currentIntensity = currentKgCo2e / asset.grossFloorAreaM2;

  // Get the pathway.
  const pw = getPathway(asset.country, asset.assetClass, scenario);

  // Project asset forward (flat — no retrofit assumption) and find stranding.
  let strandedFromYear = null;
  const assetProjection = [];
  for (let yr = 2024; yr <= 2050; yr++) {
    // Find pathway value for this year (interpolate if needed).
    const pwPt = pw.find((p) => p.year === yr);
    const pathwayValue = pwPt ? pwPt.kgCo2ePerM2 : null;

    assetProjection.push({
      year: yr,
      assetKgCo2ePerM2: Math.round(currentIntensity * 100) / 100,
      pathwayKgCo2ePerM2: pathwayValue ? Math.round(pathwayValue * 100) / 100 : null,
    });

    if (pathwayValue && currentIntensity > pathwayValue && !strandedFromYear) {
      strandedFromYear = yr;
    }
  }

  // Persist the result.
  await prisma.assetCrremPathway.upsert({
    where: { assetId_pathway: { assetId, pathway: scenario } },
    create: { assetId, pathway: scenario, strandedFromYear, currentKgCo2ePerM2: currentIntensity },
    update: { strandedFromYear, currentKgCo2ePerM2: currentIntensity },
  });

  return {
    assetId,
    assetName: asset.name,
    scenario,
    currentIntensity: Math.round(currentIntensity * 100) / 100,
    strandedFromYear,
    latestDataYear: latestYear,
    grossFloorAreaM2: asset.grossFloorAreaM2,
    assetProjection,
  };
}

/**
 * Analyse all assets for a company (both scenarios).
 */
async function analysePortfolio(companyId) {
  const assets = await prisma.realEstateAsset.findMany({ where: { companyId } });
  const results = [];
  for (const asset of assets) {
    try {
      const r15 = await analyseAsset(asset.id, '1.5C');
      const r20 = await analyseAsset(asset.id, '2.0C');
      results.push({ assetId: asset.id, name: asset.name, '1.5C': r15, '2.0C': r20 });
    } catch (err) {
      results.push({ assetId: asset.id, name: asset.name, error: err.message });
    }
  }
  return results;
}

module.exports = { analyseAsset, analysePortfolio, getPathway, loadPathways };
