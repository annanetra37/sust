const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

// ─── Org Units ──────────────────────────────────────────────

router.get('/org-units', async (req, res) => {
  const units = await prisma.orgUnit.findMany({
    where: { companyId: req.user.companyId },
    orderBy: { createdAt: 'asc' },
  });
  res.json(units);
});

router.post('/org-units', requireAdmin, async (req, res) => {
  const { name, country } = req.body;
  if (!name || !country) return res.status(400).json({ error: 'Name and country required' });

  const existing = await prisma.orgUnit.findFirst({
    where: { name, companyId: req.user.companyId },
  });
  if (existing) return res.status(409).json({ error: 'Org unit already exists' });

  const unit = await prisma.orgUnit.create({
    data: { name, country, companyId: req.user.companyId },
  });
  res.status(201).json(unit);
});

router.delete('/org-units/:id', requireAdmin, async (req, res) => {
  await prisma.orgUnit.deleteMany({ where: { id: req.params.id, companyId: req.user.companyId } });
  res.json({ message: 'Org unit deleted' });
});

// ─── ESG Standards ──────────────────────────────────────────

router.get('/esg-standard', async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.user.companyId },
    select: { esgStandard: true },
  });
  res.json({ standard: company.esgStandard });
});

router.put('/esg-standard', requireAdmin, async (req, res) => {
  const { standard } = req.body;
  const valid = ['ESRS', 'TCFD', 'GRI', 'SASB', 'CDP', 'IFRS_S1', 'IFRS_S2'];
  if (!valid.includes(standard)) return res.status(400).json({ error: 'Invalid standard' });

  await prisma.company.update({ where: { id: req.user.companyId }, data: { esgStandard: standard } });
  res.json({ message: 'Standard updated', standard });
});

// ─── Data Reset ─────────────────────────────────────────────

router.post('/reset/s1', requireAdmin, async (req, res) => {
  const { year, quarter, orgUnitId } = req.body;
  if (!year) return res.status(400).json({ error: 'Year required' });

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
  res.json({ message: `Deleted ${total} S1 records` });
});

router.post('/reset/e1', requireAdmin, async (req, res) => {
  const { year } = req.body;
  if (!year) return res.status(400).json({ error: 'Year required' });

  const where = { companyId: req.user.companyId, year: parseInt(year) };

  const [c1, c2] = await Promise.all([
    prisma.fE1EmissionActivityData.deleteMany({ where }),
    prisma.fE1GHGInventory.deleteMany({ where }),
  ]);

  res.json({ message: `Deleted ${c1.count + c2.count} E1 records` });
});

// ─── Credit Transactions ────────────────────────────────────

router.get('/credits', async (req, res) => {
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
});

// ─── Company Profile ────────────────────────────────────────

router.get('/company', async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
  res.json(company);
});

router.put('/company', requireAdmin, async (req, res) => {
  const allowed = ['name', 'country', 'hqLocation', 'industry', 'companySize', 'ownershipType', 'yearEstablished', 'legalStructure', 'regionsOfOp', 'stockExchange', 'tickerSymbol'];
  const data = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) data[key] = req.body[key];
  }

  const company = await prisma.company.update({ where: { id: req.user.companyId }, data });
  res.json(company);
});

module.exports = router;
