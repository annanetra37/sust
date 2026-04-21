'use strict';

const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const crremEngine = require('../services/crremEngine');

router.use(authenticate);

// ─── Asset CRUD ─────────────────────────────────────────────────────────────

router.post('/assets', async (req, res) => {
  try {
    const { name, assetClass, tenure, grossFloorAreaM2, netLeasableM2, yearBuilt, yearAcquired, country, city, latitude, longitude, certifications, tenantCount, occupancyPct } = req.body;
    if (!name || !assetClass || !grossFloorAreaM2 || !country || !city) {
      return res.status(400).json({ error: 'Name, asset class, floor area, country, and city are required.' });
    }
    const asset = await prisma.realEstateAsset.create({
      data: {
        companyId: req.user.companyId, name, assetClass, tenure: tenure || 'owned',
        grossFloorAreaM2: parseFloat(grossFloorAreaM2), netLeasableM2: netLeasableM2 ? parseFloat(netLeasableM2) : null,
        yearBuilt: yearBuilt ? parseInt(yearBuilt) : null, yearAcquired: yearAcquired ? parseInt(yearAcquired) : null,
        country, city, latitude: latitude ? parseFloat(latitude) : null, longitude: longitude ? parseFloat(longitude) : null,
        certifications: certifications || null, tenantCount: tenantCount ? parseInt(tenantCount) : null,
        occupancyPct: occupancyPct ? parseFloat(occupancyPct) : null,
      },
    });
    logActivity(req.user.id, req.user.companyId, 'RE_ASSET_CREATE', `Created asset ${name}`, { assetId: asset.id }, req.ip);
    res.status(201).json(asset);
  } catch (err) { const { status, error } = formatError(err); res.status(status).json({ error }); }
});

router.get('/assets', async (req, res) => {
  try {
    const assets = await prisma.realEstateAsset.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { energyRecords: true } },
        crremPathways: true,
      },
    });
    res.json(assets);
  } catch (err) { const { status, error } = formatError(err); res.status(status).json({ error }); }
});

router.get('/assets/:id', async (req, res) => {
  try {
    const asset = await prisma.realEstateAsset.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: { energyRecords: { orderBy: [{ year: 'desc' }, { month: 'asc' }] }, crremPathways: true },
    });
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    res.json(asset);
  } catch (err) { const { status, error } = formatError(err); res.status(status).json({ error }); }
});

router.delete('/assets/:id', async (req, res) => {
  try {
    const asset = await prisma.realEstateAsset.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    await prisma.realEstateAsset.delete({ where: { id: req.params.id } });
    res.json({ message: 'Asset deleted.' });
  } catch (err) { const { status, error } = formatError(err); res.status(status).json({ error }); }
});

// ─── Energy records ─────────────────────────────────────────────────────────

router.post('/assets/:id/energy', async (req, res) => {
  try {
    const asset = await prisma.realEstateAsset.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    const { year, month, fuel, quantity, unit, cost, currency } = req.body;
    if (!year || !fuel || !quantity) return res.status(400).json({ error: 'Year, fuel type, and quantity are required.' });
    const record = await prisma.assetEnergyRecord.create({
      data: { assetId: asset.id, year: parseInt(year), month: month ? parseInt(month) : null, fuel, quantity: parseFloat(quantity), unit: unit || 'kWh', cost: cost ? parseFloat(cost) : null, currency: currency || null },
    });
    res.status(201).json(record);
  } catch (err) { const { status, error } = formatError(err); res.status(status).json({ error }); }
});

// ─── CRREM Analysis ─────────────────────────────────────────────────────────

router.post('/assets/:id/crrem', async (req, res) => {
  try {
    const asset = await prisma.realEstateAsset.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    const scenario = req.body.scenario || '1.5C';
    const result = await crremEngine.analyseAsset(asset.id, scenario);
    res.json(result);
  } catch (err) { const { status, error } = formatError(err); res.status(status).json({ error }); }
});

router.get('/portfolio/crrem', async (req, res) => {
  try {
    const results = await crremEngine.analysePortfolio(req.user.companyId);
    res.json(results);
  } catch (err) { const { status, error } = formatError(err); res.status(status).json({ error }); }
});

module.exports = router;
