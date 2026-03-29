import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  FileSpreadsheet, Search, CheckCircle, XCircle, Loader2, ArrowLeft, ChevronRight,
  User, Download, Eye, Shield, FileText, ExternalLink, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { InfoTip } from '../components/HelpSystem';

const AUDIT_STATUSES = [
  { value: 'pending', label: 'Pending Review', color: 'bg-gray-100 text-gray-600', icon: '...' },
  { value: 'verified', label: 'Verified', color: 'bg-green-100 text-green-700', icon: null },
  { value: 'flagged', label: 'Flagged', color: 'bg-amber-100 text-amber-700', icon: null },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-700', icon: null },
];

export default function HistoryPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fileType, setFileType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [auditNote, setAuditNote] = useState('');

  useEffect(() => {
    setLoading(true);
    api.getHistory({ fileType, status, search, page, limit: 20 })
      .then((data) => { setRecords(data.records); setTotal(data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fileType, status, search, page]);

  const statusIcon = (s) => {
    if (s === 'COMPLETED') return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (s === 'FAILED') return <XCircle className="w-4 h-4 text-red-500" />;
    return <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />;
  };

  const auditBadge = (s) => {
    const st = AUDIT_STATUSES.find((a) => a.value === s) || AUDIT_STATUSES[0];
    return <span className={`badge ${st.color}`}>{st.label}</span>;
  };

  const openDetail = async (id) => {
    setDetailLoading(true);
    try {
      const data = await api.getHistoryDetail(id);
      setDetail(data);
      setAuditNote(data.upload.auditNote || '');
    } catch (err) {
      alert(err.error || 'Failed to load details');
    } finally {
      setDetailLoading(false);
    }
  };

  const updateAudit = async (newStatus) => {
    try {
      await api.updateAuditStatus(detail.upload.id, { auditStatus: newStatus, auditNote });
      // Refresh detail
      const data = await api.getHistoryDetail(detail.upload.id);
      setDetail(data);
    } catch (err) {
      alert(err.error || 'Failed to update audit status');
    }
  };

  const getFileLinks = (upload) => {
    if (!upload.storedFilePath) return [];
    const paths = upload.storedFilePath.split('||');
    return paths.map((_, i) => ({
      downloadUrl: api.getFileDownloadUrl(upload.id, i),
      viewUrl: api.getFileViewUrl(upload.id, i),
      label: paths.length > 1 ? `File ${i + 1}` : upload.fileName,
    }));
  };

  // ─── Detail View ────────────────────────────────
  if (detail) {
    const { upload, transformedData, creditTransaction, recordCount } = detail;
    const files = getFileLinks(upload);

    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        <button onClick={() => setDetail(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-600 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to History
        </button>

        {/* Upload summary */}
        <div className="card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{upload.fileName}</h2>
              <p className="text-sm text-gray-500 mt-1">Uploaded on {new Date(upload.createdAt).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2">
              {statusIcon(upload.status)}
              <span className={`badge ${upload.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : upload.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                {upload.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Type</p>
              <p className="font-semibold">{upload.fileType === 'E1' ? 'Environmental' : 'Social'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Org Unit</p>
              <p className="font-semibold">{upload.orgUnit || '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Uploaded By</p>
              <p className="font-semibold">{upload.user?.firstName} {upload.user?.lastName}</p>
              <p className="text-xs text-gray-400">{upload.user?.email}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Processing</p>
              <p className="font-semibold">{upload.processedRows || 0} / {upload.totalRows || 0} rows</p>
              {upload.completedAt && <p className="text-xs text-gray-400">Completed {new Date(upload.completedAt).toLocaleString()}</p>}
            </div>
          </div>

          {upload.errorMessage && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{upload.errorMessage}</div>
          )}

          {creditTransaction && (
            <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-800">
              <strong>Credits used:</strong> {creditTransaction.creditsUsed} — {creditTransaction.description}
            </div>
          )}
        </div>

        {/* Original files — downloadable/viewable */}
        {files.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Original Source Files
              <InfoTip>Original uploaded files are stored for audit traceability. Auditors can view or download these to verify the source data.</InfoTip>
            </h3>
            <div className="space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium">{f.label}</span>
                    {upload.storedFileSize && files.length === 1 && (
                      <span className="text-xs text-gray-400">{(upload.storedFileSize / 1024).toFixed(1)} KB</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={f.viewUrl} target="_blank" rel="noopener noreferrer"
                      className="btn-secondary text-xs py-1 px-2 flex items-center gap-1">
                      <Eye className="w-3 h-3" /> View
                    </a>
                    <a href={f.downloadUrl} download
                      className="btn-secondary text-xs py-1 px-2 flex items-center gap-1">
                      <Download className="w-3 h-3" /> Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit Trail */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Audit Trail
            <InfoTip>Auditors can mark each upload as Verified, Flagged, or Rejected. Add notes to explain findings.</InfoTip>
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Audit Status</p>
              <div className="mt-1">{auditBadge(upload.auditStatus)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Reviewed By</p>
              <p className="font-semibold text-sm">{upload.auditedBy || 'Not yet reviewed'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Review Date</p>
              <p className="font-semibold text-sm">{upload.auditedAt ? new Date(upload.auditedAt).toLocaleString() : '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Data Integrity</p>
              <p className="font-semibold text-sm">{recordCount} records created</p>
            </div>
          </div>

          {/* Audit controls */}
          {user?.role === 'ADMIN' && (
            <div className="border-t pt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Audit Note</label>
                <textarea className="input" rows={2} placeholder="Add review notes, findings, or verification details..."
                  value={auditNote} onChange={(e) => setAuditNote(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => updateAudit('verified')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors">
                  <CheckCircle2 className="w-4 h-4" /> Mark Verified
                </button>
                <button onClick={() => updateAudit('flagged')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors">
                  <AlertTriangle className="w-4 h-4" /> Flag for Review
                </button>
                <button onClick={() => updateAudit('rejected')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors">
                  <XCircle className="w-4 h-4" /> Reject
                </button>
                {upload.auditStatus !== 'pending' && (
                  <button onClick={() => updateAudit('pending')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors">
                    Reset to Pending
                  </button>
                )}
              </div>
              {upload.auditNote && (
                <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                  <strong>Current note:</strong> {upload.auditNote}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transformed data table */}
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="font-semibold text-gray-900">Transformed Data ({recordCount} records)</h3>
          </div>

          {transformedData.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No transformed records found. The AI extraction may not have produced valid data from this upload.
            </div>
          ) : upload.fileType === 'E1' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Year</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Category</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Subcategory</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Scope</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Quantity</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Unit</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">EF</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">tCO2e</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Method</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transformedData.map((r, i) => (
                    <tr key={r.id || i} className="hover:bg-gray-50">
                      <td className="px-3 py-2">{r.year}{r.month ? `-${String(r.month).padStart(2, '0')}` : ''}</td>
                      <td className="px-3 py-2">{r.activityCategory}</td>
                      <td className="px-3 py-2">{r.activitySubcat}</td>
                      <td className="px-3 py-2">
                        <span className={`badge ${r.scope === 'Scope 1' ? 'bg-red-100 text-red-700' : r.scope === 'Scope 2' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {r.scope}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{r.quantity?.toLocaleString()}</td>
                      <td className="px-3 py-2">{r.unit}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-500">{r.emissionFactor || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{r.totalEmissions?.toFixed(4)}</td>
                      <td className="px-3 py-2 text-gray-500">{r.calcMethod}</td>
                      <td className="px-3 py-2 text-right">{r.amount ? `${r.currency || ''} ${r.amount.toLocaleString()}` : '—'}</td>
                      <td className="px-3 py-2 text-gray-400 text-xs truncate max-w-[120px]">{r.sourceDoc || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Table</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Year</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Gender</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Details</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Count/Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transformedData.map((r, i) => (
                    <tr key={r.id || i} className="hover:bg-gray-50">
                      <td className="px-3 py-2"><span className="badge bg-indigo-100 text-indigo-700">{r._table}</span></td>
                      <td className="px-3 py-2">{r.year}{r.quarter ? ` Q${r.quarter}` : ''}</td>
                      <td className="px-3 py-2">{r.gender || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {r.contractType || r.disabilityStatus || r.turnoverType || r.injuryType || (r.trainingHours ? `${r.trainingHours} hrs` : '') || '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {r.employeeCount || r.count || r.trainingHours || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── List View ──────────────────────────────────
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Upload History</h1>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search by file name..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input w-auto" value={fileType} onChange={(e) => { setFileType(e.target.value); setPage(1); }}>
          <option value="">All Types</option>
          <option value="E1">Environmental</option>
          <option value="S1">Social</option>
        </select>
        <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          <option value="COMPLETED">Completed</option>
          <option value="PROCESSING">Processing</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">File</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Type</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Org Unit</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Uploaded By</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Rows</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Audit</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Date</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">No uploads found</td></tr>
            ) : records.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(r.id)}>
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">{r.fileName}</span>
                  </div>
                </td>
                <td className="px-4 py-3"><span className={`badge ${r.fileType === 'E1' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>{r.fileType}</span></td>
                <td className="px-4 py-3 text-sm text-gray-500">{r.orgUnit || '—'}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-600">{r.user?.firstName} {r.user?.lastName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">{r.processedRows ?? '—'} / {r.totalRows ?? '—'}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-1.5">{statusIcon(r.status)} <span className="text-sm">{r.status}</span></div></td>
                <td className="px-4 py-3">{auditBadge(r.auditStatus)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3"><ChevronRight className="w-4 h-4 text-gray-300" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div className="flex justify-center gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="px-4 py-2 text-sm text-gray-500">Page {page} of {Math.ceil(total / 20)}</span>
          <button className="btn-secondary" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      {detailLoading && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
            <span>Loading transformation details...</span>
          </div>
        </div>
      )}
    </div>
  );
}
