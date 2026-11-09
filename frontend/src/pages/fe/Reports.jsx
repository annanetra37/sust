import { useEffect, useState } from 'react';
import { FileText, Download, Loader2 } from 'lucide-react';
import feApi from '../../services/feApi';
import { useT } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { HelpBanner } from '../../components/HelpSystem';
import { useFeSelection, PeriodPicker, PageHeader, ErrorBox, Notice, Field, Spinner, IllustrativeBanner, StatusBadge, fmt, fmtM, fmtT, errText } from './common';

function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[620px]">
        <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
          <tr>{head.map((h, i) => <th key={h} className={`p-2 ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b last:border-b-0 border-gray-50 dark:border-gray-800 text-gray-800 dark:text-gray-200">
              {r.map((c, i) => <td key={i} className={`p-2 ${i ? 'text-right' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Reports() {
  const { t } = useT();
  const { user } = useAuth();
  const { period, portfolio } = useFeSelection();
  const [runs, setRuns] = useState(null);
  const [runId, setRunId] = useState('');
  const [names, setNames] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const admin = user?.role === 'ADMIN';
  const base = portfolio?.baseCurrency || 'AMD';

  useEffect(() => {
    if (!period) return;
    setRuns(null); setRunId('');
    feApi.runs(period.id).then((r) => { setRuns(r); setRunId(r[0]?.id || ''); }).catch((err) => { setError(errText(err, t('fe.errors.load'))); setRuns([]); });
  }, [period, t]);

  const run = runs?.find((r) => r.id === runId);
  const tot = run?.totals;
  const dl = async (name, fn) => {
    setBusy(name); setError('');
    try { await fn(); } catch (err) { setError(errText(err, t('fe.errors.download'))); } finally { setBusy(''); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <PageHeader icon={FileText} title={t('fe.reports.title')} subtitle={t('fe.reports.subtitle')} />
      <HelpBanner id="fe-reports" title={t('fe.reports.helpTitle')}>{t('fe.reports.helpBody')}</HelpBanner>
      <PeriodPicker />
      <ErrorBox message={error} />
      {period && !runs && <Spinner />}
      {runs && runs.length === 0 && <Notice tone="warn">{t('fe.reports.noRun')}</Notice>}
      {run && (
        <>
          <div className="card !p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <Field label={t('fe.reports.run')}>
                <select className="input" value={runId} onChange={(e) => setRunId(e.target.value)}>
                  {runs.map((r, i) => <option key={r.id} value={r.id}>{new Date(r.createdAt).toLocaleString()} · {fmtT(r.totals?.absoluteFinanced)} tCO2e{i === 0 ? ` (${t('fe.reports.latest')})` : ''}</option>)}
                </select>
              </Field>
              <StatusBadge status={period.status} />
            </div>
            {period.status !== 'LOCKED' && <p className="text-xs text-amber-700 dark:text-amber-400">{t('fe.reports.draft')}</p>}
            <IllustrativeBanner factorSet={tot?.factorSet} />
            <div className="flex gap-2 flex-wrap items-center">
              <button className="btn-primary flex items-center gap-2" disabled={!!busy} onClick={() => dl('xlsx', () => feApi.downloadReport(run.id, period.name, names))}>
                {busy === 'xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{t('fe.reports.xlsx')}
              </button>
              <button className="btn-secondary flex items-center gap-2" disabled={!!busy} onClick={() => dl('csv', () => feApi.downloadExceptions(run.id, period.name))}>
                {busy === 'csv' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{t('fe.reports.exceptionsCsv')}
              </button>
              {admin && (
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} />{t('fe.reports.includeNames')}
                </label>
              )}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('fe.reports.masked')}</p>
          </div>

          <div className="card !p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{t('fe.reports.pcafTable')}</h2>
            <Table
              head={[t('fe.fields.assetClass'), `${t('fe.fields.outstanding')} (${base})`, 'tCO2e', t('fe.kpi.intensityUnit', { cur: base }), t('fe.kpi.dq'), t('fe.kpi.coverage')]}
              rows={[
                ...Object.entries(tot.byAssetClass || {}).map(([k, b]) => [t(`fe.assetClasses.${k}`), fmtM(b.outstanding), fmtT(b.financed), fmt(b.intensity, 3), fmt(b.weightedDq, 2), `${fmt(b.coveragePct, 1)}%`]),
                [t('fe.reports.total'), fmtM(tot.totalOutstanding), fmtT(tot.absoluteFinanced), fmt(tot.economicIntensity, 3), fmt(tot.weightedDq, 2), `${fmt(tot.coveragePct, 1)}%`],
              ]}
            />
            {tot.undrawnFinanced > 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t('fe.kpi.undrawn', { v: fmtT(tot.undrawnFinanced) })}</p>}
          </div>

          <div className="card !p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{t('fe.reports.sectorTable')}</h2>
            <Table
              head={[t('fe.fields.sector'), `${t('fe.reports.gross')} (${base})`, 'tCO2e', t('fe.reports.covered'), t('fe.kpi.dq')]}
              rows={Object.entries(tot.bySector || {}).map(([k, b]) => [`${k} · ${t(`fe.sectors.${k}`)}`, fmtM(b.outstanding), fmtT(b.financed), `${fmt(b.coveragePct, 1)}%`, fmt(b.weightedDq, 2)])}
            />
          </div>

          <div className="card !p-4 text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('fe.reports.methodology')}</h2>
            <p>{t('fe.reports.methodologyVersion')}: <span className="font-mono text-xs">{run.methodologyVersion}</span></p>
            <p>{t('fe.calc.factorSet')}: {tot.factorSet ? `${tot.factorSet.name} v${tot.factorSet.version} — ${tot.factorSet.source}` : '—'}</p>
            <p>{t('fe.calc.exceptions')}: {tot.exceptions}</p>
            <p className="break-all">{t('fe.calc.inputsHash')}: <span className="font-mono text-xs">{run.inputsHash}</span></p>
          </div>
        </>
      )}
    </div>
  );
}
