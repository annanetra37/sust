'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// pcf.js — Product Carbon Footprint routes (PCF-02)
//
//   POST   /api/pcf/products                      — create a product
//   GET    /api/pcf/products                      — list company products
//   GET    /api/pcf/products/:id                  — product detail + BOM + calcs
//   PUT    /api/pcf/products/:id                  — update product metadata
//   DELETE /api/pcf/products/:id                  — delete product + cascade
//   POST   /api/pcf/products/:id/bom-upload       — AI-mapped BOM import
//   GET    /api/pcf/factors                       — search emission factors
//   PUT    /api/pcf/bom-items/:id                 — update a single BOM row
//   DELETE /api/pcf/bom-items/:id                 — delete a single BOM row
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/tier');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const { trackedAICall } = require('../utils/costTracker');
const { deductCredits } = require('../middleware/credits');
const estimator = require('../utils/estimator');
const config = require('../config');
const Anthropic = require('@anthropic-ai/sdk').default;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate);

let aiClient;
function getAI() {
  if (!aiClient) aiClient = new Anthropic({ apiKey: config.anthropic.apiKey });
  return aiClient;
}

// ─── Product CRUD ───────────────────────────────────────────────────────────

router.post('/products', async (req, res) => {
  try {
    const { sku, name, sector, functionalUnit, declaredUnit, massKg, lifetimeYears, orgUnitId, methodology } = req.body;
    if (!sku || !name) return res.status(400).json({ error: 'SKU and name are required.' });

    const product = await prisma.product.create({
      data: {
        companyId: req.user.companyId,
        sku,
        name,
        sector: sector || 'generic',
        functionalUnit: functionalUnit || '1 piece',
        declaredUnit: declaredUnit || functionalUnit || '1 piece',
        massKg: massKg ? parseFloat(massKg) : null,
        lifetimeYears: lifetimeYears ? parseFloat(lifetimeYears) : null,
        orgUnitId: orgUnitId || null,
        methodology: methodology || 'ISO_14067',
      },
    });
    logActivity(req.user.id, req.user.companyId, 'PCF_PRODUCT_CREATE', `Created product ${sku}: ${name}`, { productId: product.id, sku }, req.ip);
    res.status(201).json(product);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: `A product with SKU "${req.body.sku}" already exists.` });
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/products', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { boms: true, calculations: true } },
        calculations: { orderBy: { runAt: 'desc' }, take: 1, select: { totalKgCo2e: true, primaryDataPct: true, status: true, runAt: true } },
      },
    });
    res.json(products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      sector: p.sector,
      functionalUnit: p.functionalUnit,
      massKg: p.massKg,
      methodology: p.methodology,
      bomCount: p._count.boms,
      calcCount: p._count.calculations,
      latestCalc: p.calculations[0] || null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })));
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: {
        boms: {
          orderBy: { sortOrder: 'asc' },
          include: { component: true },
        },
        processes: { orderBy: { lifecycleStage: 'asc' } },
        calculations: { orderBy: { runAt: 'desc' }, take: 10 },
      },
    });
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json(product);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.put('/products/:id', async (req, res) => {
  try {
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return res.status(404).json({ error: 'Product not found.' });
    const allowed = ['name', 'sector', 'functionalUnit', 'declaredUnit', 'massKg', 'lifetimeYears', 'methodology'];
    const data = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) data[k] = ['massKg', 'lifetimeYears'].includes(k) ? (req.body[k] ? parseFloat(req.body[k]) : null) : req.body[k];
    }
    const updated = await prisma.product.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return res.status(404).json({ error: 'Product not found.' });
    await prisma.product.delete({ where: { id: req.params.id } });
    logActivity(req.user.id, req.user.companyId, 'PCF_PRODUCT_DELETE', `Deleted product ${existing.sku}: ${existing.name}`, { productId: existing.id, sku: existing.sku }, req.ip);
    res.json({ message: 'Product deleted.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── BOM Upload with AI Material Classifier ─────────────────────────────────

router.post('/products/:id/bom-upload', upload.single('file'), async (req, res) => {
  try {
    const product = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    if (!req.file) return res.status(400).json({ error: 'No file provided.' });

    // Credit check
    const creditCost = 2; // PCF_BOM_UPLOAD flat rate
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { creditBalance: true } });
    if ((company?.creditBalance ?? 0) < creditCost) {
      return res.status(403).json({ error: 'Insufficient credits', required: creditCost, available: company?.creditBalance ?? 0 });
    }

    // Parse Excel/CSV
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (rawRows.length === 0) return res.status(400).json({ error: 'File is empty or unreadable.' });

    const columns = Object.keys(rawRows[0]);
    const sampleRows = rawRows.slice(0, 8);

    // Step 1: AI schema mapping + material classification
    const classifierPrompt = `You are a sustainability and materials expert. You are given a Bill of Materials (BOM) spreadsheet for a ${product.sector} product.

## Source Columns
${JSON.stringify(columns)}

## Sample Rows (up to 8)
${JSON.stringify(sampleRows, null, 2)}

## Your Task
For EACH row in the data, classify and map the fields:

1. **componentName**: The component or part name (from the most descriptive column)
2. **materialClass**: A normalised material tag matching one of these known classes (pick the closest):
   aluminum_6061, aluminum_6061_rec, aluminum_adc12, copper_primary, copper_recycled, copper_wire,
   steel_low_alloy, steel_304, gold, silver, tin, tantalum, tungsten, nickel,
   pcb_fr4_1_2_layer, pcb_fr4_4_layer, pcb_fr4_6_layer, pcb_fr4_8_layer, solder_sac305,
   si_wafer_300mm, si_wafer_200mm, dram_ddr4_8gb, dram_ddr5_16gb, nand_512gb_tlc, nand_1tb_qlc,
   mcu_lowpower, cpu_server, capacitor_elec, capacitor_mlcc, resistor_smd, connector,
   li_ion_nmc, li_ion_lfp, nimh_battery,
   plastic_pc, plastic_abs, plastic_hdpe, plastic_pp, plastic_pvc,
   packaging_cardboard, packaging_eps,
   grid_electricity_vn, grid_electricity_my, grid_electricity_cn, grid_electricity_tw, grid_electricity_us, grid_electricity_eu, grid_electricity_de,
   natural_gas, fuel_diesel,
   OTHER (use "other_<description>" if nothing matches)
3. **quantity**: The numeric quantity (weight, count, length, area)
4. **unit**: The unit (kg, pcs, m, m2, kWh, etc.)
5. **lifecycleStage**: One of A1 (raw material), A2 (transport), A3 (manufacturing), A4 (distribution), B1 (use), C1 (end-of-life). Default A1 for raw materials/components.
6. **supplierName**: If a supplier/vendor column exists
7. **originCountry**: If a country/origin column exists (ISO 2-letter or full name)
8. **confidence**: 0.0 to 1.0 — how confident you are in the materialClass mapping

Handle ANY language, abbreviations, part numbers mixed with descriptions. Map EVERY row, never skip.

Return ONLY valid JSON array:
[
  {
    "rowIndex": 0,
    "componentName": "PCB Main Board 6-layer",
    "materialClass": "pcb_fr4_6_layer",
    "quantity": 0.045,
    "unit": "kg",
    "lifecycleStage": "A1",
    "supplierName": "Foxconn",
    "originCountry": "TW",
    "confidence": 0.92,
    "originalText": "first 80 chars of the source row for traceability"
  }
]`;

    const costCtx = {
      companyId: req.user.companyId,
      userId: req.user.id,
      operation: 'PCF_BOM_CLASSIFY',
      metadata: { productId: product.id, sku: product.sku, rowCount: rawRows.length },
    };

    // Send ALL rows (capped at 500) to the classifier
    const fullPrompt = `${classifierPrompt}\n\n## ALL ROWS (${rawRows.length} total)\n${JSON.stringify(rawRows.slice(0, 500), null, 2)}`;
    const response = await trackedAICall(
      getAI(),
      { model: config.anthropic.model, max_tokens: 8192, messages: [{ role: 'user', content: fullPrompt }] },
      costCtx,
    );

    const aiText = response.content[0].text;
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI classifier returned unparseable response.' });

    let classified;
    try { classified = JSON.parse(jsonMatch[0]); } catch { return res.status(500).json({ error: 'AI response is not valid JSON.' }); }

    // Step 2: For each classified row, find/create Component + BOM item
    // Clear existing BOM for this product (full replace on re-upload)
    await prisma.billOfMaterialsItem.deleteMany({ where: { productId: product.id } });

    const results = [];
    for (let i = 0; i < classified.length; i++) {
      const row = classified[i];
      if (!row.componentName || !row.materialClass) continue;

      // Find or create Component
      let component = await prisma.component.findFirst({
        where: { companyId: req.user.companyId, name: row.componentName, materialClass: row.materialClass },
      });
      if (!component) {
        component = await prisma.component.create({
          data: {
            companyId: req.user.companyId,
            name: row.componentName,
            materialClass: row.materialClass,
            supplierName: row.supplierName || null,
            originCountry: row.originCountry || null,
          },
        });
      }

      // Find best matching EmissionFactor
      const factor = await prisma.emissionFactor.findFirst({
        where: { materialClass: row.materialClass },
        orderBy: { vintage: 'desc' },
      });

      const bomItem = await prisma.billOfMaterialsItem.create({
        data: {
          productId: product.id,
          componentId: component.id,
          quantity: parseFloat(row.quantity) || 0,
          unit: row.unit || 'kg',
          lifecycleStage: row.lifecycleStage || 'A1',
          chosenFactorId: factor?.id || null,
          sortOrder: i,
        },
      });

      results.push({
        bomItemId: bomItem.id,
        rowIndex: row.rowIndex ?? i,
        componentName: row.componentName,
        materialClass: row.materialClass,
        quantity: bomItem.quantity,
        unit: bomItem.unit,
        lifecycleStage: bomItem.lifecycleStage,
        supplierName: row.supplierName || null,
        originCountry: row.originCountry || null,
        confidence: row.confidence ?? 0,
        originalText: row.originalText || '',
        factor: factor ? { id: factor.id, value: factor.value, unit: factor.unit, source: factor.source } : null,
        componentId: component.id,
      });
    }

    // Deduct credits
    await deductCredits(req.user.companyId, req.user.id, creditCost, 'PCF_BOM_UPLOAD',
      `BOM upload for ${product.sku}: ${results.length} components classified — ${creditCost} credits`, null);

    logActivity(req.user.id, req.user.companyId, 'PCF_BOM_UPLOAD',
      `BOM uploaded for product ${product.sku}: ${rawRows.length} rows → ${results.length} classified components`,
      { productId: product.id, sku: product.sku, inputRows: rawRows.length, classified: results.length }, req.ip);

    res.json({
      productId: product.id,
      inputRows: rawRows.length,
      classifiedRows: results.length,
      items: results,
    });
  } catch (err) {
    console.error('[PCF] BOM upload error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── BOM Item inline edit ───────────────────────────────────────────────────

router.put('/bom-items/:id', async (req, res) => {
  try {
    const item = await prisma.billOfMaterialsItem.findUnique({
      where: { id: req.params.id },
      include: { product: { select: { companyId: true } } },
    });
    if (!item || item.product.companyId !== req.user.companyId) {
      return res.status(404).json({ error: 'BOM item not found.' });
    }
    const data = {};
    if (req.body.quantity !== undefined) data.quantity = parseFloat(req.body.quantity);
    if (req.body.unit !== undefined) data.unit = req.body.unit;
    if (req.body.lifecycleStage !== undefined) data.lifecycleStage = req.body.lifecycleStage;
    if (req.body.scrapRatePct !== undefined) data.scrapRatePct = parseFloat(req.body.scrapRatePct);
    if (req.body.chosenFactorId !== undefined) data.chosenFactorId = req.body.chosenFactorId || null;

    const updated = await prisma.billOfMaterialsItem.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.delete('/bom-items/:id', async (req, res) => {
  try {
    const item = await prisma.billOfMaterialsItem.findUnique({
      where: { id: req.params.id },
      include: { product: { select: { companyId: true } } },
    });
    if (!item || item.product.companyId !== req.user.companyId) {
      return res.status(404).json({ error: 'BOM item not found.' });
    }
    await prisma.billOfMaterialsItem.delete({ where: { id: req.params.id } });
    res.json({ message: 'BOM item deleted.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Emission Factor search ─────────────────────────────────────────────────

router.get('/factors', async (req, res) => {
  try {
    const { q, materialClass, region, limit } = req.query;
    const where = {};
    if (materialClass) where.materialClass = materialClass;
    if (region) where.region = region;
    if (q) {
      where.OR = [
        { activityName: { contains: q, mode: 'insensitive' } },
        { materialClass: { contains: q, mode: 'insensitive' } },
      ];
    }
    const factors = await prisma.emissionFactor.findMany({
      where,
      orderBy: [{ vintage: 'desc' }, { activityName: 'asc' }],
      take: parseInt(limit) || 20,
    });
    res.json(factors);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
