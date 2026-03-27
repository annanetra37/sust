const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { deductCredits } = require('../middleware/credits');
const config = require('../config');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'application/zip'];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.use(authenticate);

// ─── Dashboard ──────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  const { companyId } = req.user;
  const { orgUnits, year } = req.query;
  const y = parseInt(year) || new Date().getFullYear();

  const orgFilter = orgUnits ? { orgUnitId: { in: orgUnits.split(',') } } : {};
  const where = { companyId, year: y, ...orgFilter };

  const [activities, inventory, targets, allInventory] = await Promise.all([
    prisma.fE1EmissionActivityData.findMany({ where }),
    prisma.fE1GHGInventory.findMany({ where }),
    prisma.sBTiTarget.findMany({ where: { companyId } }),
    prisma.fE1GHGInventory.findMany({ where: { companyId, ...orgFilter }, orderBy: { year: 'asc' } }),
  ]);

  const totalEmissions = inventory.reduce((s, r) => s + r.totalEmissions, 0);
  const totalEmployees = inventory.reduce((s, r) => s + (r.employeeCount || 0), 0);
  const intensity = totalEmployees > 0 ? (totalEmissions / totalEmployees).toFixed(2) : 0;

  // By scope
  const byScope = {};
  inventory.forEach((r) => { byScope[r.scope] = (byScope[r.scope] || 0) + r.totalEmissions; });

  // By activity
  const byActivity = {};
  activities.forEach((r) => {
    byActivity[r.activityCategory] = (byActivity[r.activityCategory] || 0) + (r.totalEmissions || 0);
  });

  // By org unit
  const byOrgUnit = {};
  inventory.forEach((r) => {
    if (!byOrgUnit[r.orgUnitId]) byOrgUnit[r.orgUnitId] = {};
    byOrgUnit[r.orgUnitId][r.scope] = (byOrgUnit[r.orgUnitId][r.scope] || 0) + r.totalEmissions;
  });

  // Trend
  const emissionsTrend = {};
  allInventory.forEach((r) => {
    if (!emissionsTrend[r.year]) emissionsTrend[r.year] = 0;
    emissionsTrend[r.year] += r.totalEmissions;
  });

  // SBTi progress
  let sbtiProgress = null;
  if (targets.length > 0) {
    const target = targets[0];
    const baseYearEmissions = allInventory
      .filter((r) => r.year === target.baseYear)
      .reduce((s, r) => s + r.totalEmissions, 0);
    const currentEmissions = totalEmissions;
    const targetEmissions = target.reductionPct
      ? baseYearEmissions * (1 - target.reductionPct / 100)
      : target.absoluteTarget || 0;
    const progress = baseYearEmissions > 0
      ? (((baseYearEmissions - currentEmissions) / (baseYearEmissions - targetEmissions)) * 100).toFixed(1)
      : 0;

    sbtiProgress = {
      ...target,
      baseYearEmissions,
      currentEmissions,
      targetEmissions,
      progress: Math.min(100, Math.max(0, parseFloat(progress))),
      onTrack: parseFloat(progress) >= 50,
    };
  }

  res.json({
    stats: { totalEmissions, intensity: parseFloat(intensity), totalEmployees, sbtiProgress },
    charts: {
      byScope: Object.entries(byScope).map(([scope, value]) => ({ scope, value })),
      byActivity: Object.entries(byActivity).map(([activity, value]) => ({ activity, value })),
      byOrgUnit,
      emissionsTrend: Object.entries(emissionsTrend).map(([year, value]) => ({ year: parseInt(year), value })),
    },
    raw: { activities, inventory },
  });
});

// ─── Upload Excel ───────────────────────────────────────────

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { orgUnitId, activityCategory, activitySubcategory, calcMethod } = req.body;
    if (!orgUnitId) return res.status(400).json({ error: 'Org unit required' });

    const orgUnit = await prisma.orgUnit.findFirst({ where: { id: orgUnitId, companyId: req.user.companyId } });
    if (!orgUnit) return res.status(404).json({ error: 'Org unit not found' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

    const uploadRecord = await prisma.uploadHistory.create({
      data: {
        companyId: req.user.companyId, userId: req.user.id,
        fileName: req.file.originalname, fileType: 'E1',
        orgUnit: orgUnit.name, status: 'PROCESSING',
      },
    });

    processE1Excel(workbook, req.user, orgUnitId, uploadRecord.id, { activityCategory, activitySubcategory, calcMethod })
      .catch((err) => {
        console.error('E1 processing error:', err);
        prisma.uploadHistory.update({
          where: { id: uploadRecord.id },
          data: { status: 'FAILED', errorMessage: err.message },
        });
      });

    res.status(202).json({ message: 'Processing started', uploadId: uploadRecord.id });
  } catch (err) {
    console.error('E1 upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

async function processE1Excel(workbook, user, orgUnitId, uploadId, defaults) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);
  const totalRows = data.length;

  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  if (company.creditBalance < totalRows) {
    await prisma.uploadHistory.update({
      where: { id: uploadId },
      data: { status: 'FAILED', errorMessage: `Insufficient credits. Need ${totalRows}, have ${company.creditBalance}` },
    });
    return;
  }

  await prisma.uploadHistory.update({ where: { id: uploadId }, data: { totalRows } });

  let processedRows = 0;

  for (const row of data) {
    try {
      const year = parseInt(row.year || row.Year || new Date().getFullYear());
      const month = row.month || row.Month ? parseInt(row.month || row.Month) : null;
      const quantity = parseFloat(row.quantity || row.Quantity || row.amount || row.Amount || 0);
      const unit = row.unit || row.Unit || 'kWh';
      const scope = row.scope || row.Scope || defaults.activityCategory?.startsWith('Scope') ? defaults.activityCategory : 'Scope 1';

      // Look up emission factor
      let emissionFactor = parseFloat(row.emission_factor || row.emissionFactor || 0);
      let totalEmissions = parseFloat(row.total_emissions || row.totalEmissions || 0);

      if (!totalEmissions && emissionFactor && quantity) {
        totalEmissions = quantity * emissionFactor;
      }

      await prisma.fE1EmissionActivityData.create({
        data: {
          companyId: user.companyId, orgUnitId, year, month,
          activityCategory: row.activity_category || row.activityCategory || defaults.activityCategory || 'Other',
          activitySubcat: row.activity_subcategory || row.activitySubcategory || defaults.activitySubcategory || 'Other',
          calcMethod: row.calc_method || row.calcMethod || defaults.calcMethod || 'consumption',
          quantity, unit, emissionFactor, totalEmissions,
          scope, currency: row.currency || row.Currency || null,
          amount: row.paid_amount || row.paidAmount ? parseFloat(row.paid_amount || row.paidAmount) : null,
          sourceDoc: row.source || row.Source || null,
        },
      });

      processedRows++;
      if (processedRows % 50 === 0) {
        await prisma.uploadHistory.update({ where: { id: uploadId }, data: { processedRows } });
      }
    } catch (err) {
      console.error('E1 row error:', err.message);
    }
  }

  // Aggregate into GHG inventory
  await aggregateGHGInventory(user.companyId, orgUnitId);

  await deductCredits(user.companyId, user.id, totalRows, 'EXCEL_E1', `E1 data upload: ${totalRows} rows`, uploadId);

  await prisma.uploadHistory.update({
    where: { id: uploadId },
    data: { status: 'COMPLETED', processedRows, completedAt: new Date() },
  });
}

async function aggregateGHGInventory(companyId, orgUnitId) {
  const activities = await prisma.fE1EmissionActivityData.findMany({
    where: { companyId, orgUnitId },
  });

  const aggregated = {};
  activities.forEach((a) => {
    const key = `${a.year}-${a.scope}`;
    if (!aggregated[key]) aggregated[key] = { year: a.year, scope: a.scope, total: 0 };
    aggregated[key].total += a.totalEmissions || 0;
  });

  for (const item of Object.values(aggregated)) {
    await prisma.fE1GHGInventory.upsert({
      where: { companyId_orgUnitId_year_scope: { companyId, orgUnitId, year: item.year, scope: item.scope } },
      update: { totalEmissions: item.total },
      create: { companyId, orgUnitId, year: item.year, scope: item.scope, totalEmissions: item.total },
    });
  }
}

// ─── Xapture Document Upload ────────────────────────────────

router.post('/xapture', docUpload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files provided' });

    const { mode, orgUnitId } = req.body; // Travel, Stay, Energy, Company Vehicle
    if (!mode) return res.status(400).json({ error: 'Extraction mode required' });

    const docCount = req.files.length;
    const creditCost = docCount * 2;

    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    if (company.creditBalance < creditCost) {
      return res.status(403).json({
        error: 'Insufficient credits', required: creditCost,
        available: company.creditBalance, costPerDoc: 2, documents: docCount,
      });
    }

    const uploadRecord = await prisma.uploadHistory.create({
      data: {
        companyId: req.user.companyId, userId: req.user.id,
        fileName: `Xapture batch (${docCount} docs)`,
        fileType: 'E1', orgUnit: orgUnitId,
        status: 'PROCESSING', totalRows: docCount,
      },
    });

    // Process with concurrency limit of 3
    processXaptureDocuments(req.files, req.user, orgUnitId, mode, uploadRecord.id)
      .catch((err) => {
        console.error('Xapture error:', err);
        prisma.uploadHistory.update({
          where: { id: uploadRecord.id },
          data: { status: 'FAILED', errorMessage: err.message },
        });
      });

    res.status(202).json({ message: 'Document extraction started', uploadId: uploadRecord.id, documents: docCount });
  } catch (err) {
    console.error('Xapture upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

async function processXaptureDocuments(files, user, orgUnitId, mode, uploadId) {
  const MAX_CONCURRENT = 3;
  let processed = 0;
  const results = [];

  for (let i = 0; i < files.length; i += MAX_CONCURRENT) {
    const batch = files.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.allSettled(
      batch.map((file) => extractDocument(file, mode))
    );

    for (const result of batchResults) {
      processed++;
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);

        // Store extracted data as emission activity
        const data = result.value;
        await prisma.fE1EmissionActivityData.create({
          data: {
            companyId: user.companyId, orgUnitId: orgUnitId || undefined,
            year: new Date().getFullYear(),
            activityCategory: mode,
            activitySubcat: data.subType || mode,
            calcMethod: 'consumption',
            quantity: data.quantity || 0,
            unit: data.unit || 'km',
            totalEmissions: data.emissions || 0,
            scope: data.scope || 'Scope 3',
            currency: data.currency || null,
            amount: data.amount || null,
            sourceDoc: data.sourceFile || null,
          },
        });
      }
      await prisma.uploadHistory.update({ where: { id: uploadId }, data: { processedRows: processed } });
    }
  }

  await deductCredits(user.companyId, user.id, files.length * 2, 'XAPTURE_E1', `Xapture: ${files.length} documents`, uploadId);

  if (orgUnitId) {
    await aggregateGHGInventory(user.companyId, orgUnitId);
  }

  await prisma.uploadHistory.update({
    where: { id: uploadId },
    data: { status: 'COMPLETED', processedRows: processed, completedAt: new Date() },
  });
}

async function extractDocument(file, mode) {
  if (!config.xapture.url) {
    // Dev mock: return simulated extraction
    return {
      sourceFile: file.originalname,
      subType: mode,
      quantity: Math.random() * 1000,
      unit: mode === 'Travel' ? 'km' : mode === 'Energy' ? 'kWh' : 'nights',
      emissions: Math.random() * 50,
      scope: 'Scope 3',
      currency: 'USD',
      amount: Math.random() * 500,
    };
  }

  // Real Xapture API call
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', file.buffer, file.originalname);
  form.append('mode', mode);

  const response = await fetch(config.xapture.url + '/extract', {
    method: 'POST',
    headers: { 'X-API-Key': config.xapture.key, ...form.getHeaders() },
    body: form,
  });

  if (!response.ok) throw new Error(`Xapture API error: ${response.status}`);
  return response.json();
}

// ─── Upload Progress ────────────────────────────────────────

router.get('/upload/:id/progress', async (req, res) => {
  const record = await prisma.uploadHistory.findFirst({
    where: { id: req.params.id, companyId: req.user.companyId },
  });
  if (!record) return res.status(404).json({ error: 'Upload not found' });

  res.json({
    status: record.status,
    totalRows: record.totalRows,
    processedRows: record.processedRows,
    progress: record.totalRows ? Math.round((record.processedRows / record.totalRows) * 100) : 0,
    error: record.errorMessage,
  });
});

// ─── SBTi Targets ───────────────────────────────────────────

router.get('/sbti', async (req, res) => {
  const targets = await prisma.sBTiTarget.findMany({
    where: { companyId: req.user.companyId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(targets);
});

router.post('/sbti', async (req, res) => {
  const { baseYear, targetYear, method, reductionPct, absoluteTarget, scope, description } = req.body;
  if (!baseYear || !targetYear || !method) {
    return res.status(400).json({ error: 'Base year, target year, and method required' });
  }

  const target = await prisma.sBTiTarget.create({
    data: {
      companyId: req.user.companyId,
      baseYear: parseInt(baseYear),
      targetYear: parseInt(targetYear),
      method, reductionPct: reductionPct ? parseFloat(reductionPct) : null,
      absoluteTarget: absoluteTarget ? parseFloat(absoluteTarget) : null,
      scope: scope || 'All', description,
    },
  });
  res.status(201).json(target);
});

router.delete('/sbti/:id', async (req, res) => {
  await prisma.sBTiTarget.deleteMany({ where: { id: req.params.id, companyId: req.user.companyId } });
  res.json({ message: 'Target deleted' });
});

// ─── Activity Categories ────────────────────────────────────

router.get('/categories', async (_, res) => {
  const categories = await prisma.activityCategory.findMany({ include: { subcategories: true } });
  res.json(categories);
});

module.exports = router;
