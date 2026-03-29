const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { paginate } = require('../utils/helpers');
const { formatError } = require('../utils/errors');

router.use(authenticate);

// List upload history
router.get('/', async (req, res) => {
  try {
    const { fileType, status, search, page, limit } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = { companyId: req.user.companyId };
    if (fileType) where.fileType = fileType;
    if (status) where.status = status;
    if (search) where.fileName = { contains: search, mode: 'insensitive' };

    const [records, total] = await Promise.all([
      prisma.uploadHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      prisma.uploadHistory.count({ where }),
    ]);

    res.json({ records, total, page: Math.floor(skip / take) + 1, totalPages: Math.ceil(total / take) });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// Get detail for a single upload — traceability view
router.get('/:id', async (req, res) => {
  try {
    const record = await prisma.uploadHistory.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!record) return res.status(404).json({ error: 'Upload not found.' });

    // Fetch the actual data records created by this upload
    let transformedData = [];
    let creditTxn = null;

    // Get related emission activity data (by matching sourceDoc or time window)
    if (record.fileType === 'E1') {
      transformedData = await prisma.fE1EmissionActivityData.findMany({
        where: {
          companyId: req.user.companyId,
          createdAt: {
            gte: record.createdAt,
            lte: record.completedAt || new Date(),
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
    } else if (record.fileType === 'S1') {
      // Combine all S1 data types
      const [comp, div, train, turn, inj] = await Promise.all([
        prisma.fS1WorkforceComposition.findMany({ where: { companyId: req.user.companyId, createdAt: { gte: record.createdAt, lte: record.completedAt || new Date() } }, take: 200 }),
        prisma.fS1WorkforceDiversity.findMany({ where: { companyId: req.user.companyId, createdAt: { gte: record.createdAt, lte: record.completedAt || new Date() } }, take: 200 }),
        prisma.fS1EmployeeTraining.findMany({ where: { companyId: req.user.companyId, createdAt: { gte: record.createdAt, lte: record.completedAt || new Date() } }, take: 200 }),
        prisma.fS1EmployeeTurnover.findMany({ where: { companyId: req.user.companyId, createdAt: { gte: record.createdAt, lte: record.completedAt || new Date() } }, take: 200 }),
        prisma.fS1WorkplaceInjuries.findMany({ where: { companyId: req.user.companyId, createdAt: { gte: record.createdAt, lte: record.completedAt || new Date() } }, take: 200 }),
      ]);
      transformedData = [
        ...comp.map((r) => ({ ...r, _table: 'Workforce Composition' })),
        ...div.map((r) => ({ ...r, _table: 'Workforce Diversity' })),
        ...train.map((r) => ({ ...r, _table: 'Employee Training' })),
        ...turn.map((r) => ({ ...r, _table: 'Employee Turnover' })),
        ...inj.map((r) => ({ ...r, _table: 'Workplace Injuries' })),
      ];
    }

    // Get credit transaction
    creditTxn = await prisma.creditTransaction.findFirst({
      where: { relatedFileId: record.id, companyId: req.user.companyId },
    });

    // Resolve org unit name
    let orgUnitName = record.orgUnit;
    if (record.orgUnit && record.orgUnit.match(/^[0-9a-f-]{36}$/i)) {
      const unit = await prisma.orgUnit.findUnique({ where: { id: record.orgUnit } });
      if (unit) orgUnitName = `${unit.name} (${unit.country})`;
    }

    res.json({
      upload: { ...record, orgUnit: orgUnitName },
      transformedData,
      creditTransaction: creditTxn,
      recordCount: transformedData.length,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// Get available years (only years that have data)
router.get('/meta/years', async (req, res) => {
  try {
    const { companyId } = req.user;

    // Get distinct years from both E1 and S1 data
    const [e1Years, s1Years] = await Promise.all([
      prisma.fE1EmissionActivityData.findMany({
        where: { companyId },
        select: { year: true },
        distinct: ['year'],
      }),
      prisma.fS1WorkforceComposition.findMany({
        where: { companyId },
        select: { year: true },
        distinct: ['year'],
      }),
    ]);

    const allYears = [...new Set([...e1Years.map((r) => r.year), ...s1Years.map((r) => r.year)])].sort((a, b) => b - a);

    // If no data yet, return current year as default
    if (allYears.length === 0) allYears.push(new Date().getFullYear());

    res.json(allYears);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
