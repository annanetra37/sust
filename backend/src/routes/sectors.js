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
