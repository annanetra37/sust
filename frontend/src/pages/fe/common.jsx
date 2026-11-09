import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Loader2, X, Lock, Eye, CircleDot } from 'lucide-react';
import feApi from '../../services/feApi';
import { useT } from '../../i18n';
import { useTheme } from '../../context/ThemeContext';

// ─── Formatting ─────────────────────────────────────────────────────────────

export const fmt = (n, dp = 0) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 }));
export const fmtM = (n) => (n == null || !isFinite(n) ? '—' : `${fmt(n / 1e6, n >= 1e8 ? 0 : 1)}M`);
export const fmtT = (n) => (n == null ? '—' : fmt(n, Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 1 ? 1 : 3));
export const errText = (err, fallback) => err?.error || err?.message || fallback;
export const shortId = (id) => (id ? `${id.slice(0, 10)}…` : '—');
export const ASSET_CLASSES = ['business_loans', 'commercial_re', 'mortgages', 'motor_vehicle', 'project_finance'];

// ─── Chart palette (fixed order; validated for light and dark surfaces) ─────

const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'],
};
// Ordinal single-hue (blue) ramp for PCAF scores 1 (best) → 5.
const DQ_RAMP = {
  light: ['#104281', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef'],
  dark: ['#b7d3f6', '#6da7ec', '#3987e5', '#256abf', '#184f95'],
};

export function useChartTheme() {
  const { dark } = useTheme();
  return useMemo(() => ({
    dark,
    series: dark ? CATEGORICAL.dark : CATEGORICAL.light,
    dq: dark ? DQ_RAMP.dark : DQ_RAMP.light,
    axis: dark ? '#9ca3af' : '#6b7280',
    grid: dark ? '#1f2937' : '#e5e7eb',
    surface: dark ? '#111827' : '#ffffff',
    tooltip: {
      contentStyle: { background: dark ? '#111827' : '#ffffff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 8, fontSize: 12 },
      labelStyle: { color: dark ? '#f9fafb' : '#111827', fontWeight: 600 },
      itemStyle: { color: dark ? '#d1d5db' : '#374151' },
      cursor: { fill: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
    },
  }), [dark]);
}

// Asset classes keep their colour whatever the filter (colour follows entity).
export function classColor(theme, cls) {
  return theme.series[Math.max(0, ASSET_CLASSES.indexOf(cls)) % theme.series.length];
}

// ─── Selection: portfolio + period (shared by all FE pages) ─────────────────

const SelectionContext = createContext(null);
const KEY = 'fe-selection';

function readStored() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

export function FeSelectionProvider({ children }) {
  const [portfolios, setPortfolios] = useState(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState(readStored);

  const reload = useCallback(async () => {
    try {
      const list = await feApi.portfolios();
      setPortfolios(list);
      setError('');
      return list;
    } catch (err) {
      setError(errText(err, 'Failed to load portfolios.'));
      setPortfolios([]);
      return [];
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const portfolio = portfolios?.find((p) => p.id === sel.portfolioId) || portfolios?.[0] || null;
  const period = portfolio?.periods.find((p) => p.id === sel.periodId) || portfolio?.periods[0] || null;

  const select = useCallback((next) => {
    setSel((cur) => {
      const v = { ...cur, ...next };
      try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
      return v;
    });
  }, []);

  const value = useMemo(() => ({
    portfolios, portfolio, period, error, reload,
    setPortfolioId: (portfolioId) => select({ portfolioId, periodId: null }),
    setPeriodId: (periodId) => select({ periodId }),
    select,
  }), [portfolios, portfolio, period, error, reload, select]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export const useFeSelection = () => useContext(SelectionContext);

// ─── Shared UI ──────────────────────────────────────────────────────────────

export function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="break-words min-w-0">{message}</span>
    </div>
  );
}

export function Notice({ children, tone = 'info' }) {
  const tones = {
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200',
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200',
    warn: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200',
  };
  return <div className={`p-3 rounded-lg border text-sm ${tones[tone]}`}>{children}</div>;
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-0.5">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className={`bg-white dark:bg-gray-900 w-full ${wide ? 'sm:max-w-4xl' : 'sm:max-w-2xl'} rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white min-w-0 break-words">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2 flex-wrap">{footer}</div>}
      </div>
    </div>
  );
}

export function Kpi({ icon: Icon, label, value, unit, sub }) {
  return (
    <div className="card !p-4 min-w-0">
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />}{label}
      </p>
      <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-white break-words">{value}</p>
      {unit && <p className="text-[11px] text-gray-500 dark:text-gray-400">{unit}</p>}
      {sub && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;
}

export function PageHeader({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          {Icon && <Icon className="w-6 h-6 text-brand-600 dark:text-brand-400 shrink-0" />}{title}
        </h1>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex gap-2 flex-wrap">{children}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const { t } = useT();
  const tone = {
    OPEN: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    IN_REVIEW: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    LOCKED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  }[status] || 'bg-gray-100 text-gray-700';
  const Icon = status === 'LOCKED' ? Lock : status === 'IN_REVIEW' ? Eye : CircleDot;
  return <span className={`badge gap-1 ${tone}`}><Icon className="w-3 h-3" />{t(`fe.status.${status}`)}</span>;
}

export function DqBadge({ score }) {
  const theme = useChartTheme();
  if (score == null) return <span className="text-gray-400">—</span>;
  const bg = theme.dq[score - 1];
  const light = theme.dark ? score <= 2 : score >= 4;
  return <span className="badge font-semibold" style={{ background: bg, color: light ? '#0b1b33' : '#ffffff' }}>{score}</span>;
}

// Warning whenever a result was computed with an illustrative factor set.
export function IllustrativeBanner({ factorSet }) {
  const { t } = useT();
  if (!factorSet || !factorSet.illustrative) return null;
  return (
    <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border-2 border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:border-amber-600 dark:text-amber-100 text-sm">
      <AlertTriangle className="w-5 h-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{t('fe.illustrative.title')}</p>
        <p className="break-words">{t('fe.illustrative.body', { set: `${factorSet.name} v${factorSet.version}` })}</p>
      </div>
    </div>
  );
}

export function FrozenNotice({ period }) {
  const { t } = useT();
  if (!period || period.status === 'OPEN') return null;
  return <Notice tone="warn"><span className="flex items-center gap-2"><Lock className="w-4 h-4 shrink-0" />{t(period.status === 'LOCKED' ? 'fe.frozen.locked' : 'fe.frozen.review')}</span></Notice>;
}

// Portfolio + period selector shown at the top of every period-based page.
export function PeriodPicker() {
  const { t } = useT();
  const { portfolios, portfolio, period, setPortfolioId, setPeriodId } = useFeSelection();
  if (!portfolios) return null;
  if (!portfolios.length || !period) {
    return (
      <Notice>
        {t('fe.picker.empty')} <Link to="/fe/portfolios" className="font-semibold underline">{t('fe.picker.setup')}</Link>
      </Notice>
    );
  }
  return (
    <div className="card !p-3 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[10rem]">
        <Field label={t('fe.picker.portfolio')}>
          <select className="input" value={portfolio.id} onChange={(e) => setPortfolioId(e.target.value)}>
            {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex-1 min-w-[8rem]">
        <Field label={t('fe.picker.period')}>
          <select className="input" value={period.id} onChange={(e) => setPeriodId(e.target.value)}>
            {portfolio.periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="pb-2"><StatusBadge status={period.status} /></div>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const { t } = useT();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-gray-600 dark:text-gray-400 pt-3">
      <button className="btn-secondary !px-3 !py-1" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
      <span>{t('fe.common.pageOf', { page, pages })}</span>
      <button className="btn-secondary !px-3 !py-1" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
    </div>
  );
}
