const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');

router.use(authenticate);

// ─── Org Units ──────────────────────────────────────────────

router.get('/org-units', async (req, res) => {
  try {
    const units = await prisma.orgUnit.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(units);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.post('/org-units', requireAdmin, async (req, res) => {
  try {
    const { name, country } = req.body;
    if (!name || !country) return res.status(400).json({ error: 'Name and country are required to create an org unit.' });

    const existing = await prisma.orgUnit.findFirst({
      where: { name, companyId: req.user.companyId },
    });
    if (existing) return res.status(409).json({ error: `An org unit named "${name}" already exists.` });

    const unit = await prisma.orgUnit.create({
      data: { name, country, companyId: req.user.companyId },
    });
    res.status(201).json(unit);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.delete('/org-units/:id', requireAdmin, async (req, res) => {
  try {
    const result = await prisma.orgUnit.deleteMany({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (result.count === 0) return res.status(404).json({ error: 'Org unit not found.' });
    res.json({ message: 'Org unit deleted successfully.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── ESG Standards ──────────────────────────────────────────

router.get('/esg-standard', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { esgStandard: true },
    });
    res.json({ standard: company.esgStandard });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.put('/esg-standard', requireAdmin, async (req, res) => {
  try {
    const { standard } = req.body;
    const valid = ['ESRS', 'TCFD', 'GRI', 'SASB', 'CDP', 'IFRS_S1', 'IFRS_S2'];
    if (!valid.includes(standard)) {
      return res.status(400).json({ error: `Invalid standard "${standard}". Supported: ${valid.join(', ')}` });
    }

    await prisma.company.update({ where: { id: req.user.companyId }, data: { esgStandard: standard } });
    res.json({ message: `Reporting standard updated to ${standard}.`, standard });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Data Reset Preview ─────────────────────────────────────

router.post('/reset/preview', requireAdmin, async (req, res) => {
  try {
    const { type, year, quarter, orgUnitId } = req.body;
    if (!year) return res.status(400).json({ error: 'Year is required.' });

    const companyId = req.user.companyId;
    const y = parseInt(year);

    if (type === 's1') {
      const where = { companyId, year: y };
      if (quarter) where.quarter = parseInt(quarter);
      if (orgUnitId) where.orgUnitId = orgUnitId;

      const [comp, div, train, turn, inj] = await Promise.all([
        prisma.fS1WorkforceComposition.count({ where }),
        prisma.fS1WorkforceDiversity.count({ where }),
        prisma.fS1EmployeeTraining.count({ where }),
        prisma.fS1EmployeeTurnover.count({ where }),
        prisma.fS1WorkplaceInjuries.count({ where }),
      ]);

      const total = comp + div + train + turn + inj;

      // Get some sample records
      const samples = await prisma.fS1WorkforceComposition.findMany({
        where,
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { orgUnit: { select: { name: true } } },
      });

      res.json({
        total,
        breakdown: [
          { table: 'Workforce Composition', count: comp },
          { table: 'Workforce Diversity', count: div },
          { table: 'Employee Training', count: train },
          { table: 'Employee Turnover', count: turn },
          { table: 'Workplace Injuries', count: inj },
        ].filter((b) => b.count > 0),
        samples: samples.map((s) => ({
          orgUnit: s.orgUnit?.name,
          year: s.year,
          quarter: s.quarter,
          gender: s.gender,
          contractType: s.contractType,
          count: s.employeeCount,
        })),
      });
    } else {
      const where = { companyId, year: y };

      const [activities, inventory] = await Promise.all([
        prisma.fE1EmissionActivityData.count({ where }),
        prisma.fE1GHGInventory.count({ where }),
      ]);

      const total = activities + inventory;

      // Get sample activity records
      const samples = await prisma.fE1EmissionActivityData.findMany({
        where,
        take: 5,
        orderBy: { createdAt: 'desc' },
      });

      // Aggregate emissions that will be lost
      const emissionSum = await prisma.fE1EmissionActivityData.aggregate({
        where,
        _sum: { totalEmissions: true, quantity: true },
      });

      res.json({
        total,
        breakdown: [
          { table: 'Emission Activity Data', count: activities },
          { table: 'GHG Inventory', count: inventory },
        ].filter((b) => b.count > 0),
        samples: samples.map((s) => ({
          category: s.activityCategory,
          subcategory: s.activitySubcat,
          scope: s.scope,
          quantity: s.quantity,
          unit: s.unit,
          emissions: s.totalEmissions,
        })),
        totalEmissions: emissionSum._sum.totalEmissions || 0,
      });
    }
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Data Reset (actual delete) ─────────────────────────────

router.post('/reset/s1', requireAdmin, async (req, res) => {
  try {
    const { year, quarter, orgUnitId } = req.body;
    if (!year) return res.status(400).json({ error: 'Year is required for data reset.' });

    const where = { companyId: req.user.companyId, year: parseInt(year) };
    if (quarter) where.quarter = parseInt(quarter);
    if (orgUnitId) where.orgUnitId = orgUnitId;

    const [c1, c2, c3, c4, c5] = await Promise.all([
      prisma.fS1WorkforceComposition.deleteMany({ where }),
      prisma.fS1WorkforceDiversity.deleteMany({ where }),
      prisma.fS1EmployeeTraining.deleteMany({ where }),
      prisma.fS1EmployeeTurnover.deleteMany({ where }),
      prisma.fS1WorkplaceInjuries.deleteMany({ where }),
    ]);

    const total = c1.count + c2.count + c3.count + c4.count + c5.count;
    const userName = `${req.user.firstName} ${req.user.lastName}`;
    const deletedAt = new Date().toLocaleString();

    // Mark related upload history records as deleted (don't remove them)
    await prisma.uploadHistory.updateMany({
      where: {
        companyId: req.user.companyId,
        fileType: 'S1',
        status: 'COMPLETED',
        ...(orgUnitId ? { orgUnitId } : {}),
      },
      data: {
        status: 'DATA_DELETED',
        errorMessage: `Data deleted by ${userName} on ${deletedAt}. ${total} records removed for year ${year}${quarter ? ' Q' + quarter : ''}${orgUnitId ? ' (specific org unit)' : ''}.`,
      },
    });

    logActivity(req.user.id, req.user.companyId, 'RESET_DATA', `Deleted ${total} S1 records for year ${year}`, { type: 's1', year, total }, req.ip);
    res.json({ message: `Successfully deleted ${total} S1 records for year ${year}.` });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.post('/reset/e1', requireAdmin, async (req, res) => {
  try {
    const { year } = req.body;
    if (!year) return res.status(400).json({ error: 'Year is required for data reset.' });

    const where = { companyId: req.user.companyId, year: parseInt(year) };

    const [c1, c2] = await Promise.all([
      prisma.fE1EmissionActivityData.deleteMany({ where }),
      prisma.fE1GHGInventory.deleteMany({ where }),
    ]);

    const total = c1.count + c2.count;
    const userName = `${req.user.firstName} ${req.user.lastName}`;
    const deletedAt = new Date().toLocaleString();

    // Mark related upload history records as deleted (don't remove them)
    await prisma.uploadHistory.updateMany({
      where: {
        companyId: req.user.companyId,
        fileType: 'E1',
        status: 'COMPLETED',
      },
      data: {
        status: 'DATA_DELETED',
        errorMessage: `Data deleted by ${userName} on ${deletedAt}. ${total} records removed for year ${year}.`,
      },
    });

    logActivity(req.user.id, req.user.companyId, 'RESET_DATA', `Deleted ${total} E1 records for year ${year}`, { type: 'e1', year, total }, req.ip);
    res.json({ message: `Successfully deleted ${total} E1 records for year ${year}.` });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Credit Transactions ────────────────────────────────────

router.get('/credits', async (req, res) => {
  try {
    const { from, to, page, limit } = req.query;

    const where = { companyId: req.user.companyId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [transactions, total, company] = await Promise.all([
      prisma.creditTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: ((parseInt(page) || 1) - 1) * (parseInt(limit) || 20),
        take: parseInt(limit) || 20,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      prisma.creditTransaction.count({ where }),
      prisma.company.findUnique({ where: { id: req.user.companyId }, select: { creditBalance: true } }),
    ]);

    res.json({ transactions, total, balance: company.creditBalance });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Company Profile ────────────────────────────────────────

router.get('/company', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    if (!company) return res.status(404).json({ error: 'Company not found.' });
    res.json(company);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.put('/company', requireAdmin, async (req, res) => {
  try {
    const allowed = ['name', 'country', 'hqLocation', 'industry', 'companySize', 'ownershipType', 'yearEstablished', 'legalStructure', 'regionsOfOp', 'stockExchange', 'tickerSymbol'];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        data[key] = key === 'yearEstablished' ? (req.body[key] ? parseInt(req.body[key]) : null) : (req.body[key] || null);
      }
    }

    const company = await prisma.company.update({ where: { id: req.user.companyId }, data });
    res.json(company);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
