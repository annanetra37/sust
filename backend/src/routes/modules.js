'use strict';

// Module Launcher (P-01) and entitlement administration (P-02).

const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const modules = require('../services/modules');

router.use(authenticate);

const sendError = (res, err) => { const { status, error } = formatError(err); res.status(status).json({ error }); };

// Cards for the launcher: entitled modules with a live status line.
router.get('/', async (req, res) => {
  try {
    res.json({
      modules: await modules.launcherCards(req.user.companyId, req.user.email),
      isPlatformAdmin: modules.isPlatformAdmin(req.user.email),
    });
  } catch (err) { sendError(res, err); }
});

// ─── Platform admin: entitlements per tenant ────────────────────────────────

function requirePlatformAdmin(req, res, next) {
  if (!modules.isPlatformAdmin(req.user.email)) return res.status(403).json({ error: 'Platform admin access required.' });
  next();
}

router.get('/admin/companies', requirePlatformAdmin, async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, country: true, tier: true, modules: true },
    });
    res.json({ moduleKeys: modules.MODULE_KEYS, companies });
  } catch (err) { sendError(res, err); }
});

// Body: { modules: { financed_emissions: { enabled, trialEndsAt, limits }, ... } }
router.put('/admin/companies/:id', requirePlatformAdmin, async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) return res.status(404).json({ error: 'Company not found.' });
    const changes = req.body && req.body.modules;
    if (!changes || typeof changes !== 'object') return res.status(400).json({ error: 'Send { modules: { <key>: { enabled } } }.' });
    for (const key of Object.keys(changes)) {
      if (!modules.MODULE_KEYS.includes(key)) return res.status(400).json({ error: `Unknown module ${key}.` });
    }
    const results = [];
    for (const [key, c] of Object.entries(changes)) {
      const trialEndsAt = c.trialEndsAt ? new Date(c.trialEndsAt) : null;
      if (trialEndsAt && isNaN(trialEndsAt)) return res.status(400).json({ error: `Invalid trialEndsAt for ${key}.` });
      const data = { enabled: c.enabled !== false, trialEndsAt, limits: c.limits || null };
      results.push(await prisma.companyModule.upsert({
        where: { companyId_module: { companyId: company.id, module: key } },
        create: { companyId: company.id, module: key, ...data },
        update: data,
      }));
    }
    logActivity(req.user.id, req.user.companyId, 'MODULE_ENTITLEMENT_UPDATE',
      `Updated modules for ${company.name}`, { targetCompanyId: company.id, changes }, req.ip);
    res.json(results);
  } catch (err) { sendError(res, err); }
});

// ─── Platform admin: demo data (no shell access needed) ─────────────────────
//
// Body { target: 'mine' } loads the synthetic demo into the admin's own
// organisation, so one login sees all three modules with data.  Otherwise
// { email?, password } creates/refreshes a separate demo organisation with
// its own login.  Re-running only replaces the records marked "(synthetic)".

const DEMOS = {
  bank: () => require('../prisma/seedFeDemo').seedFeDemo,
  hotels: () => require('../prisma/seedGkDemo').seedGkDemo,
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/admin/demo/:kind', requirePlatformAdmin, async (req, res) => {
  try {
    const kinds = req.params.kind === 'all' ? ['bank', 'hotels'] : [req.params.kind];
    if (kinds.some((k) => !DEMOS[k])) return res.status(404).json({ error: 'Unknown demo. Use bank, hotels or all.' });
    const { email, password, target } = req.body || {};
    const mine = target === 'mine';
    if (!mine) {
      if (kinds.length > 1) return res.status(400).json({ error: 'A separate demo organisation is created one at a time.' });
      if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email for the demo login.' });
      if (!password || String(password).length < 8) return res.status(400).json({ error: 'Choose a demo password of at least 8 characters.' });
    }
    const lines = [];
    const results = [];
    for (const k of kinds) {
      const opts = mine
        ? { companyId: req.user.companyId, userId: req.user.id, log: (m) => lines.push(String(m)) }
        : { email: email || undefined, password: String(password), log: (m) => lines.push(String(m)) };
      results.push({ kind: k, ...(await DEMOS[k]()(opts)) });
    }
    logActivity(req.user.id, req.user.companyId, 'MODULE_DEMO_SEED',
      `Loaded ${kinds.join(' + ')} demo ${mine ? 'into own organisation' : `(${results[0].company})`}`, { kinds, target: mine ? 'mine' : 'separate' }, req.ip);
    res.json({ results, company: results[0].company, email: results[0].email, target: mine ? 'mine' : 'separate', log: lines });
  } catch (err) {
    console.error('[modules] demo seed failed:', err);
    if (/belongs to another company/.test(err.message)) return res.status(409).json({ error: err.message });
    sendError(res, err);
  }
});

module.exports = router;
