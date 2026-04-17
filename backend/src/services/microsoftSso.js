'use strict';

// backend/src/services/microsoftSso.js
// Microsoft Entra ID (Azure AD) SSO via MSAL Node — authorization-code flow.
// Used by the /api/auth/microsoft/* routes.  All functions throw a
// descriptive Error when MS_CLIENT_ID/MS_CLIENT_SECRET are not configured
// so the caller can return 503 without crashing the process.

const config = require('../config');

let cachedClient = null;

function isConfigured() {
  return !!(config.microsoft.clientId && config.microsoft.clientSecret && config.microsoft.redirectUri);
}

function getClient() {
  if (!isConfigured()) {
    throw new Error('Microsoft SSO is not configured. Set MS_CLIENT_ID, MS_CLIENT_SECRET, and MS_REDIRECT_URI.');
  }
  if (cachedClient) return cachedClient;

  // Lazy-require so the app can start even if @azure/msal-node is not
  // installed in a given environment (e.g., Railway before npm install).
  const { ConfidentialClientApplication } = require('@azure/msal-node');
  cachedClient = new ConfidentialClientApplication({
    auth: {
      clientId:     config.microsoft.clientId,
      clientSecret: config.microsoft.clientSecret,
      authority:    config.microsoft.authority,
    },
  });
  return cachedClient;
}

// Step 1: build the Microsoft consent / login URL.  `state` should be a
// random anti-CSRF token the caller also writes into a short-lived cookie
// or session store so it can be verified on callback.
async function getAuthUrl({ state, loginHint } = {}) {
  const client = getClient();
  return client.getAuthCodeUrl({
    scopes:      config.microsoft.scopes,
    redirectUri: config.microsoft.redirectUri,
    state,
    // Pre-fills the email on the Microsoft login page so the user
    // doesn't have to retype it.
    loginHint:   loginHint || undefined,
    prompt:      'select_account',
  });
}

// Step 2: exchange the ?code= returned by Microsoft for id_token +
// access_token.  Returns the full MSAL AuthenticationResult.
async function exchangeCode(code) {
  const client = getClient();
  return client.acquireTokenByCode({
    code,
    scopes:      config.microsoft.scopes,
    redirectUri: config.microsoft.redirectUri,
  });
}

// Step 3 (optional): call Microsoft Graph /me to enrich the profile.
// Most environments get everything needed from the id_token claims when
// the optional claims are enabled (Block A7), so this is only called as
// a fallback when claims are missing.
async function getUserProfile(accessToken) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Microsoft Graph /me returned ${res.status}`);
  }
  return res.json();
}

// Normalise the MSAL result into the minimal identity fields our user
// model needs.  Prefers id_token claims; falls back to Graph if needed.
async function extractIdentity(authResult) {
  const claims = authResult?.idTokenClaims || {};
  let email     = claims.email || claims.preferred_username || null;
  let firstName = claims.given_name || null;
  let lastName  = claims.family_name || null;
  const oid     = claims.oid || null;             // stable Azure object id
  const tid     = claims.tid || null;             // tenant id

  // Fall back to Graph only if we're missing core fields.
  if ((!email || !firstName || !lastName) && authResult?.accessToken) {
    try {
      const profile = await getUserProfile(authResult.accessToken);
      email     = email     || profile.mail || profile.userPrincipalName;
      firstName = firstName || profile.givenName || null;
      lastName  = lastName  || profile.surname   || null;
    } catch {
      // Non-fatal: we'll surface whatever we have and let the caller
      // decide whether the identity is complete enough to auto-provision.
    }
  }

  return {
    email: email ? String(email).toLowerCase() : null,
    firstName,
    lastName,
    azureOid: oid,
    tenantId: tid,
  };
}

module.exports = {
  isConfigured,
  getAuthUrl,
  exchangeCode,
  getUserProfile,
  extractIdentity,
};
