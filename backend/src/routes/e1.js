const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { deductCredits } = require('../middleware/credits');
const { mapSchema, cleanAndTransform, validateAndCoerce, extractDocumentWithAI } = require('../services/aiEtl');
const { extractText } = require('../services/docExtract');
const { saveFile, saveFiles } = require('../utils/fileStore');
const { logActivity } = require('../utils/activityLog');

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

  const orgList = orgUnits ? orgUnits.split(',').filter(Boolean) : [];
  const orgFilter = orgList.length > 0 ? { orgUnitId: { in: orgList } } : {};
  const where = { companyId, year: y, ...orgFilter };

  console.log('[E1 Dashboard] Query:', JSON.stringify({ companyId, year: y, orgList: orgList.length || 'ALL' }));

  const [activities, inventory, targets, allActivities] = await Promise.all([
    prisma.fE1EmissionActivityData.findMany({ where }),
    prisma.fE1GHGInventory.findMany({ where }),
    prisma.sBTiTarget.findMany({ where: { companyId } }),
    prisma.fE1EmissionActivityData.findMany({ where: { companyId, ...orgFilter }, orderBy: { year: 'asc' } }),
  ]);

  console.log('[E1 Dashboard] Results:', { activitiesForYear: activities.length, allActivities: allActivities.length, years: [...new Set(allActivities.map(a => a.year))] });
  if (activities.length > 0) {
    console.log('[E1 Dashboard] Sample activity:', JSON.stringify({ year: activities[0].year, scope: activities[0].scope, totalEmissions: activities[0].totalEmissions, category: activities[0].activityCategory }));
  }

  // Compute stats from activity data (source of truth) — not inventory
  const totalEmissions = activities.reduce((s, r) => s + (r.totalEmissions || 0), 0);
  const inventoryEmployees = inventory.reduce((s, r) => s + (r.employeeCount || 0), 0);
  const intensity = inventoryEmployees > 0 ? (totalEmissions / inventoryEmployees).toFixed(2) : 0;

  // By scope — from activity data
  const byScope = {};
  activities.forEach((r) => {
    const scope = r.scope || 'Scope 3';
    byScope[scope] = (byScope[scope] || 0) + (r.totalEmissions || 0);
  });

  // By activity category
  const byActivity = {};
  activities.forEach((r) => {
    const cat = r.activityCategory || 'Other';
    byActivity[cat] = (byActivity[cat] || 0) + (r.totalEmissions || 0);
  });

  // By org unit — from activity data
  const byOrgUnit = {};
  activities.forEach((r) => {
    if (!byOrgUnit[r.orgUnitId]) byOrgUnit[r.orgUnitId] = {};
    const scope = r.scope || 'Scope 3';
    byOrgUnit[r.orgUnitId][scope] = (byOrgUnit[r.orgUnitId][scope] || 0) + (r.totalEmissions || 0);
  });

  // Emissions trend — from all activity data across all years
  const emissionsTrend = {};
  allActivities.forEach((r) => {
    if (!emissionsTrend[r.year]) emissionsTrend[r.year] = 0;
    emissionsTrend[r.year] += r.totalEmissions || 0;
  });

  let sbtiProgress = null;
  if (targets.length > 0) {
    const target = targets[0];
    const baseYearEmissions = allActivities
      .filter((r) => r.year === target.baseYear)
      .reduce((s, r) => s + (r.totalEmissions || 0), 0);
    const currentEmissions = totalEmissions;
    const targetEmissions = target.reductionPct
      ? baseYearEmissions * (1 - target.reductionPct / 100)
      : target.absoluteTarget || 0;
    const progress = baseYearEmissions > 0
      ? (((baseYearEmissions - currentEmissions) / (baseYearEmissions - targetEmissions)) * 100).toFixed(1)
      : 0;

    sbtiProgress = {
      ...target, baseYearEmissions, currentEmissions, targetEmissions,
      progress: Math.min(100, Math.max(0, parseFloat(progress))),
      onTrack: parseFloat(progress) >= 50,
    };
  }

  const round4 = (n) => Math.round(n * 10000) / 10000;

  res.json({
    stats: {
      totalEmissions: round4(totalEmissions),
      intensity: round4(parseFloat(intensity)),
      totalEmployees: inventoryEmployees,
      activityCount: activities.length,
      totalAmount: activities.reduce((s, r) => s + (r.amount || 0), 0),
      sbtiProgress,
    },
    charts: {
      byScope: Object.entries(byScope).map(([scope, value]) => ({ scope, value: Math.round(value * 10000) / 10000 })),
      byActivity: Object.entries(byActivity).map(([activity, value]) => ({ activity, value: Math.round(value * 10000) / 10000 })),
      byOrgUnit,
      emissionsTrend: Object.entries(emissionsTrend).map(([year, value]) => ({ year: parseInt(year), value: Math.round(value * 10000) / 10000 })),
    },
    raw: { activities, inventory },
  });
});

// ─── Upload Excel (AI-Powered ETL) ──────────────────────────

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { orgUnitId, reportingYear } = req.body;
    if (!orgUnitId) return res.status(400).json({ error: 'Org unit required' });
    const year = parseInt(reportingYear) || new Date().getFullYear();

    const orgUnit = await prisma.orgUnit.findFirst({ where: { id: orgUnitId, companyId: req.user.companyId } });
    if (!orgUnit) return res.status(404).json({ error: 'Org unit not found' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

    // Store original file
    const stored = saveFile(req.file, req.user.companyId);

    const uploadRecord = await prisma.uploadHistory.create({
      data: {
        companyId: req.user.companyId, userId: req.user.id,
        fileName: req.file.originalname, fileType: 'E1',
        orgUnit: orgUnit.name, orgUnitId, status: 'PROCESSING',
        ...stored,
      },
    });

    processE1WithAI(workbook, req.user, orgUnitId, uploadRecord.id, year)
      .catch((err) => {
        console.error('E1 AI processing error:', err);
        prisma.uploadHistory.update({
          where: { id: uploadRecord.id },
          data: { status: 'FAILED', errorMessage: err.message },
        });
      });

    logActivity(req.user.id, req.user.companyId, 'UPLOAD_E1', `Uploaded ${req.file.originalname} for ${orgUnit.name} (${year})`, { fileName: req.file.originalname, year }, req.ip);
    res.status(202).json({ message: 'AI processing started', uploadId: uploadRecord.id });
  } catch (err) {
    console.error('E1 upload error:', err);
    const { status, error } = require('../utils/errors').formatError(err);
    res.status(status).json({ error });
  }
});

async function processE1WithAI(workbook, user, orgUnitId, uploadId, reportingYear) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const totalRows = data.length;

  if (totalRows === 0) {
    await prisma.uploadHistory.update({
      where: { id: uploadId },
      data: { status: 'FAILED', errorMessage: 'No data found in file' },
    });
    return;
  }

  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  if (company.creditBalance < totalRows) {
    await prisma.uploadHistory.update({
      where: { id: uploadId },
      data: { status: 'FAILED', errorMessage: `Insufficient credits. Need ${totalRows}, have ${company.creditBalance}` },
    });
    return;
  }

  await prisma.uploadHistory.update({ where: { id: uploadId }, data: { totalRows } });

  const columns = Object.keys(data[0] || {});

  // Step 1: AI Schema Mapping
  const mappingResult = await mapSchema(data, columns, 'E1');

  let insertedRows = 0;
  let processedRows = 0;

  for (const mapping of mappingResult.mappings) {
    if (mapping.confidence < 0.3) continue;

    // Step 2: AI Data Cleaning
    const cleanedRows = await cleanAndTransform(data, mapping, 'E1');

    // Step 3: Validation
    const { valid, invalid } = validateAndCoerce(cleanedRows, mapping.targetTable, 'E1');

    // Step 4: Ingest
    for (const row of valid) {
      try {
        // Look up emission factor from DB if not provided
        let emissionFactor = row.emissionFactor || 0;
        let totalEmissions = row.totalEmissions || 0;

        if (!emissionFactor && row.activitySubcat) {
          const subcat = await prisma.activitySubcategory.findFirst({
            where: { name: { contains: row.activitySubcat, mode: 'insensitive' } },
          });
          if (subcat?.emissionFactor) emissionFactor = subcat.emissionFactor;
        }

        if (!totalEmissions && emissionFactor && row.quantity) {
          totalEmissions = (row.quantity * emissionFactor) / 1000; // kg to tonnes
        }

        await prisma.fE1EmissionActivityData.create({
          data: {
            companyId: user.companyId, orgUnitId,
            year: reportingYear, month: row.month || null,
            activityCategory: row.activityCategory || 'Other',
            activitySubcat: row.activitySubcat || 'Other',
            calcMethod: row.calcMethod || 'consumption',
            quantity: row.quantity || 0,
            unit: row.unit || 'kWh',
            emissionFactor,
            totalEmissions,
            scope: row.scope || 'Scope 1',
            currency: row.currency || null,
            amount: row.amount || null,
          },
        });

        insertedRows++;
      } catch (err) {
        console.error('E1 row insert error:', err.message);
      }

      processedRows++;
      if (processedRows % 25 === 0) {
        await prisma.uploadHistory.update({ where: { id: uploadId }, data: { processedRows } });
      }
    }

    processedRows += invalid.length;
  }

  await aggregateGHGInventory(user.companyId, orgUnitId);
  await deductCredits(user.companyId, user.id, totalRows, 'EXCEL_E1', `E1 AI ETL: ${insertedRows} rows ingested from ${totalRows} raw rows`, uploadId);

  await prisma.uploadHistory.update({
    where: { id: uploadId },
    data: { status: 'COMPLETED', processedRows: totalRows, completedAt: new Date() },
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

// ─── Document Extract (AI-Powered) ──────────────────────────

router.post('/doc-extract', docUpload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files provided' });

    const { mode, orgUnitId, reportingYear: reqYear } = req.body;
    const docYear = parseInt(reqYear) || new Date().getFullYear();
    if (!mode) return res.status(400).json({ error: 'Extraction mode required (Travel, Stay, Energy, Company Vehicle)' });

    const validModes = ['Travel', 'Stay', 'Energy', 'Company Vehicle'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ error: `Invalid mode. Supported: ${validModes.join(', ')}` });
    }

    const docCount = req.files.length;
    const creditCost = docCount * 2;

    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    if (company.creditBalance < creditCost) {
      return res.status(403).json({
        error: 'Insufficient credits', required: creditCost,
        available: company.creditBalance, costPerDoc: 2, documents: docCount,
      });
    }

    // Resolve org unit name for display
    const orgUnit = orgUnitId ? await prisma.orgUnit.findUnique({ where: { id: orgUnitId } }) : null;

    // Store original files
    const storedFiles = saveFiles(req.files, req.user.companyId);
    // Store first file path in upload record; individual file paths are in storedFiles
    const firstFile = storedFiles[0] || {};

    const uploadRecord = await prisma.uploadHistory.create({
      data: {
        companyId: req.user.companyId, userId: req.user.id,
        fileName: `AI Doc Extract — ${mode} (${docCount} files)`,
        fileType: 'E1', orgUnit: orgUnit ? orgUnit.name : orgUnitId, orgUnitId,
        status: 'PROCESSING', totalRows: docCount,
        storedFilePath: storedFiles.map((f) => `${f.originalName}::${f.storedFilePath}`).join('||'),
        storedFileSize: storedFiles.reduce((s, f) => s + (f.storedFileSize || 0), 0),
        storedFileMime: firstFile.storedFileMime,
      },
    });

    processDocumentsWithAI(req.files, req.user, orgUnitId, mode, uploadRecord.id, docYear)
      .catch((err) => {
        console.error('AI doc extract error:', err);
        prisma.uploadHistory.update({
          where: { id: uploadRecord.id },
          data: { status: 'FAILED', errorMessage: err.message },
        });
      });

    logActivity(req.user.id, req.user.companyId, 'DOC_EXTRACT', `Extracted ${docCount} document(s) — ${mode} for ${orgUnit ? orgUnit.name : orgUnitId} (${docYear})`, { mode, docCount, year: docYear }, req.ip);
    res.status(202).json({ message: 'AI document extraction started', uploadId: uploadRecord.id, documents: docCount });
  } catch (err) {
    console.error('Doc extract upload error:', err);
    const { status, error } = require('../utils/errors').formatError(err);
    res.status(status).json({ error });
  }
});

async function processDocumentsWithAI(files, user, orgUnitId, mode, uploadId, reportingYear) {
  const MAX_CONCURRENT = 3;
  let processed = 0;
  let succeeded = 0;

  for (let i = 0; i < files.length; i += MAX_CONCURRENT) {
    const batch = files.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.allSettled(
      batch.map(async (file) => {
        // Step 1: Extract raw text (PDF parse or OCR)
        const rawText = await extractText(file);
        if (!rawText || rawText.trim().length < 10) {
          throw new Error(`No readable text from ${file.originalname}`);
        }
        // Step 2: AI extraction
        return { ...await extractDocumentWithAI(rawText, mode), sourceFile: file.originalname };
      })
    );

    for (const result of batchResults) {
      processed++;

      if (result.status === 'fulfilled' && result.value?.items?.length > 0) {
        const extraction = result.value;

        for (const item of extraction.items) {
          // Accept any item that has meaningful data
          const qty = parseFloat(item.quantity) || 0;
          const amt = parseFloat(item.amount) || 0;
          const ef = parseFloat(item.emissionFactor) || 0;
          // AI may return emissions as 'emissions', 'totalEmissions', or 'tCO2e'
          let ems = parseFloat(item.emissions || item.totalEmissions || item.tCO2e) || 0;
          // If AI didn't calculate emissions but provided quantity + factor, calculate it
          if (ems === 0 && qty > 0 && ef > 0) {
            ems = (qty * ef) / 1000; // kg to tonnes
          }

          console.log('[Doc Extract] Item:', JSON.stringify({ subType: item.subType, qty, ef, ems, amt, scope: item.scope }));

          if (qty > 0 || amt > 0 || ems > 0) {
            const itemMonth = item.date ? new Date(item.date).getMonth() + 1 : null;

            await prisma.fE1EmissionActivityData.create({
              data: {
                companyId: user.companyId,
                orgUnitId,
                year: reportingYear,
                month: itemMonth,
                activityCategory: item.activityCategory || mode,
                activitySubcat: item.subType || mode,
                calcMethod: 'consumption',
                quantity: qty,
                unit: item.unit || (mode === 'Stay' ? 'nights' : mode === 'Energy' ? 'kWh' : 'km'),
                emissionFactor: parseFloat(item.emissionFactor) || 0,
                totalEmissions: ems,
                scope: item.scope || 'Scope 3',
                currency: item.currency || null,
                amount: amt || null,
                sourceDoc: extraction.sourceFile || null,
              },
            });
            succeeded++;
          }
        }
      } else if (result.status === 'rejected') {
        console.error(`AI extraction failed: ${result.reason?.message || result.reason}`);
      }

      await prisma.uploadHistory.update({ where: { id: uploadId }, data: { processedRows: processed } });
    }
  }

  await deductCredits(user.companyId, user.id, files.length * 2, 'DOC_EXTRACT_E1', `AI Doc Extract (${mode}): ${files.length} files, ${succeeded} records`, uploadId);

  if (orgUnitId) {
    await aggregateGHGInventory(user.companyId, orgUnitId);
  }

  await prisma.uploadHistory.update({
    where: { id: uploadId },
    data: { status: 'COMPLETED', processedRows: processed, completedAt: new Date() },
  });
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
      baseYear: parseInt(baseYear), targetYear: parseInt(targetYear),
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

// ─── Debug: Show all raw activity data ──────────────────────

router.get('/debug/data', async (req, res) => {
  const { companyId } = req.user;
  const all = await prisma.fE1EmissionActivityData.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const summary = {
    totalRecords: all.length,
    years: [...new Set(all.map((a) => a.year))],
    orgUnits: [...new Set(all.map((a) => a.orgUnitId))],
    scopes: [...new Set(all.map((a) => a.scope))],
    totalEmissions: all.reduce((s, r) => s + (r.totalEmissions || 0), 0),
    records: all.map((r) => ({
      id: r.id,
      year: r.year,
      month: r.month,
      category: r.activityCategory,
      subcat: r.activitySubcat,
      scope: r.scope,
      qty: r.quantity,
      unit: r.unit,
      ef: r.emissionFactor,
      emissions: r.totalEmissions,
      orgUnit: r.orgUnitId,
      created: r.createdAt,
    })),
  };
  res.json(summary);
});

module.exports = router;
