import { useState, useEffect } from 'react';
import api from '../services/api';
import { FileSpreadsheet, Search, CheckCircle, XCircle, Loader2, ArrowLeft, ChevronRight, User } from 'lucide-react';

export default function HistoryPage() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fileType, setFileType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const openDetail = async (id) => {
    setDetailLoading(true);
    try {
      const data = await api.getHistoryDetail(id);
      setDetail(data);
    } catch (err) {
      alert(err.error || 'Failed to load details');
    } finally {
      setDetailLoading(false);
    }
  };

  // ─── Detail View ────────────────────────────────
  if (detail) {
    const { upload, transformedData, creditTransaction, recordCount } = detail;
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
              <p className="font-semibold">{upload.fileType === 'E1' ? 'Environmental (E1)' : 'Social (S1)'}</p>
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
            <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-sm text-amber-800">
                <strong>Credits used:</strong> {creditTransaction.creditsUsed} — {creditTransaction.description}
              </p>
            </div>
          )}
        </div>

        {/* Transformed data table */}
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
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
            // S1 data table
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
                        {r.contractType || r.disabilityStatus || r.turnoverType || r.injuryType || r.trainingHours ? `${r.trainingHours} hrs` : '—'}
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
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Date</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">No uploads found</td></tr>
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
