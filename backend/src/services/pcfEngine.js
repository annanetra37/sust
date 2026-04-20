'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// pcfEngine.js — LCA calculation engine with Monte Carlo uncertainty (PCF-03)
//
// Pure-Node compute service.  Takes a Product + its BOM + ProcessSteps and
// returns a PcfCalculation.  Lite version uses a cradle-to-gate boundary
// (stages A1–A3).
//
// Monte Carlo: 1,000 iterations.  Each factor value is resampled from
// N(mean, std) where std = EmissionFactor.uncertaintyStd (falls back to
// 10% of mean if null).  Output: p5 / p50 / p95.
//
// Performance budget: < 2 s for a 100-row BOM (all in-process, no DB
// round-trip per BOM item — batch factor lookups).
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/prisma');

const ENGINE_VERSION = '1.0.0';
const MONTE_CARLO_ITERATIONS = 1000;

// Box-Muller transform — generate a normally-distributed random number.
function normalRandom(mean, std) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, mean + z * std);
}

// Percentile from a sorted array.
function percentile(sorted, p) {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Run the LCA calculation for a product.
 *
 * @param {string} productId — UUID
 * @returns {object} PcfCalculation-shaped result (not yet persisted)
 */
async function calculatePcf(productId) {
  // ─── 1. Load product + BOM + components + process steps ───────
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      boms: { include: { component: true } },
      processes: true,
    },
  });

  if (!product) throw new Error('Product not found.');
  if (product.boms.length === 0) throw new Error('Product has no BOM items. Upload a BOM first.');

  // ─── 2. Batch-load all needed emission factors ────────────────
  const factorIds = [...new Set(product.boms.map((b) => b.chosenFactorId).filter(Boolean))];
  const factors = factorIds.length > 0
    ? await prisma.emissionFactor.findMany({ where: { id: { in: factorIds } } })
    : [];
  const factorMap = new Map(factors.map((f) => [f.id, f]));

  // For BOM items without a chosen factor, try a materialClass lookup.
  const missingFactorItems = product.boms.filter((b) => !b.chosenFactorId || !factorMap.has(b.chosenFactorId));
  if (missingFactorItems.length > 0) {
    const classes = [...new Set(missingFactorItems.map((b) => b.component?.materialClass).filter(Boolean))];
    if (classes.length > 0) {
      const fallbacks = await prisma.emissionFactor.findMany({
        where: { materialClass: { in: classes } },
        orderBy: { vintage: 'desc' },
      });
      for (const fb of fallbacks) {
        if (!factorMap.has(fb.materialClass)) {
          factorMap.set(fb.materialClass, fb);
        }
      }
    }
  }

  // ─── 3. Build per-item factor assignments ─────────────────────
  const items = product.boms.map((bom) => {
    let factor = bom.chosenFactorId ? factorMap.get(bom.chosenFactorId) : null;
    if (!factor && bom.component?.materialClass) {
      factor = factorMap.get(bom.component.materialClass) || null;
    }
    return {
      bomId: bom.id,
      componentId: bom.componentId,
      componentName: bom.component?.name || '?',
      materialClass: bom.component?.materialClass || '?',
      isPrimary: bom.component?.primaryDataFlag || false,
      quantity: bom.quantity || 0,
      scrapRatePct: bom.scrapRatePct || 0,
      lifecycleStage: bom.lifecycleStage || 'A1',
      factorId: factor?.id || null,
      factorValue: factor?.value || 0,
      factorStd: factor?.uncertaintyStd || (factor?.value ? factor.value * 0.10 : 0),
      factorUnit: factor?.unit || '?',
      factorSource: factor?.source || '?',
    };
  });

  // ─── 4. Add process-step emissions ────────────────────────────
  // ProcessSteps represent site-level energy/waste/water inputs that
  // aren't captured via the BOM (e.g., assembly energy at A3).
  const processEmissions = {};
  for (const ps of product.processes) {
    const stage = ps.lifecycleStage || 'A3';
    processEmissions[stage] = (processEmissions[stage] || 0) + (ps.emissionsKg || 0);
  }

  // ─── 5. Deterministic (p50) calculation ───────────────────────
  const byStage = {};
  const byComponent = [];
  let totalKgCo2e = 0;
  let primaryWeightedSum = 0;
  let totalWeight = 0;

  for (const item of items) {
    const effectiveQty = item.quantity * (1 + item.scrapRatePct / 100);
    const kgCo2e = effectiveQty * item.factorValue;
    const stage = item.lifecycleStage;

    byStage[stage] = (byStage[stage] || 0) + kgCo2e;
    byComponent.push({
      componentId: item.componentId,
      name: item.componentName,
      materialClass: item.materialClass,
      kgCo2e: Math.round(kgCo2e * 10000) / 10000,
      pct: 0, // filled below
    });
    totalKgCo2e += kgCo2e;
    totalWeight += item.quantity;
    if (item.isPrimary) primaryWeightedSum += item.quantity;
  }

  // Add process-step emissions to stage totals.
  for (const [stage, kg] of Object.entries(processEmissions)) {
    byStage[stage] = (byStage[stage] || 0) + kg;
    totalKgCo2e += kg;
  }

  // Compute percentages.
  for (const entry of byComponent) {
    entry.pct = totalKgCo2e > 0 ? Math.round((entry.kgCo2e / totalKgCo2e) * 10000) / 100 : 0;
  }
  byComponent.sort((a, b) => b.kgCo2e - a.kgCo2e);

  const primaryDataPct = totalWeight > 0 ? primaryWeightedSum / totalWeight : 0;

  // Round stage values.
  for (const key of Object.keys(byStage)) {
    byStage[key] = Math.round(byStage[key] * 10000) / 10000;
  }

  // ─── 6. Monte Carlo uncertainty ───────────────────────────────
  const trialTotals = new Float64Array(MONTE_CARLO_ITERATIONS);

  for (let t = 0; t < MONTE_CARLO_ITERATIONS; t++) {
    let trialTotal = 0;
    for (const item of items) {
      const effectiveQty = item.quantity * (1 + item.scrapRatePct / 100);
      const sampledFactor = normalRandom(item.factorValue, item.factorStd);
      trialTotal += effectiveQty * sampledFactor;
    }
    // Add process emissions (treated as deterministic for now).
    for (const kg of Object.values(processEmissions)) {
      trialTotal += kg;
    }
    trialTotals[t] = trialTotal;
  }

  // Sort for percentile extraction.
  trialTotals.sort();
  const p5  = Math.round(percentile(trialTotals, 5)  * 10000) / 10000;
  const p50 = Math.round(percentile(trialTotals, 50) * 10000) / 10000;
  const p95 = Math.round(percentile(trialTotals, 95) * 10000) / 10000;

  // ─── 7. Factor snapshot (for reproducibility) ─────────────────
  const factorSnapshot = items
    .filter((i) => i.factorId)
    .map((i) => ({
      bomId: i.bomId,
      factorId: i.factorId,
      value: i.factorValue,
      std: i.factorStd,
      source: i.factorSource,
    }));

  return {
    productId,
    engineVersion: ENGINE_VERSION,
    totalKgCo2e: Math.round(p50 * 10000) / 10000,
    uncertaintyLow: p5,
    uncertaintyHigh: p95,
    primaryDataPct: Math.round(primaryDataPct * 10000) / 10000,
    breakdownByStage: byStage,
    breakdownByComp: byComponent.slice(0, 50),
    factorSnapshot,
    status: 'draft',
  };
}

/**
 * Run + persist the calculation.
 */
async function runAndSave(productId) {
  const result = await calculatePcf(productId);
  const saved = await prisma.pcfCalculation.create({ data: result });
  return saved;
}

module.exports = { calculatePcf, runAndSave, ENGINE_VERSION };
