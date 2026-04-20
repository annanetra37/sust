'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// sectors.js — Sector Pack API (PCF-05)
//
//   GET  /api/sectors                → list all installed packs
//   GET  /api/sectors/current        → the company's active pack + KPIs
//   POST /api/sectors/select         → { sectorKey } — set the active pack
//   POST /api/sectors/reload         → (admin) re-run the sector loader
//
// The loader (services/sectorLoader.js) runs once at server boot; this route
// is what the frontend uses to list installed sectors and to save the user's
// onboarding / settings selection.
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const sectorLoader = require('../services/sectorLoader');

router.use(authenticate);

// ─── Computed sector KPI values ─────────────────────────────────────────────
// Returns the company's active sector KPIs with live-computed values where
// possible.  KPIs that can't be auto-computed return value=null so the UI
// can render them as "Not yet reported" placeholders.
router.get('/kpis', async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const selection = await prisma.companySectorSelection.findUnique({ where: { companyId } });
    if (!selection) return res.json({ selected: false, sectorKey: null, kpis: [] });

    const pack = await prisma.sectorPack.findUnique({
      where: { key: selection.sectorKey },
      include: { kpis: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!pack) return res.json({ selected: true, sectorKey: selection.sectorKey, kpis: [] });

    // Fetch data for computation
    const [emissions, workforce, products, training, turnover, targets] = await Promise.all([
      prisma.fE1EmissionActivityData.findMany({ where: { companyId, year } }),
      prisma.fS1WorkforceComposition.findMany({ where: { companyId, year } }),
      prisma.product.findMany({
        where: { companyId },
        include: { calculations: { orderBy: { runAt: 'desc' }, take: 1 } },
      }),
      prisma.fS1EmployeeTraining.findMany({ where: { companyId, year } }),
      prisma.fS1EmployeeTurnover.findMany({ where: { companyId, year } }),
      prisma.sBTiTarget.findMany({ where: { companyId } }),
    ]);

    // Pre-compute aggregates
    const totalEmissions = emissions.reduce((s, r) => s + (r.totalEmissions || 0), 0);
    const scope1 = emissions.filter(r => r.scope === 'Scope 1').reduce((s, r) => s + (r.totalEmissions || 0), 0);
    const scope2 = emissions.filter(r => r.scope === 'Scope 2').reduce((s, r) => s + (r.totalEmissions || 0), 0);
    const scope3 = emissions.filter(r => r.scope === 'Scope 3').reduce((s, r) => s + (r.totalEmissions || 0), 0);
    const totalEmployees = workforce.reduce((s, r) => s + r.employeeCount, 0);

    // Energy: sum kWh from energy-related activities
    const energyKwh = emissions
      .filter(r => {
        const u = (r.unit || '').toLowerCase();
        const c = (r.activityCategory || '').toLowerCase();
        return u.includes('kwh') || u.includes('mwh') || c.includes('electric') || c.includes('energy');
      })
      .reduce((s, r) => {
        const u = (r.unit || '').toLowerCase();
        if (u.includes('mwh')) return s + r.quantity * 1000;
        return s + r.quantity;
      }, 0);

    // PCF data
    const productsWithPcf = products.filter(p => p.calculations[0]);
    const pcfCoveragePct = products.length > 0 ? (productsWithPcf.length / products.length) * 100 : 0;
    const avgPrimaryDataPct = productsWithPcf.length > 0
      ? productsWithPcf.reduce((s, p) => s + (p.calculations[0].primaryDataPct || 0), 0) / productsWithPcf.length * 100
      : 0;

    // Training
    const trainingHours = training.reduce((s, r) => s + (r.trainingHours || 0), 0);

    // Turnover
    const turnoverCount = turnover.reduce((s, r) => s + r.count, 0);
    const turnoverRate = totalEmployees > 0 ? (turnoverCount / totalEmployees) * 100 : 0;

    // Auto-compute values by KPI code
    const computeValue = (code) => {
      switch (code) {
        case 'TC-SC-110a.1': return totalEmissions > 0 ? { value: scope1, detail: `${scope1.toFixed(2)} tCO2e` } : null;
        case 'TC-SC-130a.1': return energyKwh > 0 ? { value: energyKwh * 0.0036, detail: `${(energyKwh * 0.0036).toFixed(1)} GJ (${energyKwh.toFixed(0)} kWh)` } : null;
        case 'PCF-COVERAGE': return products.length > 0 ? { value: pcfCoveragePct, detail: `${productsWithPcf.length} of ${products.length} products (${pcfCoveragePct.toFixed(0)}%)` } : null;
        case 'PCF-PRIMARY-DATA': return productsWithPcf.length > 0 ? { value: avgPrimaryDataPct, detail: `${avgPrimaryDataPct.toFixed(1)}% weighted avg` } : null;
        case 'E1-6-ELECT': return totalEmissions > 0 ? { value: totalEmissions, detail: `${totalEmissions.toFixed(2)} tCO2e total` } : null;
        case 'TC-HW-410a.1': return null; // needs product-level substance data we don't track yet
        default: return null;
      }
    };

    // Build enriched KPI list
    const kpis = pack.kpis.map((kpi) => {
      const computed = computeValue(kpi.code);
      return {
        id: kpi.id,
        code: kpi.code,
        name: kpi.name,
        unit: kpi.unit,
        framework: kpi.framework,
        category: kpi.category,
        sortOrder: kpi.sortOrder,
        computed: computed !== null,
        value: computed?.value ?? null,
        detail: computed?.detail ?? null,
      };
    });

    // Summary stats for the sector header
    const summary = {
      totalKpis: kpis.length,
      computedKpis: kpis.filter(k => k.computed).length,
      pendingKpis: kpis.filter(k => !k.computed).length,
      totalEmissions,
      scope1, scope2, scope3,
      totalEmployees,
      pcfCoveragePct,
      avgPrimaryDataPct,
      productCount: products.length,
      hasSbti: targets.length > 0,
      energyGj: energyKwh * 0.0036,
      trainingHours,
      turnoverRate,
    };

    res.json({
      selected: true,
      sectorKey: selection.sectorKey,
      packName: pack.name,
      packVersion: pack.version,
      frameworks: pack.manifest?.frameworks || [],
      summary,
      kpis,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── List all installed packs ───────────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const packs = await prisma.sectorPack.findMany({
      where: { enabled: true },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { kpis: true } },
      },
    });
    res.json(packs.map((p) => ({
      key: p.key,
      name: p.name,
      version: p.version,
      frameworks: p.manifest?.frameworks || [],
      description: p.manifest?.description || '',
      kpiCount: p._count.kpis,
      lifecycleStagesActive: p.manifest?.lifecycleStagesActive || [],
      functionalUnits: p.manifest?.functionalUnits || [],
    })));
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Current selection for the signed-in company ────────────────────────────
router.get('/current', async (req, res) => {
  try {
    const selection = await prisma.companySectorSelection.findUnique({
      where: { companyId: req.user.companyId },
    });
    if (!selection) {
      return res.json({ selected: false, sectorKey: null, pack: null, kpis: [] });
    }
    const pack = await prisma.sectorPack.findUnique({
      where: { key: selection.sectorKey },
      include: { kpis: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!pack) {
      return res.json({ selected: true, sectorKey: selection.sectorKey, pack: null, kpis: [] });
    }
    res.json({
      selected: true,
      sectorKey: selection.sectorKey,
      selectedAt: selection.selectedAt,
      pack: {
        key: pack.key,
        name: pack.name,
        version: pack.version,
        frameworks: pack.manifest?.frameworks || [],
        description: pack.manifest?.description || '',
        lifecycleStagesActive: pack.manifest?.lifecycleStagesActive || [],
        functionalUnits: pack.manifest?.functionalUnits || [],
        materialityStarters: pack.manifest?.materialityStarters || [],
      },
      kpis: pack.kpis,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Set / change the active pack ───────────────────────────────────────────
// Admin-only because switching sectors changes which dashboards + report
// sections are active for the whole company.
router.post('/select', requireAdmin, async (req, res) => {
  try {
    const { sectorKey } = req.body || {};
    if (!sectorKey) return res.status(400).json({ error: 'sectorKey is required.' });

    const pack = await prisma.sectorPack.findUnique({ where: { key: sectorKey } });
    if (!pack || !pack.enabled) {
      return res.status(404).json({ error: `Sector pack "${sectorKey}" not found or disabled.` });
    }

    const existing = await prisma.companySectorSelection.findUnique({
      where: { companyId: req.user.companyId },
    });
    const saved = await prisma.companySectorSelection.upsert({
      where: { companyId: req.user.companyId },
      create: { companyId: req.user.companyId, sectorKey },
      update: { sectorKey },
    });

    logActivity(
      req.user.id, req.user.companyId,
      existing ? 'SECTOR_CHANGE' : 'SECTOR_SELECT',
      existing
        ? `Sector pack changed from ${existing.sectorKey} to ${sectorKey}`
        : `Sector pack selected: ${sectorKey}`,
      { from: existing?.sectorKey || null, to: sectorKey }, req.ip,
    );

    res.json(saved);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Admin: re-run the disk → DB loader ─────────────────────────────────────
router.post('/reload', requireAdmin, async (req, res) => {
  try {
    const result = await sectorLoader.loadAllPacks();
    logActivity(req.user.id, req.user.companyId, 'SECTOR_RELOAD',
      `Reloaded ${result.length} sector pack(s)`, { result }, req.ip);
    res.json({ result });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
