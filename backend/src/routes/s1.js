const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { deductCredits } = require('../middleware/credits');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticate);

// ─── Dashboard Stats ────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  const { companyId } = req.user;
  const { orgUnits, year } = req.query;
  const y = parseInt(year) || new Date().getFullYear();

  const orgFilter = orgUnits
    ? { orgUnitId: { in: orgUnits.split(',') } }
    : {};

  const where = { companyId, year: y, ...orgFilter };

  const [composition, diversity, training, turnover, injuries] = await Promise.all([
    prisma.fS1WorkforceComposition.findMany({ where }),
    prisma.fS1WorkforceDiversity.findMany({ where }),
    prisma.fS1EmployeeTraining.findMany({ where }),
    prisma.fS1EmployeeTurnover.findMany({ where }),
    prisma.fS1WorkplaceInjuries.findMany({ where }),
  ]);

  // Aggregate stats
  const totalEmployees = composition.reduce((s, r) => s + r.employeeCount, 0);
  const byGender = {};
  composition.forEach((r) => { byGender[r.gender] = (byGender[r.gender] || 0) + r.employeeCount; });

  const totalTrainingHours = training.reduce((s, r) => s + r.trainingHours, 0);
  const totalTurnover = turnover.reduce((s, r) => s + r.count, 0);
  const turnoverRate = totalEmployees > 0 ? ((totalTurnover / totalEmployees) * 100).toFixed(1) : 0;

  const disabilityCount = diversity.filter((r) => r.disabilityStatus === 'Yes').reduce((s, r) => s + r.count, 0);

  // Charts data
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

// ─── Upload Excel ───────────────────────────────────────────

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { orgUnitId } = req.body;
    if (!orgUnitId) return res.status(400).json({ error: 'Org unit required' });

    const orgUnit = await prisma.orgUnit.findFirst({ where: { id: orgUnitId, companyId: req.user.companyId } });
    if (!orgUnit) return res.status(404).json({ error: 'Org unit not found' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

    // Create upload record
    const uploadRecord = await prisma.uploadHistory.create({
      data: {
        companyId: req.user.companyId,
        userId: req.user.id,
        fileName: req.file.originalname,
        fileType: 'S1',
        orgUnit: orgUnit.name,
        status: 'PROCESSING',
      },
    });

    // Process in background
    processS1Excel(workbook, req.user, orgUnitId, uploadRecord.id).catch((err) => {
      console.error('S1 processing error:', err);
      prisma.uploadHistory.update({
        where: { id: uploadRecord.id },
        data: { status: 'FAILED', errorMessage: err.message },
      });
    });

    res.status(202).json({ message: 'Processing started', uploadId: uploadRecord.id });
  } catch (err) {
    console.error('S1 upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

async function processS1Excel(workbook, user, orgUnitId, uploadId) {
  let totalRows = 0;
  let processedRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    totalRows += data.length;
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

  for (const sheetName of workbook.SheetNames) {
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    const normalizedSheet = sheetName.toLowerCase().replace(/\s+/g, '_');

    for (const row of data) {
      try {
        const year = parseInt(row.year || row.Year || new Date().getFullYear());
        const quarter = row.quarter || row.Quarter ? parseInt(row.quarter || row.Quarter) : null;
        const gender = row.gender || row.Gender || 'Not disclosed';

        if (normalizedSheet.includes('composition') || normalizedSheet.includes('workforce')) {
          await prisma.fS1WorkforceComposition.create({
            data: {
              companyId: user.companyId, orgUnitId, year, quarter, gender,
              contractType: row.contract_type || row.contractType || row.ContractType || 'Permanent',
              country: row.country || row.Country || null,
              employeeCount: parseInt(row.count || row.employee_count || row.employeeCount || row.Count || 0),
            },
          });
        } else if (normalizedSheet.includes('diversity')) {
          await prisma.fS1WorkforceDiversity.create({
            data: {
              companyId: user.companyId, orgUnitId, year, quarter, gender,
              disabilityStatus: row.disability_status || row.disabilityStatus || 'Not disclosed',
              disabilityType: row.disability_type || row.disabilityType || null,
              count: parseInt(row.count || row.Count || 0),
            },
          });
        } else if (normalizedSheet.includes('training')) {
          await prisma.fS1EmployeeTraining.create({
            data: {
              companyId: user.companyId, orgUnitId, year, quarter, gender,
              trainingHours: parseFloat(row.training_hours || row.trainingHours || row.hours || 0),
              employeeCount: parseInt(row.count || row.employee_count || row.employeeCount || 0),
            },
          });
        } else if (normalizedSheet.includes('turnover')) {
          await prisma.fS1EmployeeTurnover.create({
            data: {
              companyId: user.companyId, orgUnitId, year, quarter, gender,
              turnoverType: row.turnover_type || row.turnoverType || row.type || 'Voluntary',
              count: parseInt(row.count || row.Count || 0),
            },
          });
        } else if (normalizedSheet.includes('injur')) {
          await prisma.fS1WorkplaceInjuries.create({
            data: {
              companyId: user.companyId, orgUnitId, year, quarter,
              injuryType: row.injury_type || row.injuryType || row.type || 'Other',
              injuryStatus: row.injury_status || row.injuryStatus || row.status || 'Non-fatal',
              gender,
              count: parseInt(row.count || row.Count || 0),
            },
          });
        }

        processedRows++;
        if (processedRows % 50 === 0) {
          await prisma.uploadHistory.update({ where: { id: uploadId }, data: { processedRows } });
        }
      } catch (err) {
        console.error('Row processing error:', err.message);
      }
    }
  }

  await deductCredits(user.companyId, user.id, totalRows, 'EXCEL_S1', `S1 data upload: ${totalRows} rows`, uploadId);

  await prisma.uploadHistory.update({
    where: { id: uploadId },
    data: { status: 'COMPLETED', processedRows, completedAt: new Date() },
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
