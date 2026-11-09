import { request } from './api';

// Financed Emissions module API (/api/fe).
const json = (body) => JSON.stringify(body);
const qs = (params = {}) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${new URLSearchParams(p)}` : '';
};

// Fetch an authenticated file and hand it to the browser.
async function download(path, fileName) {
  const blob = await request(path);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function upload(path, file, fields = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  fd.append('file', file);
  return request(path, { method: 'POST', body: fd });
}

const feApi = {
  meta: () => request('/fe/meta'),

  // Portfolios & periods
  portfolios: () => request('/fe/portfolios'),
  createPortfolio: (body) => request('/fe/portfolios', { method: 'POST', body: json(body) }),
  updatePortfolio: (id, body) => request(`/fe/portfolios/${id}`, { method: 'PUT', body: json(body) }),
  deletePortfolio: (id) => request(`/fe/portfolios/${id}`, { method: 'DELETE' }),
  createPeriod: (portfolioId, body) => request(`/fe/portfolios/${portfolioId}/periods`, { method: 'POST', body: json(body) }),
  period: (id) => request(`/fe/periods/${id}`),
  updatePeriod: (id, body) => request(`/fe/periods/${id}`, { method: 'PUT', body: json(body) }),
  deletePeriod: (id) => request(`/fe/periods/${id}`, { method: 'DELETE' }),

  // Intake
  uploadTape: (periodId, assetClass, file) => upload(`/fe/periods/${periodId}/uploads`, file, { assetClass }),
  uploads: (periodId) => request(`/fe/periods/${periodId}/uploads`),
  downloadTemplate: (assetClass) => download(`/fe/templates/${assetClass}`, `fe-loan-tape-${assetClass}.csv`),
  downloadUploadErrors: (uploadId) => download(`/fe/uploads/${uploadId}/errors.csv`, `fe-upload-errors-${uploadId.slice(0, 8)}.csv`),
  exposures: (periodId, params) => request(`/fe/periods/${periodId}/exposures${qs(params)}`),
  updateExposure: (id, body) => request(`/fe/exposures/${id}`, { method: 'PUT', body: json(body) }),
  deleteExposure: (id) => request(`/fe/exposures/${id}`, { method: 'DELETE' }),
  lineage: (exposureId, runId) => request(`/fe/exposures/${exposureId}/lineage${qs({ runId })}`),

  // Counterparties & mapping
  counterparties: (params) => request(`/fe/counterparties${qs(params)}`),
  counterparty: (id) => request(`/fe/counterparties/${id}`),
  updateCounterparty: (id, body) => request(`/fe/counterparties/${id}`, { method: 'PUT', body: json(body) }),
  addEmissions: (id, body) => request(`/fe/counterparties/${id}/emissions`, { method: 'POST', body: json(body) }),
  deleteEmissions: (id, eid) => request(`/fe/counterparties/${id}/emissions/${eid}`, { method: 'DELETE' }),
  sectorMap: () => request('/fe/sector-map'),
  saveSectorMap: (mappings, periodId) => request('/fe/sector-map', { method: 'POST', body: json({ mappings, periodId }) }),
  deleteSectorMap: (id) => request(`/fe/sector-map/${id}`, { method: 'DELETE' }),
  unmapped: (periodId) => request(`/fe/periods/${periodId}/unmapped`),

  // Factor library
  factorSets: () => request('/fe/factor-sets'),
  factorSet: (id) => request(`/fe/factor-sets/${id}`),
  createFactorSet: (body) => request('/fe/factor-sets', { method: 'POST', body: json(body) }),
  uploadFactors: (id, file) => upload(`/fe/factor-sets/${id}/factors`, file),
  deleteFactorSet: (id) => request(`/fe/factor-sets/${id}`, { method: 'DELETE' }),
  downloadFactorTemplate: () => download('/fe/factor-sets/template', 'fe-factor-template.csv'),

  // Runs
  runs: (periodId) => request(`/fe/periods/${periodId}/runs`),
  startRun: (periodId, factorSetId) => request(`/fe/periods/${periodId}/runs`, { method: 'POST', body: json({ factorSetId }) }),
  run: (id) => request(`/fe/runs/${id}`),
  runResults: (id, params) => request(`/fe/runs/${id}/results${qs(params)}`),
  verifyRun: (id) => request(`/fe/runs/${id}/verify`, { method: 'POST' }),
  downloadExceptions: (id, name) => download(`/fe/runs/${id}/exceptions.csv`, `fe-exceptions-${name}.csv`),
  downloadReport: (id, name, includeNames) => download(`/fe/runs/${id}/report.xlsx${includeNames ? '?includeNames=1' : ''}`, `PCAF_${name}.xlsx`),
  dashboard: (periodId, params) => request(`/fe/periods/${periodId}/dashboard${qs(params)}`),

  // Review
  submit: (id, comment) => request(`/fe/periods/${id}/submit`, { method: 'POST', body: json({ comment }) }),
  approve: (id, comment) => request(`/fe/periods/${id}/approve`, { method: 'POST', body: json({ comment }) }),
  reject: (id, comment) => request(`/fe/periods/${id}/reject`, { method: 'POST', body: json({ comment }) }),
  reopen: (id, reason) => request(`/fe/periods/${id}/reopen`, { method: 'POST', body: json({ reason }) }),
  comment: (id, comment) => request(`/fe/periods/${id}/comments`, { method: 'POST', body: json({ comment }) }),
  events: (id) => request(`/fe/periods/${id}/events`),
};

export default feApi;
