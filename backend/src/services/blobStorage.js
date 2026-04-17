'use strict';

// backend/src/services/blobStorage.js
// Azure Blob Storage wrapper for logo and report file management.
// Containers:
//   logos/   — company logo uploads (PNG/JPG/WebP)
//   reports/ — generated PDF / DOCX reports (reserved; reports route
//              currently streams directly, so this is unused for now)
//
// If AZURE_STORAGE_CONNECTION_STRING is unset, isEnabled() returns false
// and callers fall back to the legacy local-filesystem path.  This lets
// the app boot unchanged in local dev and in Railway deployments that
// haven't yet added the Azure env vars (Block E of the handoff).

const path = require('path');
const fs = require('fs');
const config = require('../config');

let cachedServiceClient = null;

function isEnabled() {
  return !!config.azureBlob.connectionString;
}

function getServiceClient() {
  if (!isEnabled()) {
    throw new Error('Azure Blob Storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING.');
  }
  if (cachedServiceClient) return cachedServiceClient;
  const { BlobServiceClient } = require('@azure/storage-blob');
  cachedServiceClient = BlobServiceClient.fromConnectionString(config.azureBlob.connectionString);
  return cachedServiceClient;
}

// Upload a company logo.  Returns the canonical blob URL.
// blobName: {companyId}/company_logo.{ext}
async function uploadLogo(companyId, buffer, mimeType) {
  const ext = (mimeType || '').split('/')[1] || 'png';
  const blobName = `${companyId}/company_logo.${ext}`;
  const container = getServiceClient().getContainerClient('logos');
  const blob = container.getBlockBlobClient(blobName);
  await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: mimeType || 'image/png' } });
  return blob.url;
}

// Upload a generated report.  Returns the canonical blob URL.
// blobName: {companyId}/{year}/{reportId}.{ext}
async function uploadReport(companyId, reportId, year, buffer, mimeType) {
  const ext = (mimeType || '').includes('pdf') ? 'pdf' : 'docx';
  const blobName = `${companyId}/${year}/${reportId}.${ext}`;
  const container = getServiceClient().getContainerClient('reports');
  const blob = container.getBlockBlobClient(blobName);
  await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: mimeType || 'application/octet-stream' } });
  return blob.url;
}

// Time-limited SAS URL for private blob access (e.g., a share link for a
// generated report).  Requires AZURE_STORAGE_ACCOUNT_NAME + the account
// key baked into the connection string — MSAL-style AAD credentials are
// out of scope for Phase 1.
async function getSignedUrl(containerName, blobName, expiresInMinutes = 60) {
  if (!isEnabled()) {
    throw new Error('Azure Blob Storage is not configured.');
  }
  const {
    generateBlobSASQueryParameters,
    StorageSharedKeyCredential,
    BlobSASPermissions,
  } = require('@azure/storage-blob');

  // Pull the account name + key out of the connection string once.
  const parts = Object.fromEntries(
    config.azureBlob.connectionString
      .split(';')
      .map((p) => p.split('='))
      .filter((kv) => kv.length === 2)
      .map(([k, v]) => [k, v]),
  );
  const accountName = parts.AccountName || config.azureBlob.accountName;
  const accountKey = parts.AccountKey;
  if (!accountName || !accountKey) {
    throw new Error('Cannot generate SAS URL: AccountName/AccountKey missing from connection string.');
  }
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const expiresOn = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      expiresOn,
      permissions: BlobSASPermissions.parse('r'),
    },
    credential,
  ).toString();

  const base = config.azureBlob.baseUrl || `https://${accountName}.blob.core.windows.net`;
  return `${base}/${containerName}/${blobName}?${sas}`;
}

async function deleteBlob(containerName, blobName) {
  if (!isEnabled()) return; // no-op when falling back to local disk
  const container = getServiceClient().getContainerClient(containerName);
  await container.deleteBlob(blobName, { deleteSnapshots: 'include' });
}

// ─── Local filesystem fallback ───────────────────────────────────
// Preserves the pre-Azure behaviour for local dev and for Railway
// deployments that haven't yet provisioned a storage account.

function localUploadsDir() {
  return path.join(__dirname, '../../uploads');
}

async function uploadLogoLocal(companyId, buffer, mimeType, originalName) {
  const dir = path.join(localUploadsDir(), companyId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(originalName || '') || `.${(mimeType || 'image/png').split('/')[1] || 'png'}`;
  const file = `company_logo${ext}`;
  fs.writeFileSync(path.join(dir, file), buffer);
  return `${companyId}/${file}`; // relative path (same shape as legacy logoPath)
}

module.exports = {
  isEnabled,
  uploadLogo,
  uploadReport,
  getSignedUrl,
  deleteBlob,
  // local fallback helpers
  uploadLogoLocal,
  localUploadsDir,
};
