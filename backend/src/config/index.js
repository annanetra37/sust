require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT) || 4000,
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
    accessExpiry: '1d',
    refreshExpiry: '15d',
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM || 'Triple I ESG <noreply@triplei.io>',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
  },
  // ─── Microsoft Entra ID (Azure AD) SSO ────────────────────────
  // Populated from the Azure App Registration created in Block A of
  // the MS Marketplace handoff.  Left empty in local dev — the SSO
  // routes detect this and return a clear 503 instead of crashing.
  microsoft: {
    clientId:     process.env.MS_CLIENT_ID || '',
    clientSecret: process.env.MS_CLIENT_SECRET || '',
    redirectUri:  process.env.MS_REDIRECT_URI || '',
    // 'common' = multi-tenant.  A specific GUID locks the App
    // Registration to a single Azure AD tenant (single-customer mode).
    tenantId:     process.env.MS_TENANT_ID || 'common',
    authority:    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID || 'common'}`,
    scopes:       ['openid', 'profile', 'email', 'User.Read'],
  },
  // ─── Azure Blob Storage (logos, reports) ──────────────────────
  // Railway's disk is ephemeral — files written to it vanish on every
  // redeploy.  When the connection string is present, uploads go to
  // Azure Blob Storage instead (see services/blobStorage.js).  When
  // absent, the app falls back to the legacy filesystem path so local
  // dev and pre-migration Railway deploys keep working.
  azureBlob: {
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
    accountName:      process.env.AZURE_STORAGE_ACCOUNT_NAME || '',
    baseUrl:          process.env.AZURE_BLOB_BASE_URL || '',
  },
};
