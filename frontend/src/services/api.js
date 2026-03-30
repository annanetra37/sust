const API_BASE = '/api';

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

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

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

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw { status: res.status, ...err };
  }

  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) return res.json();
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
  getCompany: () => request('/settings/company'),
  updateCompany: (data) => request('/settings/company', { method: 'PUT', body: JSON.stringify(data) }),

  // History
  getHistory: (params) => request(`/history?${new URLSearchParams(params || {})}`),
  getHistoryDetail: (id) => request(`/history/${id}`),
  getDataYears: () => request('/history/meta/years'),
  getFileDownloadUrl: (id, fileIndex) => `/api/history/${id}/download/${fileIndex || 0}`,
  getFileViewUrl: (id, fileIndex) => `/api/history/${id}/view/${fileIndex || 0}`,
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

  // Connections
  getConnections: () => request('/connections'),
  createConnection: (data) => request('/connections', { method: 'POST', body: JSON.stringify(data) }),
  testConnection: (id) => request(`/connections/${id}/test`, { method: 'POST' }),
  deleteConnection: (id) => request(`/connections/${id}`, { method: 'DELETE' }),
  listTables: (id) => request(`/connections/${id}/tables`),
  listColumns: (id, table) => request(`/connections/${id}/tables/${table}/columns`),
  pullData: (id, data) => request(`/connections/${id}/pull`, { method: 'POST', body: JSON.stringify(data) }),

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

  // Assistant
  chatAssistant: (message, history) => request('/assistant/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),

  setTokens,
  clearTokens,
  getAccessToken: () => accessToken,
};

export default api;
