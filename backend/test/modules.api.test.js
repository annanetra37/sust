'use strict';

// Module Launcher and entitlements (P-01 / P-02).
// Needs a database: DATABASE_URL=postgresql://… npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const skip = !process.env.DATABASE_URL && 'DATABASE_URL not set';

let prisma; let server; let base;
const tokens = {};
const companies = {};
const emails = {};

async function call(who, method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

before(async () => {
  if (skip) return;
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const config = require('../src/config');
  const { authenticate } = require('../src/middleware/auth');
  const { requireModule } = require('../src/middleware/module');
  prisma = require('../src/config/prisma');

  const stamp = Date.now();
  emails.admin = `platform-admin-${stamp}@test.local`;
  process.env.PLATFORM_ADMIN_EMAILS = `someone@else.test, ${emails.admin.toUpperCase()}`;

  const app = express();
  app.use(express.json());
  app.use('/api/modules', require('../src/routes/modules'));
  // A probe router behind each module gate.
  for (const key of ['financed_emissions', 'green_key', 'general']) {
    app.get(`/api/probe/${key}`, authenticate, requireModule(key), (_req, res) => res.json({ ok: true }));
  }
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;

  for (const key of ['bank', 'hotel', 'admin']) {
    const company = await prisma.company.create({ data: { name: `Modules test ${key} ${stamp}`, country: 'AM', industry: 'Test', companySize: '1-50' } });
    const user = await prisma.user.create({
      data: { email: emails[key] || `modules-${key}-${stamp}@test.local`, passwordHash: 'x', firstName: 'T', lastName: key, role: 'ADMIN', isActive: true, emailVerified: true, companyId: company.id },
    });
    companies[key] = company;
    tokens[key] = jwt.sign({ userId: user.id }, config.jwt.secret, { expiresIn: '1h' });
  }
});

after(async () => {
  if (skip) return;
  server.close();
  const ids = Object.values(companies).map((c) => c.id);
  await prisma.activityLog.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

test('a tenant with no entitlement rows only has General ESG', { skip }, async () => {
  const r = await call('bank', 'GET', '/modules');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.modules.map((m) => m.key), ['general']);
  assert.equal(r.body.isPlatformAdmin, false);
  assert.equal((await call('bank', 'GET', '/probe/financed_emissions')).status, 403);
  assert.equal((await call('bank', 'GET', '/probe/financed_emissions')).body.error, 'MODULE_NOT_ENABLED');
  assert.equal((await call('bank', 'GET', '/probe/general')).status, 200);
});

test('only platform admins can change entitlements, and changes are logged', { skip }, async () => {
  const denied = await call('bank', 'PUT', `/modules/admin/companies/${companies.bank.id}`, { modules: { financed_emissions: { enabled: true } } });
  assert.equal(denied.status, 403);
  assert.equal((await call('bank', 'GET', '/modules/admin/companies')).status, 403);

  const me = await call('admin', 'GET', '/modules');
  assert.equal(me.body.isPlatformAdmin, true); // email list is case-insensitive

  const ok = await call('admin', 'PUT', `/modules/admin/companies/${companies.bank.id}`, { modules: { financed_emissions: { enabled: true } } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const bank = await call('bank', 'GET', '/modules');
  assert.deepEqual(bank.body.modules.map((m) => m.key), ['general', 'financed_emissions']);
  assert.equal((await call('bank', 'GET', '/probe/financed_emissions')).status, 200);
  assert.equal((await call('bank', 'GET', '/probe/green_key')).status, 403);

  const log = await prisma.activityLog.findFirst({ where: { companyId: companies.admin.id, action: 'MODULE_ENTITLEMENT_UPDATE' } });
  assert.equal(log.metadata.targetCompanyId, companies.bank.id);

  assert.equal((await call('admin', 'PUT', `/modules/admin/companies/${companies.bank.id}`, { modules: { crypto: { enabled: true } } })).status, 400);
  assert.equal((await call('admin', 'PUT', '/modules/admin/companies/00000000-0000-0000-0000-000000000000', { modules: { green_key: {} } })).status, 404);
});

test('a hotel tenant can have Green Key without General ESG', { skip }, async () => {
  await call('admin', 'PUT', `/modules/admin/companies/${companies.hotel.id}`, { modules: { green_key: { enabled: true }, general: { enabled: false } } });
  const r = await call('hotel', 'GET', '/modules');
  assert.deepEqual(r.body.modules.map((m) => m.key), ['green_key']);
  assert.equal(r.body.modules[0].home, '/gk');
  assert.equal(r.body.modules[0].status.establishments, 0);
  assert.equal((await call('hotel', 'GET', '/probe/general')).status, 403);
});

test('an ended trial switches the module off', { skip }, async () => {
  await call('admin', 'PUT', `/modules/admin/companies/${companies.bank.id}`, { modules: { green_key: { enabled: true, trialEndsAt: '2020-01-01' } } });
  assert.equal((await call('bank', 'GET', '/probe/green_key')).status, 403);
  const future = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10);
  await call('admin', 'PUT', `/modules/admin/companies/${companies.bank.id}`, { modules: { green_key: { enabled: true, trialEndsAt: future } } });
  assert.equal((await call('bank', 'GET', '/probe/green_key')).status, 200);
  assert.equal((await call('admin', 'PUT', `/modules/admin/companies/${companies.bank.id}`, { modules: { green_key: { trialEndsAt: 'soon' } } })).status, 400);
});

test('launcher status line reports the latest period and coverage', { skip }, async () => {
  const p = await prisma.fePortfolio.create({ data: { companyId: companies.bank.id, name: 'Corporate book' } });
  const period = await prisma.fePeriod.create({ data: { portfolioId: p.id, name: 'FY2025', reportingDate: new Date('2025-12-31') } });
  await prisma.feCalcRun.create({ data: { periodId: period.id, methodologyVersion: 't', inputsHash: 'h', createdById: 'u', totals: { coveragePct: 72.4 } } });
  const r = await call('bank', 'GET', '/modules');
  const fe = r.body.modules.find((m) => m.key === 'financed_emissions');
  assert.equal(fe.status.period, 'FY2025');
  assert.equal(fe.status.coveragePct, 72.4);
});
