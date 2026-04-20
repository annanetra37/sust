import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import {
  Loader2, AlertCircle, CheckCircle, Clock, Sparkles, ChevronDown, ChevronUp,
} from 'lucide-react';

const CATEGORY_COLORS = {
  environmental: 'border-l-emerald-500',
  social: 'border-l-indigo-500',
  governance: 'border-l-amber-500',
  product: 'border-l-brand-500',
};

const CATEGORY_LABELS = {
  environmental: 'Environmental',
  social: 'Social',
  governance: 'Governance',
  product: 'Product',
};

export default function SectorKpiTiles({ year, className = '' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getSectorKpis(year).then((d) => {
      if (!cancelled) setData(d);
    }).catch(() => {
      if (!cancelled) setData(null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [year]);

  if (loading) return null;
  if (!data || !data.selected || data.kpis.length === 0) return null;

  const grouped = {};
  for (const kpi of data.kpis) {
    const cat = kpi.category || 'product';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(kpi);
  }

  const computedKpis = data.kpis.filter((k) => k.computed);
  const pendingKpis = data.kpis.filter((k) => !k.computed);
  const visiblePending = expanded ? pendingKpis : pendingKpis.slice(0, 3);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-500" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {data.packName} KPIs
          </h3>
          <span className="text-[10px] text-gray-400">v{data.packVersion}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" /> {data.summary.computedKpis} computed
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-500" /> {data.summary.pendingKpis} pending
          </span>
        </div>
      </div>

      {/* Frameworks */}
      <div className="flex flex-wrap gap-1">
        {data.frameworks.map((f) => (
          <span key={f} className="text-[9px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">
            {f}
          </span>
        ))}
      </div>

      {/* Computed KPIs — prominent tiles */}
      {computedKpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {computedKpis.map((kpi) => (
            <div
              key={kpi.id}
              className={`rounded-lg border-l-4 ${CATEGORY_COLORS[kpi.category]} bg-white dark:bg-gray-900 shadow-sm p-3`}
            >
              <p className="text-[10px] font-mono text-gray-400 mb-0.5">{kpi.code}</p>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 line-clamp-2">{kpi.name}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
                {typeof kpi.value === 'number' ? kpi.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : kpi.value}
                {kpi.unit && !kpi.unit.includes('narrative') && (
                  <span className="text-xs font-normal text-gray-400 ml-1">{kpi.unit.split(';')[0]}</span>
                )}
              </p>
              {kpi.detail && <p className="text-[10px] text-gray-400 mt-0.5">{kpi.detail}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Pending KPIs — compact list */}
      {pendingKpis.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-500" />
            Not yet reported ({pendingKpis.length})
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
            {visiblePending.map((kpi) => (
              <div
                key={kpi.id}
                className={`flex items-center gap-2 p-2 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50`}
              >
                <div className={`w-1 h-8 rounded-full ${CATEGORY_COLORS[kpi.category]?.replace('border-l-', 'bg-') || 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-mono text-gray-400">{kpi.code}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{kpi.name}</p>
                </div>
                <span className="text-[9px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded shrink-0">
                  {kpi.framework}
                </span>
              </div>
            ))}
          </div>
          {pendingKpis.length > 3 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-brand-600 hover:underline flex items-center gap-1 mt-1"
            >
              {expanded ? <><ChevronUp className="w-3 h-3" /> Show fewer</> : <><ChevronDown className="w-3 h-3" /> Show all {pendingKpis.length}</>}
            </button>
          )}
        </div>
      )}

      {/* Summary bar */}
      <div className="flex items-center gap-4 text-[10px] text-gray-400 pt-1 border-t dark:border-gray-800">
        {data.summary.totalEmissions > 0 && <span>Emissions: {data.summary.totalEmissions.toFixed(1)} tCO2e</span>}
        {data.summary.totalEmployees > 0 && <span>Employees: {data.summary.totalEmployees}</span>}
        {data.summary.productCount > 0 && <span>Products: {data.summary.productCount}</span>}
        {data.summary.pcfCoveragePct > 0 && <span>PCF coverage: {data.summary.pcfCoveragePct.toFixed(0)}%</span>}
        {data.summary.hasSbti && <span>SBTi: active</span>}
      </div>
    </div>
  );
}
