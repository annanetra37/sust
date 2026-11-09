'use strict';

// Enable sector modules for the company of a user (dev / onboarding helper).
//   node src/prisma/enableModules.js <user-email> financed_emissions green_key
require('dotenv').config();
const prisma = require('../config/prisma');
const { MODULE_KEYS } = require('../services/modules');

(async () => {
  const [email, ...keys] = process.argv.slice(2);
  if (!email || !keys.length) throw new Error('Usage: node src/prisma/enableModules.js <email> <module> [module…]');
  const bad = keys.filter((k) => !MODULE_KEYS.includes(k));
  if (bad.length) throw new Error(`Unknown module(s): ${bad.join(', ')}. Known: ${MODULE_KEYS.join(', ')}`);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user ${email}`);
  for (const module of keys) {
    await prisma.companyModule.upsert({
      where: { companyId_module: { companyId: user.companyId, module } },
      create: { companyId: user.companyId, module, enabled: true },
      update: { enabled: true, trialEndsAt: null },
    });
  }
  console.log(`Enabled ${keys.join(', ')} for the company of ${email}.`);
})().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
