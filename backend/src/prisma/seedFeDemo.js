'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// seedFeDemo.js — Financed Emissions demo bank with a SYNTHETIC loan book
//
//   node src/prisma/seedFeDemo.js        (npm run db:seed:fe)
//
// Creates (idempotently) a demo bank company with the financed_emissions and
// general modules, a demo admin user, an ILLUSTRATIVE factor set, one
// portfolio with FY2024 (locked) and FY2025 (open) periods holding ~60
// synthetic lines across business loans, CRE and mortgages, then runs a
// calculation for each period.  Every amount, client and factor is made up.
//
// Re-running replaces the demo company's FE data.  Refuses NODE_ENV=production.
//
// Env: FE_DEMO_EMAIL (default bank-demo@triplei.local)
//      FE_DEMO_PASSWORD (required when the demo user is first created)
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const bcrypt = require('bcryptjs');


const prisma = require('../config/prisma');
const { stableIdFor } = require('../services/fe/loanTape');
const runService = require('../services/fe/run');
const { SET, FACTORS } = require('./feDemo/factors');
const { demoBook } = require('./feDemo/generate');

const DEMO_COMPANY = 'Demo Bank (synthetic data)';
const DEMO_PORTFOLIO = 'Main loan book (synthetic)';
const DEFAULT_EMAIL = process.env.FE_DEMO_EMAIL || 'bank-demo@triplei.local';

/**
 * Create or refresh the demo workspace.  Used by the CLI below and by the
 * platform admin "Demo data" action (routes/modules.js).
 * @returns {{ company, email, created }}
 */
async function seedFeDemo({ email = DEFAULT_EMAIL, password = process.env.FE_DEMO_PASSWORD, companyId = null, userId = null, log = console.log } = {}) {
  const DEMO_EMAIL = email;
  let company; let user;
  if (companyId) {
    // Load into an existing organisation (platform admin "into my organisation").
    company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new Error('Organisation not found.');
    user = { id: userId };
  } else {
    company = await prisma.company.findFirst({ where: { name: DEMO_COMPANY } });
    if (!company) {
      company = await prisma.company.create({ data: { name: DEMO_COMPANY, country: 'AM', industry: 'Banking', companySize: '250+', tier: 'PROFESSIONAL' } });
    } else if (company.tier === 'STARTER') {
      company = await prisma.company.update({ where: { id: company.id }, data: { tier: 'PROFESSIONAL' } });
    }
  }
  for (const module of companyId ? ['financed_emissions'] : ['financed_emissions', 'general']) {
    await prisma.companyModule.upsert({
      where: { companyId_module: { companyId: company.id, module } },
      create: { companyId: company.id, module, enabled: true },
      update: { enabled: true, trialEndsAt: null },
    });
  }

  if (!companyId) {
    user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (!user) {
      if (!password) throw new Error('A password is required to create the demo user.');
      user = await prisma.user.create({
        data: {
          email: DEMO_EMAIL, passwordHash: await bcrypt.hash(password, 12),
          firstName: 'Demo', lastName: 'Bank', role: 'ADMIN', isActive: true, emailVerified: true, companyId: company.id,
        },
      });
    } else if (user.companyId !== company.id) {
      throw new Error(`${DEMO_EMAIL} belongs to another company; choose another email.`);
    } else if (password) {
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12), isActive: true } });
    }
  }

  // Replace only the previous demo records (names marked synthetic), so
  // loading into a real organisation never touches its own data.
  const bookForIds = demoBook();
  const demoStableIds = [...new Set(bookForIds.filter((l) => l.counterparty).map((l) => stableIdFor(company.id, l.counterparty.clientId)))];
  await prisma.fePortfolio.deleteMany({ where: { companyId: company.id, name: DEMO_PORTFOLIO } });
  await prisma.feCounterparty.deleteMany({ where: { companyId: company.id, stableId: { in: demoStableIds } } });
  await prisma.feFactorSet.deleteMany({ where: { companyId: company.id, name: SET.name } });
  await prisma.feSectorMap.deleteMany({ where: { companyId: company.id, code: 'AM-HOTEL' } });

  const set = await prisma.feFactorSet.create({ data: { ...SET, companyId: company.id } });
  await prisma.feFactor.createMany({ data: FACTORS.map((f) => ({ ...f, setId: set.id })) });
  await prisma.feSectorMap.create({ data: { companyId: company.id, code: 'AM-HOTEL', factorKey: '55' } });

  const book = demoBook();

  // Counterparties (pseudonymised: only the hash of the synthetic client id).
  const cpIds = new Map();
  for (const l of book) {
    if (!l.counterparty || cpIds.has(l.counterparty.clientId)) continue;
    const { clientId, ...data } = l.counterparty;
    const c = await prisma.feCounterparty.create({ data: { ...data, companyId: company.id, stableId: stableIdFor(company.id, clientId) } });
    cpIds.set(clientId, c.id);
    if (l.emissions && l.emissions.length) {
      await prisma.feCounterpartyEmissions.createMany({ data: l.emissions.map((e) => ({ ...e, counterpartyId: c.id, notes: 'Synthetic demo value' })) });
    }
  }

  const portfolio = await prisma.fePortfolio.create({
    data: {
      companyId: company.id, name: DEMO_PORTFOLIO, legalEntity: 'Demo Bank CJSC (synthetic)', baseCurrency: 'AMD',
      fxSource: 'Central Bank of Armenia (not used: tape in AMD)', assetClasses: ['business_loans', 'commercial_re', 'mortgages'],
    },
  });

  // FY2024 balances were higher (amortisation) — synthetic.
  const periods = [
    { name: 'FY2024', reportingDate: new Date('2024-12-31'), scale: 1.12, lock: true },
    { name: 'FY2025', reportingDate: new Date('2025-12-31'), scale: 1, lock: false },
  ];
  for (const p of periods) {
    const lines = book.map((l) => ({
      ...l.exposure,
      outstanding: Math.round(l.exposure.outstanding * p.scale),
      currency: 'AMD',
      counterpartyId: l.counterparty ? cpIds.get(l.counterparty.clientId) : null,
    }));
    const total = lines.reduce((s, l) => s + Math.max(l.outstanding, 0), 0);
    const period = await prisma.fePeriod.create({
      data: { portfolioId: portfolio.id, name: p.name, reportingDate: p.reportingDate, ledgerTotal: Math.round(total * 1.01) },
    });
    await prisma.feExposure.createMany({ data: lines.map((l) => ({ ...l, periodId: period.id })) });
    const run = await runService.runPeriod({ period, portfolio, companyId: company.id, factorSetId: set.id, userId: user.id });
    if (p.lock) {
      await prisma.fePeriod.update({ where: { id: period.id }, data: { status: 'LOCKED' } });
      await prisma.fePeriodEvent.createMany({
        data: [
          { periodId: period.id, action: 'SUBMIT', fromStatus: 'OPEN', toStatus: 'IN_REVIEW', comment: 'Synthetic demo submission', userId: user.id },
          { periodId: period.id, action: 'APPROVE', fromStatus: 'IN_REVIEW', toStatus: 'LOCKED', comment: 'Synthetic demo approval', userId: user.id },
        ],
      });
    }
    const t = run.totals;
    log(`${p.name}: ${lines.length} lines, ${t.absoluteFinanced} tCO2e (ILLUSTRATIVE), coverage ${t.coveragePct}%, weighted DQ ${t.weightedDq}, ${t.exceptions} exceptions`);
  }
  log(`Demo bank ready. Log in as ${DEMO_EMAIL}.`);
  return { company: company.name, email: companyId ? null : DEMO_EMAIL };
}

module.exports = { seedFeDemo, DEMO_COMPANY };

if (require.main === module) {
  if (process.env.NODE_ENV === 'production') {
    console.error('seedFeDemo: refusing to run from the command line with NODE_ENV=production; use the platform admin "Demo data" action instead.');
    process.exit(1);
  }
  seedFeDemo()
    .catch((err) => { console.error('seedFeDemo failed:', err.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
