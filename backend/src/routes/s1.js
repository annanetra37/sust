const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { deductCredits } = require('../middleware/credits');
const { mapSchema, cleanAndTransform, validateAndCoerce } = require('../services/aiEtl');
const { saveFile } = require('../utils/fileStore');
const { logActivity } = require('../utils/activityLog');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticate);

// ─── Dashboard Stats ────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  const { companyId } = req.user;
  const { orgUnits, year } = req.query;
  const y = parseInt(year) || new Date().getFullYear();

  const orgList = orgUnits ? orgUnits.split(',').filter(Boolean) : [];
  const orgFilter = orgList.length > 0 ? { orgUnitId: { in: orgList } } : {};
  const where = { companyId, year: y, ...orgFilter };

  console.log('[S1 Dashboard] Query:', JSON.stringify({ companyId, year: y, orgList: orgList.length || 'ALL' }));

  const [composition, diversity, training, turnover, injuries] = await Promise.all([
    prisma.fS1WorkforceComposition.findMany({ where }),
    prisma.fS1WorkforceDiversity.findMany({ where }),
    prisma.fS1EmployeeTraining.findMany({ where }),
    prisma.fS1EmployeeTurnover.findMany({ where }),
    prisma.fS1WorkplaceInjuries.findMany({ where }),
  ]);

  const totalEmployees = composition.reduce((s, r) => s + r.employeeCount, 0);
  const byGender = {};
  composition.forEach((r) => { byGender[r.gender] = (byGender[r.gender] || 0) + r.employeeCount; });

  const totalTrainingHours = training.reduce((s, r) => s + r.trainingHours, 0);
  const totalTurnover = turnover.reduce((s, r) => s + r.count, 0);
  const turnoverRate = totalEmployees > 0 ? ((totalTurnover / totalEmployees) * 100).toFixed(1) : 0;
  const disabilityCount = diversity.filter((r) => r.disabilityStatus === 'Yes').reduce((s, r) => s + r.count, 0);

  const turnoverByOrgUnit = {};
  turnover.forEach((r) => {
    const key = r.orgUnitId;
    if (!turnoverByOrgUnit[key]) turnoverByOrgUnit[key] = { voluntary: 0, involuntary: 0 };
    turnoverByOrgUnit[key][r.turnoverType.toLowerCase()] += r.count;
  });

  const trainingByGender = {};
  training.forEach((r) => {
    trainingByGender[r.gender] = (trainingByGender[r.gender] || 0) + r.trainingHours;
  });

  const diversityByGender = {};
  diversity.forEach((r) => {
    if (!diversityByGender[r.gender]) diversityByGender[r.gender] = { withDisability: 0, without: 0 };
    if (r.disabilityStatus === 'Yes') diversityByGender[r.gender].withDisability += r.count;
    else diversityByGender[r.gender].without += r.count;
  });

  res.json({
    stats: { totalEmployees, byGender, totalTrainingHours, totalTurnover, turnoverRate: parseFloat(turnoverRate), disabilityCount },
    charts: {
      employeesByGender: Object.entries(byGender).map(([gender, count]) => ({ gender, count })),
      turnoverByOrgUnit,
      trainingByGender: Object.entries(trainingByGender).map(([gender, hours]) => ({ gender, hours })),
      diversityByGender: Object.entries(diversityByGender).map(([gender, data]) => ({ gender, ...data })),
      injuries: injuries.map((i) => ({ type: i.injuryType, status: i.injuryStatus, count: i.count })),
    },
    raw: { composition, diversity, training, turnover, injuries },
  });
});

// ─── Upload (AI-Powered ETL) ────────────────────────────────

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
        companyId: req.user.companyId,
        userId: req.user.id,
        fileName: req.file.originalname,
        fileType: 'S1',
        orgUnit: orgUnit.name, orgUnitId,
        status: 'PROCESSING',
        ...stored,
      },
    });

    processS1WithAI(workbook, req.user, orgUnitId, uploadRecord.id, year).catch((err) => {
      console.error('S1 AI processing error:', err);
      prisma.uploadHistory.update({
        where: { id: uploadRecord.id },
        data: { status: 'FAILED', errorMessage: err.message },
      });
    });

    logActivity(req.user.id, req.user.companyId, 'UPLOAD_S1', `Uploaded ${req.file.originalname} for ${orgUnit.name} (${year})`, { fileName: req.file.originalname, orgUnit: orgUnit.name, year }, req.ip);
    res.status(202).json({ message: 'AI processing started', uploadId: uploadRecord.id });
  } catch (err) {
    console.error('S1 upload error:', err);
    const { status, error } = require('../utils/errors').formatError(err);
    res.status(status).json({ error });
  }
});

async function processS1WithAI(workbook, user, orgUnitId, uploadId, reportingYear) {
  let totalRows = 0;
  let processedRows = 0;
  let insertedRows = 0;

  // Collect all data from all sheets
  const allSheetData = [];
  for (const sheetName of workbook.SheetNames) {
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    if (data.length > 0) {
      allSheetData.push({ sheetName, data });
      totalRows += data.length;
    }
  }

  if (totalRows === 0) {
    await prisma.uploadHistory.update({
      where: { id: uploadId },
      data: { status: 'FAILED', errorMessage: 'No data found in file' },
    });
    return;
  }

  // Check credits
  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  if (company.creditBalance < totalRows) {
    await prisma.uploadHistory.update({
      where: { id: uploadId },
      data: { status: 'FAILED', errorMessage: `Insufficient credits. Need ${totalRows}, have ${company.creditBalance}` },
    });
    return;
  }

  await prisma.uploadHistory.update({ where: { id: uploadId }, data: { totalRows } });

  // Process each sheet through the AI ETL pipeline
  for (const { sheetName, data } of allSheetData) {
    try {
      const columns = Object.keys(data[0] || {});

      // Step 1: AI Schema Mapping
      const mappingResult = await mapSchema(data, columns, 'S1');

      // Step 2+3: For each mapping, clean and ingest
      for (const mapping of mappingResult.mappings) {
        if (mapping.confidence < 0.3) continue; // skip very low confidence mappings

        // Step 2: AI Data Cleaning
        const cleanedRows = await cleanAndTransform(data, mapping, 'S1');

        // Step 3: Validation
        const { valid, invalid } = validateAndCoerce(cleanedRows, mapping.targetTable, 'S1');

        if (invalid.length > 0) {
          console.warn(`S1 ${sheetName}: ${invalid.length} rows failed validation`);
        }

        // Step 4: Ingest into correct table
        for (const row of valid) {
          try {
            const base = { companyId: user.companyId, orgUnitId };

            switch (mapping.targetTable) {
              case 'workforce_composition':
                await prisma.fS1WorkforceComposition.create({
                  data: {
                    ...base,
                    year: reportingYear, quarter: row.quarter || null,
                    gender: row.gender, contractType: row.contractType,
                    country: row.country || null,
                    employeeCount: row.employeeCount,
                  },
                });
                break;

              case 'workforce_diversity':
                await prisma.fS1WorkforceDiversity.create({
                  data: {
                    ...base,
                    year: reportingYear, quarter: row.quarter || null,
                    gender: row.gender,
                    disabilityStatus: row.disabilityStatus,
                    disabilityType: row.disabilityType || null,
                    count: row.count,
                  },
                });
                break;

              case 'employee_training':
                await prisma.fS1EmployeeTraining.create({
                  data: {
                    ...base,
                    year: reportingYear, quarter: row.quarter || null,
                    gender: row.gender,
                    trainingHours: row.trainingHours,
                    employeeCount: row.employeeCount,
                  },
                });
                break;

              case 'employee_turnover':
                await prisma.fS1EmployeeTurnover.create({
                  data: {
                    ...base,
                    year: reportingYear, quarter: row.quarter || null,
                    gender: row.gender,
                    turnoverType: row.turnoverType,
                    count: row.count,
                  },
                });
                break;

              case 'workplace_injuries':
                await prisma.fS1WorkplaceInjuries.create({
                  data: {
                    ...base,
                    year: reportingYear, quarter: row.quarter || null,
                    injuryType: row.injuryType,
                    injuryStatus: row.injuryStatus,
                    gender: row.gender || null,
                    count: row.count,
                  },
                });
                break;
            }

            insertedRows++;
          } catch (err) {
            console.error('Row insert error:', err.message);
          }

          processedRows++;
          if (processedRows % 25 === 0) {
            await prisma.uploadHistory.update({ where: { id: uploadId }, data: { processedRows } });
          }
        }

        // Count skipped rows towards processed
        processedRows += invalid.length;
      }
    } catch (err) {
      console.error(`Sheet "${sheetName}" processing error:`, err.message);
      processedRows += data.length;
    }
  }

  await deductCredits(user.companyId, user.id, totalRows, 'EXCEL_S1', `S1 AI ETL: ${insertedRows} rows ingested from ${totalRows} raw rows`, uploadId);

  await prisma.uploadHistory.update({
    where: { id: uploadId },
    data: { status: 'COMPLETED', processedRows: totalRows, completedAt: new Date() },
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

module.exports = router;
