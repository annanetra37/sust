import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Landmark, Gauge, PieChart, ShieldCheck, Factory, Calculator, TrendingUp, TrendingDown } from 'lucide-react';
import feApi from '../../services/feApi';
import { useT } from '../../i18n';
import { HelpBanner } from '../../components/HelpSystem';
import {
  useFeSelection, PeriodPicker, PageHeader, ErrorBox, Spinner, Kpi, IllustrativeBanner, DqBadge, Field,
  useChartTheme, classColor, fmt, fmtM, fmtT, shortId, errText,
} from './common';
import LineDrawer from './LineDrawer';

function Delta({ now, prev, betterLow = true, label }) {
  if (now == null || prev == null || prev === 0) return null;
  const pct = ((now - prev) / Math.abs(prev)) * 100;
  const good = betterLow ? pct <= 0 : pct >= 0;
  const Icon = pct >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      <Icon className="w-3 h-3" />{pct > 0 ? '+' : ''}{fmt(pct, 1)}% {label}
    </span>
  );
}

function ChartCard({ title, children, sub }) {
  return (
    <div className="card !p-4 min-w-0">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
      {sub && <p className="text-[11px] text-gray-500 dark:text-gray-400">{sub}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function Overview() {
  const { t } = useT();
  const theme = useChartTheme();
  const { period, portfolio } = useFeSelection();
  const [filters, setFilters] = useState({ branch: '', segment: '', assetClass: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState(null);

  useEffect(() => { setFilters({ branch: '', segment: '', assetClass: '' }); }, [period?.id]);
  useEffect(() => {
    if (!period) return;
    setData(null); setError('');
    feApi.dashboard(period.id, filters).then(setData).catch((err) => { setError(errText(err, t('fe.errors.load'))); setData({}); });
  }, [period, filters, t]);

  const tot = data?.totals;
  const base = portfolio?.baseCurrency || 'AMD';
  const classRows = useMemo(() => Object.entries(tot?.byAssetClass || {}).map(([k, v]) => ({ key: k, name: t(`fe.assetClasses.${k}`), ...v })), [tot, t]);
  const sectorRows = useMemo(() => Object.entries(tot?.bySector || {})
    .map(([k, v]) => ({ key: k, name: k, label: t(`fe.sectors.${k}`), ...v }))
    .filter((r) => r.financed > 0)
    .sort((a, b) => b.financed - a.financed), [tot, t]);
  const dqRows = useMemo(() => {
    const total = Object.values(tot?.dqDistribution || {}).reduce((s, v) => s + v.outstanding, 0);
    return [1, 2, 3, 4, 5].map((s) => {
      const v = tot?.dqDistribution?.[s] || { lines: 0, outstanding: 0 };
      return { score: String(s), pct: total ? (v.outstanding / total) * 100 : 0, ...v };
    });
  }, [tot]);
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const prev = data?.trend;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <PageHeader icon={Landmark} title={t('fe.overview.title')} subtitle={t('fe.overview.subtitle')} />
      <HelpBanner id="fe-overview" title={t('fe.overview.helpTitle')}>{t('fe.overview.helpBody')}</HelpBanner>
      <PeriodPicker />
      <ErrorBox message={error} />
      {period && !data && <Spinner />}
      {period && data && !data.run && !error && (
        <div className="card text-center py-10 px-4">
          <Calculator className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-gray-700 dark:text-gray-300">{t('fe.overview.noRun')}</p>
          <div className="flex justify-center gap-2 mt-4 flex-wrap">
            <Link to="/fe/intake" className="btn-secondary">{t('feNav.intake')}</Link>
            <Link to="/fe/calculations" className="btn-primary">{t('feNav.calculations')}</Link>
          </div>
        </div>
      )}
      {data?.run && tot && (
        <>
          <IllustrativeBanner factorSet={data.factorSet} />

          {/* Filters — one row above the charts */}
          <div className="card !p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={t('fe.fields.branch')}>
              <select className="input" value={filters.branch} onChange={set('branch')}>
                <option value="">{t('fe.common.all')}</option>
                {data.filterOptions.branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label={t('fe.fields.segment')}>
              <select className="input" value={filters.segment} onChange={set('segment')}>
                <option value="">{t('fe.common.all')}</option>
                {data.filterOptions.segments.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label={t('fe.fields.assetClass')}>
              <select className="input" value={filters.assetClass} onChange={set('assetClass')}>
                <option value="">{t('fe.common.all')}</option>
                {data.filterOptions.assetClasses.map((b) => <option key={b} value={b}>{t(`fe.assetClasses.${b}`)}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Factory} label={t('fe.kpi.absolute')} value={fmtT(tot.absoluteFinanced)} unit="tCO2e"
              sub={!data.filtered && prev ? <Delta now={tot.absoluteFinanced} prev={prev.absoluteFinanced} label={t('fe.kpi.vs', { period: prev.periodName })} /> : null} />
            <Kpi icon={Gauge} label={t('fe.kpi.intensity')} value={fmt(tot.economicIntensity, 3)} unit={t('fe.kpi.intensityUnit', { cur: base })}
              sub={!data.filtered && prev ? <Delta now={tot.economicIntensity} prev={prev.economicIntensity} label={t('fe.kpi.vs', { period: prev.periodName })} /> : null} />
            <Kpi icon={PieChart} label={t('fe.kpi.coverage')} value={`${fmt(tot.coveragePct, 1)}%`} unit={t('fe.kpi.coverageUnit', { n: tot.exceptions })}
              sub={!data.filtered && prev ? <Delta now={tot.coveragePct} prev={prev.coveragePct} betterLow={false} label={t('fe.kpi.vs', { period: prev.periodName })} /> : null} />
            <Kpi icon={ShieldCheck} label={t('fe.kpi.dq')} value={fmt(tot.weightedDq, 2)} unit={t('fe.kpi.dqUnit')}
              sub={!data.filtered && prev ? <Delta now={tot.weightedDq} prev={prev.weightedDq} label={t('fe.kpi.vs', { period: prev.periodName })} /> : null} />
          </div>
          {tot.undrawnFinanced > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{t('fe.kpi.undrawn', { v: fmtT(tot.undrawnFinanced) })}</p>}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title={t('fe.overview.byClass')} sub="tCO2e">
              <ResponsiveContainer width="100%" height={Math.max(140, classRows.length * 44 + 30)}>
                <BarChart data={classRows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: theme.axis }} />
                  <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11, fill: theme.axis }} />
                  <Tooltip {...theme.tooltip} formatter={(v, _n, p) => [`${fmtT(v)} tCO2e · ${t('fe.kpi.coverage')} ${fmt(p.payload.coveragePct, 1)}% · DQ ${fmt(p.payload.weightedDq, 2)}`, p.payload.name]} />
                  <Bar dataKey="financed" radius={[0, 4, 4, 0]} maxBarSize={26}>
                    {classRows.map((r) => <Cell key={r.key} fill={classColor(theme, r.key)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title={t('fe.overview.dqDist')} sub={t('fe.overview.dqDistSub')}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dqRows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                  <XAxis dataKey="score" tick={{ fontSize: 11, fill: theme.axis }} tickFormatter={(s) => t('fe.overview.score', { s })} />
                  <YAxis tick={{ fontSize: 11, fill: theme.axis }} unit="%" />
                  <Tooltip {...theme.tooltip} labelFormatter={(s) => t('fe.overview.score', { s })} formatter={(v, _n, p) => [`${fmt(v, 1)}% · ${p.payload.lines} ${t('fe.common.lines')} · ${base} ${fmtM(p.payload.outstanding)}`, t('fe.overview.shareOutstanding')]} />
                  <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {dqRows.map((r) => <Cell key={r.score} fill={theme.dq[Number(r.score) - 1]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title={t('fe.overview.bySector')} sub={t('fe.overview.bySectorSub')}>
            {sectorRows.length === 0 ? <p className="text-sm text-gray-500">—</p> : (
              <ResponsiveContainer width="100%" height={Math.max(160, sectorRows.length * 30 + 30)}>
                <BarChart data={sectorRows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: theme.axis }} />
                  <YAxis type="category" dataKey="name" width={44} tick={{ fontSize: 11, fill: theme.axis }} />
                  <Tooltip {...theme.tooltip} labelFormatter={(k) => `${k} · ${t(`fe.sectors.${k}`)}`} formatter={(v, _n, p) => [`${fmtT(v)} tCO2e · ${base} ${fmtM(p.payload.outstanding)}`, t('fe.overview.financed')]} />
                  <Bar dataKey="financed" fill={theme.series[0]} radius={[0, 4, 4, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* FE-10 table view: coverage and weighted DQ per asset class */}
          <div className="card !p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <tr>
                  <th className="text-left p-3">{t('fe.fields.assetClass')}</th>
                  <th className="text-right p-3">{t('fe.fields.outstanding')} ({base})</th>
                  <th className="text-right p-3">tCO2e</th>
                  <th className="text-right p-3">{t('fe.kpi.intensity')}</th>
                  <th className="text-right p-3">{t('fe.kpi.coverage')}</th>
                  <th className="text-right p-3">{t('fe.kpi.dq')}</th>
                </tr>
              </thead>
              <tbody>
                {classRows.map((r) => (
                  <tr key={r.key} className="border-b last:border-b-0 border-gray-50 dark:border-gray-800 text-gray-800 dark:text-gray-200">
                    <td className="p-3"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-2" style={{ background: classColor(theme, r.key) }} />{r.name}</td>
                    <td className="p-3 text-right">{fmtM(r.outstanding)}</td>
                    <td className="p-3 text-right">{fmtT(r.financed)}</td>
                    <td className="p-3 text-right">{fmt(r.intensity, 3)}</td>
                    <td className="p-3 text-right">{fmt(r.coveragePct, 1)}%</td>
                    <td className="p-3 text-right">{fmt(r.weightedDq, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card !p-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white p-4 pb-2">{t('fe.overview.top')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <tr>
                    <th className="text-left p-3">#</th>
                    <th className="text-left p-3">{t('fe.fields.facilityRef')}</th>
                    <th className="text-left p-3">{t('fe.fields.counterparty')}</th>
                    <th className="text-left p-3">{t('fe.fields.assetClass')}</th>
                    <th className="text-left p-3">{t('fe.fields.sector')}</th>
                    <th className="text-right p-3">tCO2e</th>
                    <th className="text-center p-3">{t('fe.fields.dq')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top.map((l, i) => (
                    <tr key={l.exposureId} onClick={() => setDrawer(l.exposureId)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 border-b last:border-b-0 border-gray-50 dark:border-gray-800 text-gray-800 dark:text-gray-200">
                      <td className="p-3 text-gray-400">{i + 1}</td>
                      <td className="p-3 font-medium text-brand-700 dark:text-brand-300 underline-offset-2 hover:underline">{l.facilityRef}</td>
                      <td className="p-3">{l.name || <span className="font-mono text-xs">{shortId(l.stableId)}</span>}</td>
                      <td className="p-3">{t(`fe.assetClasses.${l.assetClass}`)}</td>
                      <td className="p-3">{l.sector}</td>
                      <td className="p-3 text-right">{fmtT(l.financedTotal)}</td>
                      <td className="p-3 text-center"><DqBadge score={l.dqScore} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 break-all">
            {t('fe.overview.runFooter', { date: new Date(data.run.createdAt).toLocaleString(), method: data.run.methodologyVersion })} · {data.run.outputsHash?.slice(0, 16)}…
          </p>
        </>
      )}
      {drawer && <LineDrawer exposureId={drawer} runId={data?.run?.id} onClose={() => setDrawer(null)} />}
    </div>
  );
}
