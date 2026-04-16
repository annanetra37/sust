const API_BASE = import.meta.env.VITE_API_URL || window.__API_URL__ || '/api';

let accessToken = localStorage.getItem('accessToken');
let refreshToken = localStorage.getItem('refreshToken');

function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem('accessToken', access);
  else localStorage.removeItem('accessToken');
  if (refresh) localStorage.setItem('refreshToken', refresh);
  else localStorage.removeItem('refreshToken');
}

function clearTokens() {
  setTokens(null, null);
  localStorage.removeItem('user');
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  // Remove Content-Type for FormData
  if (options.body instanceof FormData) delete headers['Content-Type'];

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (networkErr) {
    throw { status: 0, error: 'Network error: Cannot reach the server. Please check your connection.' };
  }

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken && !path.includes('/auth/')) {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      setTokens(data.accessToken, data.refreshToken);
      headers.Authorization = `Bearer ${data.accessToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } else {
      clearTokens();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw { status: res.status, ...err };
    }
    throw { status: res.status, error: `Server error: ${res.status} ${res.statusText}` };
  }

  // Guard against non-JSON responses (e.g., HTML from static server when API is unreachable)
  if (contentType.includes('application/json')) return res.json();
  if (contentType.includes('text/html')) {
    throw { status: 502, error: 'API is unreachable. The server returned HTML instead of JSON. Check that VITE_API_URL is configured correctly.' };
  }
  return res.blob();
}

const api = {
  // Auth
  signup: (data) => request('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  verifyEmail: (data) => request('/auth/verify-email', { method: 'POST', body: JSON.stringify(data) }),
  resendOtp: (email) => request('/auth/resend-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  login: async (data) => {
    const res = await request('/auth/login', { method: 'POST', body: JSON.stringify(data) });
    setTokens(res.accessToken, res.refreshToken);
    localStorage.setItem('user', JSON.stringify(res.user));
    return res;
  },
  logout: async () => {
    try { await request('/auth/logout', { method: 'POST' }); } catch {}
    clearTokens();
  },
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (data) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify(data) }),
  invite: (data) => request('/auth/invite', { method: 'POST', body: JSON.stringify(data) }),
  acceptInvite: (data) => request('/auth/accept-invite', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request('/auth/me'),

  // Users
  getUsers: () => request('/users'),
  updateUserStatus: (id, isActive) => request(`/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  updatePermissions: (id, permissions) => request(`/users/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }),

  // S1
  getS1Dashboard: (params) => request(`/s1/dashboard?${new URLSearchParams(params)}`),
  uploadS1: (formData) => request('/s1/upload', { method: 'POST', body: formData }),
  getS1Progress: (id) => request(`/s1/upload/${id}/progress`),

  // E1
  getE1Dashboard: (params) => request(`/e1/dashboard?${new URLSearchParams(params)}`),
  uploadE1: (formData) => request('/e1/upload', { method: 'POST', body: formData }),
  uploadDocExtract: (formData) => request('/e1/doc-extract', { method: 'POST', body: formData }),
  getE1Progress: (id) => request(`/e1/upload/${id}/progress`),
  getSBTiTargets: () => request('/e1/sbti'),
  createSBTiTarget: (data) => request('/e1/sbti', { method: 'POST', body: JSON.stringify(data) }),
  deleteSBTiTarget: (id) => request(`/e1/sbti/${id}`, { method: 'DELETE' }),
  getCategories: () => request('/e1/categories'),

  // Settings
  getOrgUnits: () => request('/settings/org-units'),
  createOrgUnit: (data) => request('/settings/org-units', { method: 'POST', body: JSON.stringify(data) }),
  deleteOrgUnit: (id) => request(`/settings/org-units/${id}`, { method: 'DELETE' }),
  getEsgStandard: () => request('/settings/esg-standard'),
  setEsgStandard: (standard) => request('/settings/esg-standard', { method: 'PUT', body: JSON.stringify({ standard }) }),
  previewReset: (data) => request('/settings/reset/preview', { method: 'POST', body: JSON.stringify(data) }),
  resetS1: (data) => request('/settings/reset/s1', { method: 'POST', body: JSON.stringify(data) }),
  resetE1: (data) => request('/settings/reset/e1', { method: 'POST', body: JSON.stringify(data) }),
  getCredits: (params) => request(`/settings/credits?${new URLSearchParams(params || {})}`),

  // Credits preview / estimate
  estimateCredits: (body) => request('/credits/estimate', { method: 'POST', body: JSON.stringify(body) }),
  getCreditBalance: () => request('/credits/balance'),
  estimateReportCost: (data) => request('/reports/v2/estimate', { method: 'POST', body: JSON.stringify(data) }),
  getCompany: () => request('/settings/company'),
  uploadLogo: (formData) => request('/settings/logo', { method: 'POST', body: formData }),
  getLogoUrl: () => `${API_BASE}/settings/logo`,
  deleteLogo: () => request('/settings/logo', { method: 'DELETE' }),
  updateCompany: (data) => request('/settings/company', { method: 'PUT', body: JSON.stringify(data) }),

  // History
  getHistory: (params) => request(`/history?${new URLSearchParams(params || {})}`),
  getHistoryDetail: (id) => request(`/history/${id}`),
  getDataYears: () => request('/history/meta/years'),
  getFileDownloadUrl: (id, fileIndex) => `${API_BASE}/history/${id}/download/${fileIndex || 0}`,
  getFileViewUrl: (id, fileIndex) => `${API_BASE}/history/${id}/view/${fileIndex || 0}`,
  updateAuditStatus: (id, data) => request(`/history/${id}/audit`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Reports
  generateReport: async (data) => {
    const blob = await request('/reports/generate', { method: 'POST', body: JSON.stringify(data) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ESG_Report_${data.year}.${data.format === 'pdf' ? 'pdf' : 'docx'}`;
    a.click();
    URL.revokeObjectURL(url);
  },
  getLanguages: () => request('/reports/languages'),

  // Reports v2
  getStandards: () => request('/reports/v2/standards'),
  validateReport: (data) => request('/reports/v2/validate', { method: 'POST', body: JSON.stringify(data) }),
  generateReportV2: async (data) => {
    const blob = await request('/reports/v2/generate', { method: 'POST', body: JSON.stringify(data) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = data.format === 'docx' ? 'docx' : 'pdf';
    a.download = `${data.standard}_Report_${data.year}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Connections
  getConnections: () => request('/connections'),
  createConnection: (data) => request('/connections', { method: 'POST', body: JSON.stringify(data) }),
  testConnection: (id) => request(`/connections/${id}/test`, { method: 'POST' }),
  deleteConnection: (id) => request(`/connections/${id}`, { method: 'DELETE' }),
  listTables: (id) => request(`/connections/${id}/tables`),
  listColumns: (id, table) => request(`/connections/${id}/tables/${table}/columns`),
  pullData: (id, data) => request(`/connections/${id}/pull`, { method: 'POST', body: JSON.stringify(data) }),

  // Exports
  exportE1Dashboard: async (params) => {
    const blob = await request(`/exports/e1?${new URLSearchParams(params)}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `E1_Dashboard_${params.year || 'export'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  },
  exportS1Dashboard: async (params) => {
    const blob = await request(`/exports/s1?${new URLSearchParams(params)}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `S1_Dashboard_${params.year || 'export'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Activity Log
  getActivityLog: (params) => request(`/activity-log?${new URLSearchParams(params || {})}`),

  // Lineage
  getLineage: (params) => request(`/lineage?${new URLSearchParams(params || {})}`),
  exportAuditTrail: async (data) => {
    const blob = await request('/lineage/export', { method: 'POST', body: JSON.stringify(data) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ESG_Audit_Trail_${new Date().toISOString().split('T')[0]}.${data.format === 'docx' ? 'docx' : 'pdf'}`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Upgrade request
  requestUpgrade: (data) => request('/settings/upgrade-request', { method: 'POST', body: JSON.stringify(data) }),

  // Sustainability ROI
  getRoiSummary: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/roi/summary${qs ? '?' + qs : ''}`);
  },
  getRoiFinancials: () => request('/roi/financials'),
  updateRoiFinancials: (data) => request('/roi/financials', { method: 'PUT', body: JSON.stringify(data) }),

  // Assistant
  chatAssistant: (message, history) => request('/assistant/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),

  // Build an authenticated URL for opening files in a new tab or as
  // download links.  Appends the current access token as a query param so
  // the backend can verify the request (its auth middleware also accepts
  // ?token=).  Uses API_BASE so URLs work in deployments where the backend
  // is on a different domain.
  authFileUrl: (path) => {
    const sep = path.includes('?') ? '&' : '?';
    return `${API_BASE}${path}${sep}token=${accessToken || ''}`;
  },

  setTokens,
  clearTokens,
  getAccessToken: () => accessToken,
  getApiBase: () => API_BASE,
};

export default api;
