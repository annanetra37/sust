'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// run.js — calculation runs for a reporting period (P-12 for FE)
//
// Loads the period's exposures, counterparties, emissions, factor set and
// sector mapping; computes every line with pcaf.js; stores an FeCalcRun with
// methodology version, factor set + version, inputsHash, outputsHash and
// totals, plus one FeLineResult per line.  Runs are synchronous (MVP).
// Re-running unchanged inputs produces the same outputsHash.
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../../config/prisma');
const pcaf = require('./pcaf');
const metrics = require('./metrics');
const { gridFallback } = require('./factors');

const BATCH = 1000;

/** Factor set the run uses: requested → last run's → newest accessible. */
async function resolveFactorSet(companyId, periodId, requestedId) {
  const access = { OR: [{ companyId }, { companyId: null }] };
  if (requestedId) {
    const set = await prisma.feFactorSet.findFirst({ where: { id: requestedId, ...access } });
    if (!set) { const e = new Error('Factor set not found.'); e.status = 404; throw e; }
    return set;
  }
  const last = await prisma.feCalcRun.findFirst({ where: { periodId, factorSetId: { not: null } }, orderBy: { createdAt: 'desc' } });
  if (last) {
    const set = await prisma.feFactorSet.findFirst({ where: { id: last.factorSetId, ...access } });
    if (set) return set;
  }
  return (await prisma.feFactorSet.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } }))
    || prisma.feFactorSet.findFirst({ where: { companyId: null }, orderBy: { createdAt: 'desc' } });
}

const sortBy = (k) => (a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0);

/**
 * Load everything a run needs.  Returns { ctx, inputs, canonicalInputs,
 * inputsHash, factorSet, exposures }.
 */
async function loadInputs({ period, portfolio, companyId, factorSetId }) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { country: true } });
  const factorSet = await resolveFactorSet(companyId, period.id, factorSetId);
  const [exposures, factors, maps] = await Promise.all([
    prisma.feExposure.findMany({ where: { periodId: period.id } }),
    factorSet ? prisma.feFactor.findMany({ where: { setId: factorSet.id } }) : [],
    prisma.feSectorMap.findMany({ where: { companyId } }),
  ]);
  const cpIds = [...new Set(exposures.map((e) => e.counterpartyId).filter(Boolean))];
  const [cps, ems] = await Promise.all([
    prisma.feCounterparty.findMany({ where: { id: { in: cpIds }, companyId } }),
    prisma.feCounterpartyEmissions.findMany({ where: { counterpartyId: { in: cpIds } } }),
  ]);
  const counterparties = new Map(cps.map((c) => [c.id, c]));
  const emissions = new Map();
  for (const r of ems) {
    if (!emissions.has(r.counterpartyId)) emissions.set(r.counterpartyId, []);
    emissions.get(r.counterpartyId).push(r);
  }

  const defaultCountry = (company && company.country ? company.country : 'AM').toUpperCase();
  const index = pcaf.buildFactorIndex(factorSet, factors);
  const sectorMap = new Map(maps.map((m) => [m.code.toUpperCase(), m.factorKey]));

  // Grid fallback values are frozen per run so the hash covers them.
  const gridCache = new Map();
  const grid = (country) => {
    const k = String(country || 'GLO').toUpperCase();
    if (!gridCache.has(k)) gridCache.set(k, gridFallback(k));
    return gridCache.get(k);
  };
  const reCountries = [...new Set(exposures
    .filter((e) => e.assetClass === 'commercial_re' || e.assetClass === 'mortgages')
    .map((e) => (e.country || counterparties.get(e.counterpartyId)?.country || defaultCountry).toUpperCase()))].sort();

  const ctx = {
    reportingYear: new Date(period.reportingDate).getUTCFullYear(),
    baseCurrency: portfolio.baseCurrency || 'AMD',
    defaultCountry,
    factors: index,
    sectorMap,
    gridFallback: grid,
  };

  const stable = (id) => (id ? counterparties.get(id)?.stableId || null : null);
  const canonicalInputs = {
    methodologyVersion: pcaf.METHODOLOGY_VERSION,
    baseCurrency: ctx.baseCurrency,
    reportingYear: ctx.reportingYear,
    defaultCountry,
    factorSet: factorSet ? { id: factorSet.id, version: factorSet.version, illustrative: factorSet.illustrative } : null,
    factors: factors.map((f) => ({ kind: f.kind, key: f.key, region: f.region, currency: f.currency, unit: f.unit, value: f.value, scope1Share: f.scope1Share }))
      .sort((a, b) => metrics.canonical(a).localeCompare(metrics.canonical(b))),
    sectorMap: [...sectorMap.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    gridFallback: Object.fromEntries(reCountries.map((c) => [c, grid(c)?.value ?? null])),
    exposures: exposures.map((e) => ({
      facilityRef: e.facilityRef, assetClass: e.assetClass, outstanding: e.outstanding, undrawn: e.undrawn, currency: e.currency,
      valueAtOrigination: e.valueAtOrigination, propertyType: e.propertyType, floorAreaM2: e.floorAreaM2, energyKwh: e.energyKwh,
      energyLabel: e.energyLabel, country: e.country, cp: stable(e.counterpartyId),
    })).sort(sortBy('facilityRef')),
    counterparties: cps.map((c) => ({
      stableId: c.stableId, naceCode: c.naceCode, localSectorCode: c.localSectorCode, revenue: c.revenue,
      revenueCurrency: c.revenueCurrency, equityPlusDebt: c.equityPlusDebt, country: c.country,
    })).sort(sortBy('stableId')),
    emissions: ems.map((r) => ({ cp: stable(r.counterpartyId), year: r.year, source: r.source, verified: r.verified, scope1: r.scope1, scope2: r.scope2 }))
      .sort((a, b) => metrics.canonical(a).localeCompare(metrics.canonical(b))),
  };

  return {
    ctx,
    inputs: { exposures, counterparties, emissions },
    canonicalInputs,
    inputsHash: metrics.hash(canonicalInputs),
    mappingHash: metrics.hash(canonicalInputs.sectorMap),
    factorSet,
    exposures,
  };
}

/** Compute without storing (used by runs and by "verify reproducibility"). */
async function compute(args) {
  const loaded = await loadInputs(args);
  const lines = pcaf.calculatePeriod(loaded.inputs, loaded.ctx);
  const totals = metrics.computeTotals(lines);
  totals.factorSet = loaded.factorSet
    ? { id: loaded.factorSet.id, name: loaded.factorSet.name, version: loaded.factorSet.version, source: loaded.factorSet.source, illustrative: loaded.factorSet.illustrative }
    : null;
  totals.mapping = { entries: loaded.canonicalInputs.sectorMap.length, hash: loaded.mappingHash };
  totals.baseCurrency = loaded.ctx.baseCurrency;
  totals.reportingYear = loaded.ctx.reportingYear;
  const outputsHash = metrics.outputsHash(lines, totals);
  return { ...loaded, lines, totals, outputsHash };
}

/** Compute and store a run.  Returns the FeCalcRun row. */
async function runPeriod({ period, portfolio, companyId, factorSetId, userId }) {
  const r = await compute({ period, portfolio, companyId, factorSetId });
  return prisma.$transaction(async (tx) => {
    const run = await tx.feCalcRun.create({
      data: {
        periodId: period.id,
        status: 'COMPLETED',
        methodologyVersion: pcaf.METHODOLOGY_VERSION,
        factorSetId: r.factorSet ? r.factorSet.id : null,
        factorSetVersion: r.factorSet ? r.factorSet.version : null,
        inputsHash: r.inputsHash,
        outputsHash: r.outputsHash,
        totals: r.totals,
        createdById: userId,
      },
    });
    const rows = r.lines.map((l) => ({
      runId: run.id,
      exposureId: l.exposureId,
      attribution: l.attribution,
      financedScope1: l.financedScope1,
      financedScope2: l.financedScope2,
      financedTotal: l.financedTotal,
      undrawnFinanced: l.undrawnFinanced,
      dqScore: l.dqScore,
      method: l.method,
      explanation: l.explanation,
      exception: l.exception,
    }));
    for (let i = 0; i < rows.length; i += BATCH) await tx.feLineResult.createMany({ data: rows.slice(i, i + BATCH) });
    return run;
  }, { timeout: 120000 });
}

module.exports = { resolveFactorSet, loadInputs, compute, runPeriod };
