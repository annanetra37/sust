import { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle, X, Loader2, CheckCircle2, AlertTriangle, XCircle, Circle, CircleDot, FileCheck2, BadgeCheck,
  ShieldCheck, MinusCircle, Info,
} from 'lucide-react';

// ─── Formatting ─────────────────────────────────────────────────────────────

export const fmt = (n, dp = 0) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 }));
export const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
export const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const errText = (err, fallback = 'Something went wrong.') => {
  if (!err) return fallback;
  if (Array.isArray(err.errors) && err.errors.length > 1) return err.errors.join(' · ');
  return err.error || err.message || fallback;
};
export const unitLabel = (u) => (u === 'm3' ? 'm³' : u);

// Categorical palette (fixed order, validated for light and dark surfaces).
export const PALETTE = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'],
};
export function chartTheme(dark) {
  return {
    colors: dark ? PALETTE.dark : PALETTE.light,
    axis: dark ? '#9ca3af' : '#6b7280',
    grid: dark ? '#1f2937' : '#e5e7eb',
    surface: dark ? '#111827' : '#ffffff',
    label: dark ? '#f9fafb' : '#111827',
    item: dark ? '#d1d5db' : '#374151',
  };
}
export function tooltipProps(th) {
  return {
    contentStyle: { background: th.surface, border: `1px solid ${th.grid}`, borderRadius: 8, fontSize: 12 },
    labelStyle: { color: th.label, fontWeight: 600 },
    itemStyle: { color: th.item },
  };
}

// ─── Data hook ──────────────────────────────────────────────────────────────

export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await fn();
      setState({ data, loading: false, error: '' });
    } catch (err) {
      setState({ data: null, loading: false, error: errText(err) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: (data) => setState((s) => ({ ...s, data })) };
}

// ─── Layout bits ────────────────────────────────────────────────────────────

export function Loading() {
  return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-brand-500" aria-label="Loading" /></div>;
}

export function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="break-words min-w-0">{message}</span>
    </div>
  );
}

export function Note({ children, tone = 'info', icon: Icon = Info }) {
  const tones = {
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200',
    warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200',
    neutral: 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800/60 dark:border-gray-700 dark:text-gray-300',
  };
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${tones[tone]}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{hint}</span>}
    </label>
  );
}

export function Check({ label, checked, onChange, hint }) {
  return (
    <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
      <input type="checkbox" className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}{hint && <span className="block text-[11px] text-gray-500 dark:text-gray-400">{hint}</span>}</span>
    </label>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
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
          <h2 className="text-lg font-bold text-gray-900 dark:text-white min-w-0 truncate">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// Drawer from the right (criterion detail).
export function Drawer({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/40" onClick={onClose}>
      <aside className="bg-white dark:bg-gray-900 w-full sm:max-w-xl h-full shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-bold text-gray-900 dark:text-white min-w-0">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-5">{children}</div>
      </aside>
    </div>
  );
}

export function Kpi({ icon: Icon, label, value, unit, sub, children }) {
  return (
    <div className="card !p-4 min-w-0">
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}<span className="truncate">{label}</span>
      </p>
      <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{value}</p>
      {unit && <p className="text-[11px] text-gray-500 dark:text-gray-400">{unit}</p>}
      {sub && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{children}</h3>
      {right}
    </div>
  );
}

// ─── Status display (always icon + label) ──────────────────────────────────

const TONES = {
  good: { cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300', Icon: CheckCircle2 },
  warning: { cls: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300', Icon: AlertTriangle },
  critical: { cls: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300', Icon: XCircle },
  neutral: { cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', Icon: Circle },
  info: { cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300', Icon: Info },
};

export function Tone({ tone = 'neutral', children, icon }) {
  const t = TONES[tone] || TONES.neutral;
  const Icon = icon || t.Icon;
  return <span className={`badge gap-1 ${t.cls}`}><Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />{children}</span>;
}

export const ruleTone = (status) => (status === 'pass' ? 'good' : status === 'warning' ? 'warning' : 'critical');

const STATUS_STYLE = {
  not_started: { tone: 'neutral', icon: Circle },
  in_progress: { tone: 'info', icon: CircleDot },
  evidence_uploaded: { tone: 'warning', icon: FileCheck2 },
  approved: { tone: 'good', icon: BadgeCheck },
  conforms: { tone: 'good', icon: ShieldCheck },
  na: { tone: 'neutral', icon: MinusCircle },
};

export function StatusPill({ status, t }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.not_started;
  return <Tone tone={s.tone} icon={s.icon}>{t(`gk.status.${status}`)}</Tone>;
}

export function TypeBadge({ type, t }) {
  return (
    <span className={`badge ${type === 'imperative'
      ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
      : 'bg-white text-gray-700 border border-gray-300 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-600'}`}
    >
      {t(`gk.type.${type}`)}
    </span>
  );
}

export function RuleList({ rules, t, ns }) {
  return (
    <ul className="space-y-1.5">
      {rules.map((r) => (
        <li key={r.key} className="flex items-start gap-2 text-sm">
          <Tone tone={ruleTone(r.status)}>{t(`gk.rule.${r.status}`)}</Tone>
          <span className="min-w-0">
            <span className="font-medium text-gray-800 dark:text-gray-200">{t(`gk.rules.${ns}.${r.key}`)}</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">{r.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Readiness ring (single value; the number is printed in the centre).
export function Gauge({ value, size = 76, label }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${fmt(v, 1)} %`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="8" className="stroke-gray-200 dark:stroke-gray-700" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-brand-600 dark:stroke-brand-400"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900 dark:text-white">{fmt(v, 0)}%</span>
    </div>
  );
}

// Guideline % — achieved bar with a marker at the required level.
export function RequiredVsAchieved({ required, achieved, t, compact }) {
  const met = achieved >= required;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
        <span className="text-gray-600 dark:text-gray-400">{t('gk.guideline.label')}</span>
        <Tone tone={met ? 'good' : 'warning'}>{t('gk.guideline.reqAch', { req: fmt(required, 0), ach: fmt(achieved, 1) })}</Tone>
      </div>
      {!compact && (
        <div className="relative h-2 mt-2 rounded-full bg-gray-200 dark:bg-gray-700" aria-hidden="true">
          <div className="absolute inset-y-0 left-0 rounded-full bg-brand-600 dark:bg-brand-400" style={{ width: `${Math.min(100, achieved)}%` }} />
          <div className="absolute -top-1 -bottom-1 w-0.5 bg-gray-900 dark:bg-white" style={{ left: `${Math.min(100, required)}%` }} title={t('gk.guideline.required')} />
        </div>
      )}
    </div>
  );
}

export function FeeFootnote({ t }) {
  return (
    <p className="text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800 pt-3 mt-8">
      {t('gk.footer')}
    </p>
  );
}

// ─── CSV helpers ────────────────────────────────────────────────────────────

export function parseCsv(text) {
  const rows = [];
  let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim().replace(/^﻿/, ''));
  return nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function downloadText(text, fileName, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}
