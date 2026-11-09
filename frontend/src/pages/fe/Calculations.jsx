import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, Play, Loader2, ShieldCheck, ShieldAlert, Download, AlertTriangle } from 'lucide-react';
import feApi from '../../services/feApi';
import { useT } from '../../i18n';
import { HelpBanner } from '../../components/HelpSystem';
import {
  useFeSelection, PeriodPicker, PageHeader, ErrorBox, Notice, Field, FrozenNotice, Spinner, Pager, IllustrativeBanner, fmt, fmtT, errText,
} from './common';
import LineDrawer from './LineDrawer';

export default function Calculations() {
  const { t } = useT();
  const { period } = useFeSelection();
  const [sets, setSets] = useState([]);
  const [setId, setSetId] = useState('');
  const [runs, setRuns] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verify, setVerify] = useState({}); // runId → result | 'busy'
  const [exceptions, setExceptions] = useState(null);
  const [exPage, setExPage] = useState(1);
  const [drawer, setDrawer] = useState(null);
  const frozen = period && period.status !== 'OPEN';
  const latest = runs?.[0];

  const loadRuns = useCallback(() => {
    if (!period) return;
    feApi.runs(period.id).then(setRuns).catch((err) => { setError(errText(err, t('fe.errors.load'))); setRuns([]); });
  }, [period, t]);
  useEffect(() => { setRuns(null); setVerify({}); setExPage(1); loadRuns(); }, [loadRuns]);
  useEffect(() => { feApi.factorSets().then(setSets).catch(() => setSets([])); }, []);
  useEffect(() => {
    if (!latest) { setExceptions(null); return; }
    feApi.runResults(latest.id, { exceptions: '1', page: exPage, pageSize: 25 }).then(setExceptions).catch(() => setExceptions(null));
  }, [latest, exPage]);
  useEffect(() => { if (latest?.factorSetId && !setId) setSetId(latest.factorSetId); }, [latest, setId]);

  const run = async () => {
    setBusy(true); setError('');
    try { await feApi.startRun(period.id, setId || undefined); setExPage(1); loadRuns(); } catch (err) { setError(errText(err, t('fe.errors.run'))); } finally { setBusy(false); }
  };
  const doVerify = async (r) => {
    setVerify((v) => ({ ...v, [r.id]: 'busy' }));
    try { const res = await feApi.verifyRun(r.id); setVerify((v) => ({ ...v, [r.id]: res })); } catch (err) { setVerify((v) => ({ ...v, [r.id]: { error: errText(err, t('fe.errors.run')) } })); }
  };
  const selectedSet = sets.find((s) => s.id === setId);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <PageHeader icon={Calculator} title={t('fe.calc.title')} subtitle={t('fe.calc.subtitle')} />
      <HelpBanner id="fe-calc" title={t('fe.calc.helpTitle')}>{t('fe.calc.helpBody')}</HelpBanner>
      <PeriodPicker />
      {period && (
        <>
          <FrozenNotice period={period} />
          <ErrorBox message={error} />
          <div className="card !p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <Field label={t('fe.calc.factorSet')} hint={sets.length ? null : t('fe.calc.noSets')}>
                <select className="input" value={setId} onChange={(e) => setSetId(e.target.value)} disabled={frozen}>
                  <option value="">{t('fe.calc.defaultSet')}</option>
                  {sets.map((s) => <option key={s.id} value={s.id}>{s.name} v{s.version}{s.illustrative ? ` — ${t('fe.factors.illustrativeTag')}` : ''}</option>)}
                </select>
              </Field>
              <button className="btn-primary flex items-center justify-center gap-2" onClick={run} disabled={busy || frozen}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}{t('fe.calc.run')}
              </button>
            </div>
            {selectedSet?.illustrative && <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{t('fe.calc.illustrativeChosen')}</p>}
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('fe.calc.methodNote')}</p>
          </div>

          {latest && <IllustrativeBanner factorSet={latest.totals?.factorSet} />}

          <div className="card !p-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white p-4 pb-2">{t('fe.calc.history')}</h2>
            {!runs ? <Spinner /> : runs.length === 0 ? <p className="text-sm text-gray-500 px-4 pb-4">{t('fe.calc.noRuns')}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[860px]">
                  <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <tr>
                      <th className="text-left p-3">{t('fe.intake.date')}</th>
                      <th className="text-left p-3">{t('fe.calc.methodology')}</th>
                      <th className="text-left p-3">{t('fe.calc.factorSet')}</th>
                      <th className="text-right p-3">tCO2e</th>
                      <th className="text-right p-3">{t('fe.kpi.coverage')}</th>
                      <th className="text-right p-3">{t('fe.kpi.dq')}</th>
                      <th className="text-right p-3">{t('fe.calc.exceptions')}</th>
                      <th className="text-left p-3">{t('fe.calc.hashes')}</th>
                      <th className="text-left p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => {
                      const v = verify[r.id];
                      const fs = r.totals?.factorSet;
                      return (
                        <tr key={r.id} className="border-b last:border-b-0 border-gray-50 dark:border-gray-800 text-gray-800 dark:text-gray-200 align-top">
                          <td className="p-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                          <td className="p-3 font-mono text-xs">{r.methodologyVersion}</td>
                          <td className="p-3">{fs ? `${fs.name} v${fs.version}` : '—'}{fs?.illustrative && <span className="badge ml-1 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">{t('fe.factors.illustrativeTag')}</span>}</td>
                          <td className="p-3 text-right">{fmtT(r.totals?.absoluteFinanced)}</td>
                          <td className="p-3 text-right">{fmt(r.totals?.coveragePct, 1)}%</td>
                          <td className="p-3 text-right">{fmt(r.totals?.weightedDq, 2)}</td>
                          <td className="p-3 text-right">{r.totals?.exceptions ?? '—'}</td>
                          <td className="p-3 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                            <span title={r.inputsHash}>in {r.inputsHash.slice(0, 10)}…</span><br /><span title={r.outputsHash}>out {r.outputsHash?.slice(0, 10)}…</span>
                          </td>
                          <td className="p-3 min-w-[9rem]">
                            <button className="btn-secondary !px-2 !py-1 text-xs flex items-center gap-1" onClick={() => doVerify(r)} disabled={v === 'busy'}>
                              {v === 'busy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}{t('fe.calc.verify')}
                            </button>
                            {v && v !== 'busy' && (v.error ? <p className="text-xs text-red-600 mt-1">{v.error}</p> : v.reproducible
                              ? <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />{t('fe.calc.reproducible')}</p>
                              : <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 flex items-start gap-1"><ShieldAlert className="w-3.5 h-3.5 shrink-0" />{v.inputsMatch ? t('fe.calc.outputsDiffer') : t('fe.calc.inputsChanged')}</p>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {latest && (
            <div className="card !p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('fe.calc.exceptionsTitle', { n: exceptions?.total ?? latest.totals?.exceptions ?? 0 })}</h2>
                <div className="flex gap-2 flex-wrap">
                  {latest.totals?.unmapped > 0 && <Link to="/fe/factors" className="btn-secondary !px-3 !py-1.5 text-sm">{t('fe.calc.toUnmapped', { n: latest.totals.unmapped })}</Link>}
                  <button className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-1.5" onClick={() => feApi.downloadExceptions(latest.id, period.name).catch((err) => setError(errText(err, t('fe.errors.download'))))}><Download className="w-4 h-4" />CSV</button>
                </div>
              </div>
              {!exceptions ? <Spinner /> : exceptions.total === 0 ? <Notice tone="ok">{t('fe.calc.noExceptions')}</Notice> : (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                      <tr><th className="text-left p-2">{t('fe.fields.facilityRef')}</th><th className="text-left p-2">{t('fe.fields.assetClass')}</th><th className="text-right p-2">{t('fe.fields.outstanding')}</th><th className="text-left p-2">{t('fe.calc.reason')}</th></tr>
                    </thead>
                    <tbody>
                      {exceptions.rows.map((r) => (
                        <tr key={r.id} className="border-b last:border-b-0 border-gray-50 dark:border-gray-800 text-gray-800 dark:text-gray-200">
                          <td className="p-2"><button className="font-medium text-brand-700 dark:text-brand-300 hover:underline" onClick={() => setDrawer(r.exposure.id)}>{r.exposure.facilityRef}</button></td>
                          <td className="p-2">{t(`fe.assetClasses.${r.exposure.assetClass}`)}</td>
                          <td className="p-2 text-right whitespace-nowrap">{r.exposure.currency} {fmt(r.exposure.outstanding)}</td>
                          <td className="p-2">{r.exception}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pager page={exceptions.page} pageSize={exceptions.pageSize} total={exceptions.total} onPage={setExPage} />
                </div>
              )}
            </div>
          )}
        </>
      )}
      {drawer && <LineDrawer exposureId={drawer} runId={latest?.id} onClose={() => setDrawer(null)} />}
    </div>
  );
}
