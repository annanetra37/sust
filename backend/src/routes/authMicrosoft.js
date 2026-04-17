'use strict';

// backend/src/routes/authMicrosoft.js
// Microsoft Entra ID (Azure AD) SSO routes.
//
//   GET  /api/auth/microsoft/login      — start the OIDC auth-code flow
//   GET  /api/auth/microsoft/callback   — Microsoft redirects back here
//   GET  /api/auth/microsoft/config     — "does this email have SSO?" probe
//   GET  /api/auth/microsoft/settings   — admin: read company SSO config
//   PUT  /api/auth/microsoft/settings   — admin: update company SSO config
//
// Login flow (high-level):
//   1. Frontend Login page optionally hits /config?email=... to decide
//      whether to show the "Sign in with Microsoft" button.
//   2. Clicking the button navigates to /login?email=... which redirects
//      the browser to Microsoft with an anti-CSRF `state` token.
//   3. Microsoft sends the user back to /callback?code=...&state=...
//   4. We validate state, exchange the code, find-or-create the user,
//      issue our own JWTs, and 302 to FRONTEND_URL/auth/microsoft/complete
//      with the tokens in the URL fragment (so they never hit the server
//      logs).
//   5. MicrosoftAuthComplete.jsx parses the fragment, stores the tokens,
//      and redirects to /.

const router = require('express').Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/prisma');
const microsoftSso = require('../services/microsoftSso');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireFeature } = require('../middleware/tier');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');

// ─── Anti-CSRF state store ─────────────────────────────────────────
// Keep pending `state` values in-process with a 10-minute TTL.  Replace
// with Redis when the backend scales past one instance.
const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map();

function rememberState(state, payload) {
  pendingStates.set(state, { payload, expires: Date.now() + STATE_TTL_MS });
  // Opportunistic cleanup.
  if (pendingStates.size > 500) {
    const now = Date.now();
    for (const [k, v] of pendingStates) if (v.expires < now) pendingStates.delete(k);
  }
}

function consumeState(state) {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state);
  if (entry.expires < Date.now()) return null;
  return entry.payload;
}

function frontendUrl() {
  // FRONTEND_URL may be a comma-separated list for CORS; the first one is
  // the canonical origin we redirect to.
  const raw = config.frontend.url || '';
  return raw.split(',')[0].trim() || 'http://localhost:5173';
}

function frontendRedirect(params) {
  // Tokens go in the URL fragment so they never appear in server logs
  // or the Referer header.  Errors go in the query string so they're
  // easy to surface in the UI.
  const base = `${frontendUrl()}/auth/microsoft/complete`;
  if (params.error) {
    const qs = new URLSearchParams({ error: params.error }).toString();
    return `${base}?${qs}`;
  }
  const frag = new URLSearchParams({
    access_token:  params.accessToken,
    refresh_token: params.refreshToken,
  }).toString();
  return `${base}#${frag}`;
}

// ─── GET /login ────────────────────────────────────────────────────
// Kick off the OIDC flow.  Accepts ?email= so we can pre-fill the MS
// login page with a login_hint.
router.get('/login', async (req, res) => {
  try {
    if (!microsoftSso.isConfigured()) {
      return res.status(503).json({
        error: 'Microsoft SSO is not configured on this server. Contact your administrator.',
      });
    }
    const state = crypto.randomBytes(24).toString('hex');
    rememberState(state, { email: (req.query.email || '').toString().toLowerCase() });
    const url = await microsoftSso.getAuthUrl({ state, loginHint: req.query.email });
    res.redirect(url);
  } catch (err) {
    console.error('[auth/microsoft] /login error:', err);
    res.redirect(frontendRedirect({ error: 'sso_init_failed' }));
  }
});

// ─── GET /callback ─────────────────────────────────────────────────
// Microsoft redirects back here with ?code= and ?state=.  We finish the
// auth-code flow, find-or-create the user, and hand off to the frontend.
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    if (error) {
      console.warn('[auth/microsoft] Microsoft returned error:', error, error_description);
      return res.redirect(frontendRedirect({ error: String(error) }));
    }
    if (!code || !state) {
      return res.redirect(frontendRedirect({ error: 'missing_code_or_state' }));
    }
    const statePayload = consumeState(state);
    if (!statePayload) {
      return res.redirect(frontendRedirect({ error: 'invalid_or_expired_state' }));
    }

    const authResult = await microsoftSso.exchangeCode(code);
    const identity = await microsoftSso.extractIdentity(authResult);

    if (!identity.email || !identity.azureOid) {
      return res.redirect(frontendRedirect({ error: 'incomplete_identity' }));
    }

    // ─── Find-or-provision user ────────────────────────────────────
    // Three cases:
    //   (a) We already linked this azureOid to a user → log them in.
    //   (b) Email matches an existing user → link azureOid onto it.
    //   (c) New email → auto-provision ONLY if a company in our DB has
    //       enabled SSO for the matching Entra tenant.  Otherwise we
    //       refuse — we don't create tenants implicitly from SSO.
    let user = await prisma.user.findUnique({
      where: { azureOid: identity.azureOid },
      include: { company: true },
    });

    if (!user) {
      const existingByEmail = await prisma.user.findUnique({
        where: { email: identity.email },
        include: { company: true },
      });

      if (existingByEmail) {
        user = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            azureOid: identity.azureOid,
            ssoProvider: 'microsoft',
            emailVerified: true,
            isActive: existingByEmail.isActive || true,
          },
          include: { company: true },
        });
      } else {
        // Case (c): auto-provision against an SSO-enabled company whose
        // msEntraTenantId matches the token's `tid`.
        const company = await prisma.company.findFirst({
          where: {
            ssoEnabled: true,
            ssoProvider: 'microsoft',
            msEntraTenantId: identity.tenantId,
          },
        });
        if (!company) {
          return res.redirect(frontendRedirect({ error: 'sso_tenant_not_configured' }));
        }
        user = await prisma.user.create({
          data: {
            email:         identity.email,
            passwordHash:  '', // SSO-only account; cannot password-login
            firstName:     identity.firstName || identity.email.split('@')[0],
            lastName:      identity.lastName  || '',
            role:          'CUSTOM',
            isActive:      true,
            emailVerified: true,
            azureOid:      identity.azureOid,
            ssoProvider:   'microsoft',
            companyId:     company.id,
          },
          include: { company: true },
        });
      }
    }

    // If the company has SSO enabled but bound to a different Entra
    // tenant, refuse — prevents a user from company A authenticating
    // into tenant B.
    if (user.company.ssoEnabled && user.company.msEntraTenantId && user.company.msEntraTenantId !== identity.tenantId) {
      return res.redirect(frontendRedirect({ error: 'sso_tenant_mismatch' }));
    }

    // ─── Issue our own JWTs ────────────────────────────────────────
    const accessToken = jwt.sign(
      { userId: user.id, companyId: user.companyId, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.accessExpiry },
    );
    const refreshToken = jwt.sign(
      { userId: user.id },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiry },
    );
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    try { logActivity(user.id, user.companyId, 'LOGIN_SSO', 'Signed in via Microsoft', { provider: 'microsoft' }, req.ip); } catch {}

    res.redirect(frontendRedirect({ accessToken, refreshToken }));
  } catch (err) {
    console.error('[auth/microsoft] /callback error:', err);
    res.redirect(frontendRedirect({ error: 'sso_callback_failed' }));
  }
});

// ─── GET /config ───────────────────────────────────────────────────
// Cheap, unauthenticated probe the Login page uses to decide whether
// to show the "Sign in with Microsoft" button.  Returns only a boolean
// (plus the provider key for future multi-IdP support) — never reveals
// the Entra tenant id to the outside world.
router.get('/config', async (req, res) => {
  try {
    const email = (req.query.email || '').toString().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.json({ ssoEnabled: false });
    }
    const domain = email.split('@')[1];
    if (!domain) return res.json({ ssoEnabled: false });

    // Find any SSO-enabled company that has a user with this email
    // domain.  We match by user email domain so customers don't have
    // to explicitly list every accepted domain.
    const companies = await prisma.company.findMany({
      where: { ssoEnabled: true, ssoProvider: 'microsoft' },
      select: {
        id: true,
        users: { where: { email: { endsWith: `@${domain}` } }, select: { id: true }, take: 1 },
      },
    });
    const match = companies.find((c) => c.users.length > 0);

    res.json({
      ssoEnabled: !!match,
      provider: match ? 'microsoft' : null,
      serverConfigured: microsoftSso.isConfigured(),
    });
  } catch (err) {
    // Probe must never break the login page.
    console.error('[auth/microsoft] /config error:', err.message);
    res.json({ ssoEnabled: false });
  }
});

// ─── GET /settings ─────────────────────────────────────────────────
// Admin-only.  Returns the company's current SSO configuration for the
// Settings → SSO panel.
router.get('/settings', authenticate, requireAdmin, async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { msEntraTenantId: true, ssoProvider: true, ssoEnabled: true, ssoEnforcedAt: true },
    });
    if (!company) return res.status(404).json({ error: 'Company not found.' });
    res.json({
      ...company,
      serverConfigured: microsoftSso.isConfigured(),
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── PUT /settings ─────────────────────────────────────────────────
// Admin-only, gated on the `sso_saml` feature (Enterprise tier).  Sets
// the company's Entra tenant id and flips ssoEnabled.  We don't yet
// allow "enforce SSO only" from the UI — that belongs in Phase 2 once
// the password-reset flow understands SSO-only accounts.
router.put('/settings', authenticate, requireAdmin, requireFeature('sso_saml'), async (req, res) => {
  try {
    const { msEntraTenantId, ssoEnabled } = req.body || {};

    const data = {};
    if (msEntraTenantId !== undefined) {
      const tenant = msEntraTenantId ? String(msEntraTenantId).trim() : null;
      // Accept a GUID (8-4-4-4-12) or the literal "common" (uncommon for
      // an enterprise customer but not worth rejecting outright).
      if (tenant && tenant !== 'common' && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(tenant)) {
        return res.status(400).json({ error: 'Tenant ID must be a GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).' });
      }
      data.msEntraTenantId = tenant;
      data.ssoProvider = tenant ? 'microsoft' : null;
    }
    if (ssoEnabled !== undefined) {
      data.ssoEnabled = !!ssoEnabled;
    }
    // Guard: can't enable SSO without a tenant id.
    if (data.ssoEnabled === true) {
      const current = await prisma.company.findUnique({
        where: { id: req.user.companyId },
        select: { msEntraTenantId: true },
      });
      const tenant = data.msEntraTenantId !== undefined ? data.msEntraTenantId : current.msEntraTenantId;
      if (!tenant) {
        return res.status(400).json({ error: 'Enter your Azure Tenant ID before enabling SSO.' });
      }
    }

    const updated = await prisma.company.update({
      where: { id: req.user.companyId },
      data,
      select: { msEntraTenantId: true, ssoProvider: true, ssoEnabled: true, ssoEnforcedAt: true },
    });

    try {
      logActivity(
        req.user.id, req.user.companyId, 'SSO_SETTINGS_UPDATE',
        `SSO ${updated.ssoEnabled ? 'enabled' : 'disabled'} (tenant: ${updated.msEntraTenantId || 'none'})`,
        updated, req.ip,
      );
    } catch {}

    res.json({ ...updated, serverConfigured: microsoftSso.isConfigured() });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
