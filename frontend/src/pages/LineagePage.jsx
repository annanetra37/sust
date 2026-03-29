import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  GitBranch, Leaf, Users2, Shield, Building2, User, FileText, ChevronDown, ChevronRight,
  Download, Loader2, CheckCircle, XCircle, AlertTriangle, Eye, Filter, FileSpreadsheet
} from 'lucide-react';
import { HelpBanner, InfoTip } from '../components/HelpSystem';
import clsx from 'clsx';

const TOPIC_META = {
  E1: { label: 'Environmental', icon: Leaf, color: 'text-esg-e', bg: 'bg-emerald-50 dark:bg-emerald-950', border: 'border-emerald-300 dark:border-emerald-700' },
  S1: { label: 'Social', icon: Users2, color: 'text-esg-s', bg: 'bg-indigo-50 dark:bg-indigo-950', border: 'border-indigo-300 dark:border-indigo-700' },
  G1: { label: 'Governance', icon: Shield, color: 'text-esg-g', bg: 'bg-amber-50 dark:bg-amber-950', border: 'border-amber-300 dark:border-amber-700' },
};

const AUDIT_COLORS = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  verified: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400',
  flagged: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-400',
};

const AUDIT_ICONS = { verified: CheckCircle, flagged: AlertTriangle, rejected: XCircle };

export default function LineagePage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({ topic: '', orgUnitId: '', userId: '' });
  const [expanded, setExpanded] = useState({});

  const filtersKey = `${filters.topic}|${filters.orgUnitId}|${filters.userId}`;

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (filters.topic) params.topic = filters.topic;
    if (filters.orgUnitId) params.orgUnitId = filters.orgUnitId;
    if (filters.userId) params.userId = filters.userId;
    api.getLineage(params).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [filtersKey]);

  const toggle = (key) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  const handleExport = async (format) => {
    setExporting(true);
    try {
      await api.exportAuditTrail({ format, ...filters });
    } catch (err) {
      alert(err.error || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const goToUpload = (uploadId) => {
    navigate('/history');
    // The history page will show the detail when clicked
    setTimeout(() => {
      // Trigger the detail view — for now navigate to history
    }, 100);
  };

  if (loading && !data) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>;
  }

  const { tree = [], filters: filterOptions = {} } = data || {};

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-brand-600" /> Data Lineage
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Trace every piece of ESG data back to its source</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('pdf')} disabled={exporting}
            className="btn-secondary flex items-center gap-1.5 text-sm">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export PDF
          </button>
          <button onClick={() => handleExport('docx')} disabled={exporting}
            className="btn-secondary flex items-center gap-1.5 text-sm">
            <FileText className="w-4 h-4" /> Export Word
          </button>
        </div>
      </div>

      <HelpBanner id="lineage-guide" title="Audit-Ready Data Lineage" variant="info">
        This page traces every data point from its ESG topic through the organizational unit and user who uploaded it.
        Click any upload to view the transformed data and original source file. Export the full audit trail as PDF or Word
        with clickable links to source documents.
      </HelpBanner>

      {/* Filters */}
      <div className="card py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400" />

          <select className="input w-auto" value={filters.topic} onChange={(e) => setFilters({ ...filters, topic: e.target.value })}>
            <option value="">All Topics</option>
            <option value="E1">Environmental</option>
            <option value="S1">Social</option>
          </select>

          <select className="input w-auto" value={filters.orgUnitId} onChange={(e) => setFilters({ ...filters, orgUnitId: e.target.value })}>
            <option value="">All Org Units</option>
            {filterOptions.orgUnits?.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.country})</option>
            ))}
          </select>

          <select className="input w-auto" value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })}>
            <option value="">All Users</option>
            {filterOptions.users?.map((u) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>

          {(filters.topic || filters.orgUnitId || filters.userId) && (
            <button className="text-sm text-brand-600 hover:underline" onClick={() => setFilters({ topic: '', orgUnitId: '', userId: '' })}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Lineage Tree */}
      {tree.length === 0 ? (
        <div className="card text-center py-12">
          <GitBranch className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No data lineage found. Upload data to see the lineage tree.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tree.map((topic) => {
            const meta = TOPIC_META[topic.key] || TOPIC_META.E1;
            const TopicIcon = meta.icon;
            const topicKey = `topic-${topic.key}`;
            const isTopicOpen = expanded[topicKey] !== false; // default open

            const totalUploads = topic.orgUnits.reduce((s, ou) =>
              s + ou.users.reduce((s2, u) => s2 + u.uploads.length, 0), 0);

            return (
              <div key={topic.key} className={clsx('card border-l-4', meta.border)}>
                {/* Topic level */}
                <button onClick={() => toggle(topicKey)} className="w-full flex items-center gap-3">
                  <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', meta.bg)}>
                    <TopicIcon className={clsx('w-5 h-5', meta.color)} />
                  </div>
                  <div className="flex-1 text-left">
                    <h2 className="font-semibold text-lg text-gray-900 dark:text-gray-100">{topic.label}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {topic.orgUnits.length} org unit{topic.orgUnits.length !== 1 ? 's' : ''} · {totalUploads} upload{totalUploads !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {isTopicOpen ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                </button>

                {isTopicOpen && (
                  <div className="mt-4 space-y-4 ml-6 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                    {topic.orgUnits.map((ou) => {
                      const ouKey = `ou-${topic.key}-${ou.id}`;
                      const isOuOpen = expanded[ouKey] !== false;

                      return (
                        <div key={ou.id}>
                          {/* Org Unit level */}
                          <button onClick={() => toggle(ouKey)} className="flex items-center gap-2 w-full">
                            <Building2 className="w-4 h-4 text-gray-400" />
                            <span className="font-medium text-gray-800 dark:text-gray-200">{ou.name}</span>
                            <span className="text-xs text-gray-400">{ou.country}</span>
                            <span className="badge bg-gray-100 dark:bg-gray-800 text-gray-500 ml-auto">{ou.users.length} user{ou.users.length !== 1 ? 's' : ''}</span>
                            {isOuOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                          </button>

                          {isOuOpen && (
                            <div className="mt-2 space-y-3 ml-6 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                              {ou.users.map((user) => {
                                const userKey = `user-${topic.key}-${ou.id}-${user.id}`;
                                const isUserOpen = expanded[userKey] !== false;

                                return (
                                  <div key={user.id}>
                                    {/* User level */}
                                    <button onClick={() => toggle(userKey)} className="flex items-center gap-2 w-full">
                                      <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-bold">
                                        {user.name.charAt(0)}
                                      </div>
                                      <span className="font-medium text-sm text-gray-700 dark:text-gray-300">{user.name}</span>
                                      <span className="text-xs text-gray-400">{user.email}</span>
                                      <span className="badge bg-gray-100 dark:bg-gray-800 text-gray-500 ml-auto">{user.uploads.length} upload{user.uploads.length !== 1 ? 's' : ''}</span>
                                      {isUserOpen ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                                    </button>

                                    {isUserOpen && (
                                      <div className="mt-2 ml-8 space-y-1.5">
                                        {user.uploads.map((upload) => {
                                          const AuditIcon = AUDIT_ICONS[upload.auditStatus];
                                          return (
                                            <div
                                              key={upload.id}
                                              onClick={() => navigate('/history')}
                                              className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-brand-50 dark:hover:bg-brand-950 cursor-pointer transition-colors group"
                                            >
                                              <FileSpreadsheet className="w-4 h-4 text-gray-400 group-hover:text-brand-500" />
                                              <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{upload.fileName}</p>
                                                <p className="text-xs text-gray-400">
                                                  {new Date(upload.createdAt).toLocaleDateString()} · {upload.processedRows || 0} rows · {upload.recordCount} records
                                                </p>
                                              </div>
                                              <span className={`badge ${upload.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400' : upload.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {upload.status}
                                              </span>
                                              <span className={clsx('badge', AUDIT_COLORS[upload.auditStatus])}>
                                                {AuditIcon && <AuditIcon className="w-3 h-3 mr-1" />}
                                                {upload.auditStatus}
                                              </span>
                                              {upload.hasSourceFile && (
                                                <a
                                                  href={api.getFileViewUrl(upload.id, 0)}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="text-brand-500 hover:text-brand-700"
                                                  title="View source file"
                                                >
                                                  <Eye className="w-4 h-4" />
                                                </a>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="card py-3">
        <div className="flex items-center gap-6 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
          <span className="font-medium">Audit Status:</span>
          {Object.entries(AUDIT_COLORS).map(([key, cls]) => (
            <span key={key} className={clsx('badge', cls)}>{key}</span>
          ))}
          <span className="ml-auto flex items-center gap-1"><Eye className="w-3 h-3" /> = Source file available</span>
        </div>
      </div>
    </div>
  );
}
