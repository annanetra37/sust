import { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Activity, User, LogIn, Upload, FileText, Trash2, Settings, UserPlus, Target,
  Shield, Database, Filter, ChevronLeft, ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { HelpBanner } from '../components/HelpSystem';

const ACTION_META = {
  LOGIN: { icon: LogIn, label: 'Sign In', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950' },
  UPLOAD_S1: { icon: Upload, label: 'S1 Upload', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950' },
  UPLOAD_E1: { icon: Upload, label: 'E1 Upload', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950' },
  DOC_EXTRACT: { icon: FileText, label: 'Doc Extract', color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-950' },
  INVITE_USER: { icon: UserPlus, label: 'Invite User', color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950' },
  DELETE_USER: { icon: Trash2, label: 'Delete User', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950' },
  RESET_DATA: { icon: Trash2, label: 'Data Reset', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950' },
  GENERATE_REPORT: { icon: FileText, label: 'Report', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950' },
  UPDATE_SETTINGS: { icon: Settings, label: 'Settings', color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-800' },
  CREATE_CONNECTION: { icon: Database, label: 'Connection', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950' },
  SET_SBTI_TARGET: { icon: Target, label: 'SBTi Target', color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950' },
  AUDIT_UPDATE: { icon: Shield, label: 'Audit', color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950' },
};

const DEFAULT_META = { icon: Activity, label: 'Action', color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-800' };

export default function ActivityLogPage() {
  const [data, setData] = useState({ logs: [], total: 0, actions: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ userId: '', action: '', from: '', to: '', page: 1 });

  useEffect(() => {
    setLoading(true);
    api.getActivityLog(filters)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters]);

  const formatTime = (date) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Activity className="w-6 h-6 text-brand-600" /> Activity Log
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Track every action by all users across the platform</p>
      </div>

      <HelpBanner id="activity-log-guide" title="User Activity Tracking" variant="info">
        Every significant action is recorded: logins, data uploads, report generation, settings changes,
        user management, and more. Use filters to find specific activities by user, action type, or date range.
      </HelpBanner>

      {/* Filters */}
      <div className="card py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400" />
          <select className="input w-auto" value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value, page: 1 })}>
            <option value="">All Users</option>
            {data.users?.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
          <select className="input w-auto" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })}>
            <option value="">All Actions</option>
            {data.actions?.map((a) => <option key={a} value={a}>{ACTION_META[a]?.label || a}</option>)}
          </select>
          <input type="date" className="input w-auto" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })} placeholder="From" />
          <input type="date" className="input w-auto" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })} placeholder="To" />
          {(filters.userId || filters.action || filters.from || filters.to) && (
            <button className="text-sm text-brand-600 hover:underline" onClick={() => setFilters({ userId: '', action: '', from: '', to: '', page: 1 })}>Clear</button>
          )}
        </div>
      </div>

      {/* Log entries */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading activity log...</div>
        ) : data.logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">No activity recorded yet.</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.logs.map((log) => {
              const meta = ACTION_META[log.action] || DEFAULT_META;
              const LogIcon = meta.icon;
              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <LogIcon className={`w-4 h-4 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {log.user?.firstName} {log.user?.lastName}
                      </span>
                      <span className={`badge ${meta.bg} ${meta.color}`}>{meta.label}</span>
                      <span className="badge bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{log.user?.role}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{log.detail || log.action}</p>
                    {log.ipAddress && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">IP: {log.ipAddress}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{formatTime(log.createdAt)}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{new Date(log.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button className="btn-secondary" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-4 py-2 text-sm text-gray-500">Page {filters.page} of {data.totalPages}</span>
          <button className="btn-secondary" disabled={filters.page >= data.totalPages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
