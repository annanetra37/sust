'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// modules.js — Module Launcher registry and per-tenant entitlements (P-01/P-02)
//
// A tenant can enter General ESG, Financed Emissions and/or Green Key.
// General ESG is on unless a CompanyModule row disables it; the sector modules
// need an enabled row whose trial (if any) has not ended.  Platform admins
// (Triple i staff) are listed in PLATFORM_ADMIN_EMAILS and may change
// entitlements for any tenant.
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/prisma');

const MODULES = {
  general: { key: 'general', name: 'General ESG', home: '/' },
  financed_emissions: { key: 'financed_emissions', name: 'Financed Emissions', home: '/fe' },
  green_key: { key: 'green_key', name: 'Green Key Readiness', home: '/gk' },
};
const MODULE_KEYS = Object.keys(MODULES);

function isPlatformAdmin(email) {
  const list = String(process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(String(email).toLowerCase());
}

function isActive(row, now = new Date()) {
  return !!row && row.enabled && (!row.trialEndsAt || new Date(row.trialEndsAt) > now);
}

/**
 * Entitled module keys, in launcher order.  Platform admins (Triple i staff)
 * always get every module in their own organisation, so one login can use
 * General ESG, Financed Emissions and Green Key.
 */
async function entitledModules(companyId, email) {
  if (isPlatformAdmin(email)) return [...MODULE_KEYS];
  const rows = await prisma.companyModule.findMany({ where: { companyId } });
  const byKey = Object.fromEntries(rows.map((r) => [r.module, r]));
  return MODULE_KEYS.filter((k) => (k === 'general' ? (!byKey.general || isActive(byKey.general)) : isActive(byKey[k])));
}

async function hasModule(companyId, moduleKey, email) {
  return (await entitledModules(companyId, email)).includes(moduleKey);
}

// ─── Live status lines for the launcher cards ───────────────────────────────

async function statusGeneral(companyId) {
  const [activities, units] = await Promise.all([
    prisma.fE1EmissionActivityData.count({ where: { companyId } }),
    prisma.orgUnit.count({ where: { companyId } }),
  ]);
  return { units, activities };
}

async function statusFinanced(companyId) {
  const period = await prisma.fePeriod.findFirst({
    where: { portfolio: { companyId } },
    orderBy: { reportingDate: 'desc' },
    include: { portfolio: { select: { name: true } } },
  });
  if (!period) return { period: null };
  const totalAgg = await prisma.feExposure.aggregate({ where: { periodId: period.id }, _sum: { outstanding: true }, _count: true });
  const run = await prisma.feCalcRun.findFirst({ where: { periodId: period.id, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } });
  const coverage = run && run.totals && typeof run.totals.coveragePct === 'number' ? run.totals.coveragePct : null;
  return {
    period: period.name,
    portfolio: period.portfolio.name,
    status: period.status,
    exposures: totalAgg._count,
    coveragePct: coverage,
  };
}

async function statusGreenKey(companyId) {
  const establishments = await prisma.gkEstablishment.count({ where: { client: { companyId } } });
  const nextExpiry = await prisma.gkCertification.findFirst({
    where: { establishment: { client: { companyId } }, status: 'certified', validTo: { gte: new Date() } },
    orderBy: { validTo: 'asc' },
    select: { validTo: true },
  });
  return { establishments, nextExpiry: nextExpiry ? nextExpiry.validTo : null };
}

const STATUS = { general: statusGeneral, financed_emissions: statusFinanced, green_key: statusGreenKey };

async function launcherCards(companyId, email) {
  const keys = await entitledModules(companyId, email);
  return Promise.all(keys.map(async (k) => {
    let status = null;
    try { status = await STATUS[k](companyId); } catch (err) { console.error(`[modules] status ${k}:`, err.message); }
    return { ...MODULES[k], status };
  }));
}

module.exports = { MODULES, MODULE_KEYS, isPlatformAdmin, entitledModules, hasModule, launcherCards };
