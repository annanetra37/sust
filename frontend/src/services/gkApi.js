import { request } from './api';

// Green Key Readiness API client (/api/gk).
const json = (method, body) => ({ method, body: JSON.stringify(body) });

const gkApi = {
  meta: () => request('/gk/meta'),

  // Clients, brands, establishments
  clients: () => request('/gk/clients'),
  createClient: (b) => request('/gk/clients', json('POST', b)),
  updateClient: (id, b) => request(`/gk/clients/${id}`, json('PUT', b)),
  deleteClient: (id) => request(`/gk/clients/${id}`, { method: 'DELETE' }),
  createBrand: (clientId, b) => request(`/gk/clients/${clientId}/brands`, json('POST', b)),
  deleteBrand: (id) => request(`/gk/brands/${id}`, { method: 'DELETE' }),
  establishments: (clientId) => request(`/gk/establishments${clientId ? `?clientId=${clientId}` : ''}`),
  establishment: (id) => request(`/gk/establishments/${id}`),
  createEstablishment: (b) => request('/gk/establishments', json('POST', b)),
  updateEstablishment: (id, b) => request(`/gk/establishments/${id}`, json('PUT', b)),
  deleteEstablishment: (id) => request(`/gk/establishments/${id}`, { method: 'DELETE' }),
  overview: (id) => request(`/gk/establishments/${id}/overview`),

  // Criteria library
  criteria: (params = {}) => request(`/gk/criteria?${new URLSearchParams(Object.entries(params).filter(([, v]) => v))}`),
  createCriterion: (b) => request('/gk/criteria', json('POST', b)),
  updateCriterion: (id, b) => request(`/gk/criteria/${id}`, json('PUT', b)),
  deleteCriterion: (id) => request(`/gk/criteria/${id}`, { method: 'DELETE' }),
  importCriteria: (b) => request('/gk/criteria/import', json('POST', b)),

  // Readiness board
  board: (id) => request(`/gk/establishments/${id}/criteria`),
  setStatus: (id, criterionId, b) => request(`/gk/establishments/${id}/criteria/${criterionId}`, json('PUT', b)),
  addComment: (id, criterionId, text) => request(`/gk/establishments/${id}/criteria/${criterionId}/comments`, json('POST', { text })),

  // Evidence
  evidence: (id) => request(`/gk/establishments/${id}/evidence`),
  uploadEvidence: (id, formData) => request(`/gk/establishments/${id}/evidence`, { method: 'POST', body: formData }),
  updateEvidence: (evId, b) => request(`/gk/evidence/${evId}`, json('PUT', b)),
  reviewEvidence: (evId, b) => request(`/gk/evidence/${evId}/review`, json('POST', b)),
  deleteEvidence: (evId) => request(`/gk/evidence/${evId}`, { method: 'DELETE' }),
  evidenceFile: (evId) => request(`/gk/evidence/${evId}/file`),

  // Resource data
  resources: (id, params = {}) => request(`/gk/establishments/${id}/resources?${new URLSearchParams(params)}`),
  saveResources: (id, rows) => request(`/gk/establishments/${id}/resources`, json('POST', rows)),
  updateResource: (recId, b) => request(`/gk/resources/${recId}`, json('PUT', b)),
  deleteResource: (recId) => request(`/gk/resources/${recId}`, { method: 'DELETE' }),
  saveOccupancy: (id, rows) => request(`/gk/establishments/${id}/occupancy`, json('PUT', rows)),
  importData: (id, rows) => request(`/gk/establishments/${id}/import`, json('POST', { rows })),

  // KPIs
  kpis: (id, params = {}) => request(`/gk/establishments/${id}/kpis?${new URLSearchParams(Object.entries(params).filter(([, v]) => v))}`),
  clientKpis: (clientId) => request(`/gk/clients/${clientId}/kpis`),

  // Targets and actions
  plan: (id) => request(`/gk/establishments/${id}/plan`),
  createTarget: (id, b) => request(`/gk/establishments/${id}/targets`, json('POST', b)),
  updateTarget: (tId, b) => request(`/gk/targets/${tId}`, json('PUT', b)),
  deleteTarget: (tId) => request(`/gk/targets/${tId}`, { method: 'DELETE' }),
  createAction: (id, b) => request(`/gk/establishments/${id}/actions`, json('POST', b)),
  updateAction: (aId, b) => request(`/gk/actions/${aId}`, json('PUT', b)),
  deleteAction: (aId) => request(`/gk/actions/${aId}`, { method: 'DELETE' }),

  // People
  people: (id, year) => request(`/gk/establishments/${id}/people${year ? `?year=${year}` : ''}`),
  addMember: (id, b) => request(`/gk/establishments/${id}/team`, json('POST', b)),
  updateMember: (mId, b) => request(`/gk/team/${mId}`, json('PUT', b)),
  deleteMember: (mId) => request(`/gk/team/${mId}`, { method: 'DELETE' }),
  addTraining: (id, b) => request(`/gk/establishments/${id}/trainings`, json('POST', b)),
  updateTraining: (tId, b) => request(`/gk/trainings/${tId}`, json('PUT', b)),
  deleteTraining: (tId) => request(`/gk/trainings/${tId}`, { method: 'DELETE' }),

  // Audit and certification
  audit: (id) => request(`/gk/establishments/${id}/audit`),
  createCertification: (id, b) => request(`/gk/establishments/${id}/certifications`, json('POST', b)),
  updateCertification: (cId, b) => request(`/gk/certifications/${cId}`, json('PUT', b)),
  deleteCertification: (cId) => request(`/gk/certifications/${cId}`, { method: 'DELETE' }),
  createNc: (id, b) => request(`/gk/establishments/${id}/ncs`, json('POST', b)),
  updateNc: (ncId, b) => request(`/gk/ncs/${ncId}`, json('PUT', b)),
  deleteNc: (ncId) => request(`/gk/ncs/${ncId}`, { method: 'DELETE' }),
  certificates: () => request('/gk/certificates'),
  portfolio: () => request('/gk/portfolio'),
  auditPack: (id) => request(`/gk/establishments/${id}/audit-pack`),
};

/** Save a Blob returned by the API as a file. */
export function saveBlob(blob, fileName) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Open a Blob in a new tab (PDF / image preview). */
export function openBlob(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export default gkApi;
