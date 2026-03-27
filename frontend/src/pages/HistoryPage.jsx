import { useState, useEffect } from 'react';
import api from '../services/api';
import { FileSpreadsheet, Search, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function HistoryPage() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fileType, setFileType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

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
          <option value="E1">E1 — Environmental</option>
          <option value="S1">S1 — Social</option>
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
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Rows</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No uploads found</td></tr>
            ) : records.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-gray-400" />
                    {r.fileName}
                  </div>
                </td>
                <td className="px-4 py-3"><span className={`badge ${r.fileType === 'E1' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>{r.fileType}</span></td>
                <td className="px-4 py-3 text-sm text-gray-500">{r.orgUnit || '—'}</td>
                <td className="px-4 py-3 text-sm">{r.processedRows ?? '—'} / {r.totalRows ?? '—'}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-1.5">{statusIcon(r.status)} <span className="text-sm">{r.status}</span></div></td>
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</td>
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
    </div>
  );
}
