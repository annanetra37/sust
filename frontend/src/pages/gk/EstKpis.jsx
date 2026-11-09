import { useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Zap, Droplets, Trash, Leaf, Recycle, Factory, BedDouble } from 'lucide-react';
import gkApi from '../../services/gkApi';
import { useTheme } from '../../context/ThemeContext';
import { Loading, ErrorBox, Kpi, Note, SectionTitle, Field, fmt, unitLabel, chartTheme, tooltipProps, useLoad } from './ui';

const METRICS = ['kwhPerGuestNight', 'litresPerGuestNight', 'wasteKgPerGuestNight', 'kgCo2ePerOccupiedRoom', 'recyclingRatePct'];

export default function KpisTab({ est, t }) {
  const { dark } = useTheme();
  const th = chartTheme(dark);
  const [period, setPeriod] = useState({ from: '', to: '' });
  const { data: k, loading, error } = useLoad(() => gkApi.kpis(est.id, period), [est.id, period.from, period.to]);
  const cmp = useLoad(() => gkApi.clientKpis(est.clientId), [est.clientId]);
  const [trend, setTrend] = useState('kwhPerGuestNight');
  const [cmpMetric, setCmpMetric] = useState('kwhPerGuestNight');

  if (loading && !k) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const i = k.intensities || {};
  const tt = tooltipProps(th);
  const cursor = { fill: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' };
  const others = (cmp.data || []).filter((x) => x.intensities?.[cmpMetric] != null);

  return (
    <div className="space-y-4">
      <div className="card !p-4 flex flex-wrap items-end gap-3">
        <Field label={t('gk.kpis.from')}><input type="month" className="input !py-1.5" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} /></Field>
        <Field label={t('gk.kpis.to')}><input type="month" className="input !py-1.5" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} /></Field>
        <p className="text-xs text-gray-500 dark:text-gray-400 pb-2">{k.period ? t('gk.kpis.periodLine', { from: k.period.from, to: k.period.to, n: k.period.months }) : t('gk.noData')}</p>
      </div>
      <Note>{t('gk.kpis.method')}</Note>

      {!k.period ? <div className="card text-sm text-gray-500 dark:text-gray-400">{t('gk.kpis.noData')}</div> : (
        <>
          <div className="grid [&>*]:min-w-0 grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={Zap} label={t('gk.kpi.kwhPerGuestNight')} value={fmt(i.kwhPerGuestNight, 1)} unit="kWh" />
            <Kpi icon={Droplets} label={t('gk.kpi.litresPerGuestNight')} value={fmt(i.litresPerGuestNight, 0)} unit="L" />
            <Kpi icon={Trash} label={t('gk.kpi.wasteKgPerGuestNight')} value={fmt(i.wasteKgPerGuestNight, 2)} unit="kg" />
            <Kpi icon={BedDouble} label={t('gk.kpi.kgCo2ePerOccupiedRoom')} value={fmt(i.kgCo2ePerOccupiedRoom, 1)} unit="kgCO₂e" />
            <Kpi icon={Recycle} label={t('gk.kpi.recyclingRatePct')} value={i.recyclingRatePct == null ? '—' : `${fmt(i.recyclingRatePct, 1)}%`} />
          </div>
          <div className="grid [&>*]:min-w-0 grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Factory} label={t('gk.kpis.scope1')} value={fmt(k.totals.scope1KgCo2e / 1000, 1)} unit="tCO₂e" />
            <Kpi icon={Zap} label={t('gk.kpis.scope2')} value={fmt(k.totals.scope2KgCo2e / 1000, 1)} unit="tCO₂e" />
            <Kpi icon={Leaf} label={t('gk.kpis.energy')} value={fmt(k.totals.kwh / 1000, 1)} unit="MWh" />
            <Kpi icon={BedDouble} label={t('gk.kpis.guestNights')} value={fmt(k.totals.guestNights)} sub={t('gk.kpis.roomNights', { n: fmt(k.totals.occupiedRooms) })} />
          </div>
          {k.totals.biogenicKgCo2 > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{t('gk.kpis.biogenic', { n: fmt(k.totals.biogenicKgCo2 / 1000, 1) })}</p>}
          {k.warnings.length > 0 && <Note tone="warning"><ul className="list-disc pl-4 space-y-0.5">{k.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Note>}
          {k.estimatedShare > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{t('gk.kpis.estimatedShare', { n: fmt(k.estimatedShare, 1) })}</p>}

          <div className="grid [&>*]:min-w-0 gap-4 lg:grid-cols-2">
            <div className="card min-w-0">
              <SectionTitle>{t('gk.kpis.emissionsTrend')}</SectionTitle>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={k.monthly} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke={th.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: th.axis }} tickFormatter={(m) => m.slice(2)} minTickGap={8} />
                  <YAxis tick={{ fontSize: 11, fill: th.axis }} width={56} tickFormatter={(v) => fmt(v)} />
                  <Tooltip {...tt} cursor={cursor} formatter={(v, n) => [`${fmt(v, 0)} kgCO₂e`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12, color: th.axis }} />
                  <Bar dataKey="scope1" name={t('gk.kpis.scope1')} stackId="s" fill={th.colors[0]} stroke={th.surface} strokeWidth={1} maxBarSize={28} />
                  <Bar dataKey="scope2" name={t('gk.kpis.scope2')} stackId="s" fill={th.colors[1]} stroke={th.surface} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card min-w-0">
              <SectionTitle right={(
                <select className="input !w-auto !py-1 text-sm" value={trend} onChange={(e) => setTrend(e.target.value)} aria-label={t('gk.portfolio.metric')}>
                  {['kwhPerGuestNight', 'litresPerGuestNight', 'kgCo2ePerOccupiedRoom'].map((m) => <option key={m} value={m}>{t(`gk.kpi.${m}`)}</option>)}
                </select>
              )}
              >
                {t('gk.kpis.intensityTrend')}
              </SectionTitle>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={k.monthly} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={th.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: th.axis }} tickFormatter={(m) => m.slice(2)} minTickGap={8} />
                  <YAxis tick={{ fontSize: 11, fill: th.axis }} width={48} />
                  <Tooltip {...tt} formatter={(v) => [fmt(v, 2), t(`gk.kpi.${trend}`)]} />
                  <Line type="monotone" dataKey={trend} name={t(`gk.kpi.${trend}`)} stroke={th.colors[0]} strokeWidth={2} dot={{ r: 4, fill: th.colors[0], stroke: th.surface, strokeWidth: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card !p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="p-2 pl-4">{t('gk.data.month')}</th><th className="p-2 text-right">kWh</th><th className="p-2 text-right">kgCO₂e</th>
                  <th className="p-2 text-right">{unitLabel('m3')}</th><th className="p-2 text-right">{t('gk.kpis.wasteKg')}</th><th className="p-2 text-right">{t('gk.kpis.guestNights')}</th><th className="p-2 pr-4 text-right">{t('gk.kpis.estimatedCol')}</th>
                </tr>
              </thead>
              <tbody>
                {k.monthly.map((m) => (
                  <tr key={m.month} className="border-b border-gray-50 dark:border-gray-800/60 tabular-nums">
                    <td className="p-2 pl-4">{m.month}</td><td className="p-2 text-right">{fmt(m.kwh)}</td><td className="p-2 text-right">{fmt(m.kgCo2e)}</td>
                    <td className="p-2 text-right">{fmt(m.waterM3, 1)}</td><td className="p-2 text-right">{fmt(m.wasteKg)}</td><td className="p-2 text-right">{fmt(m.guestNights)}</td>
                    <td className="p-2 pr-4 text-right">{m.estimated ? t('gk.data.estShort') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {k.factors.length > 0 && (
            <div className="card">
              <SectionTitle>{t('gk.kpis.factors')}</SectionTitle>
              <ul className="text-xs space-y-1.5 text-gray-600 dark:text-gray-400">
                {k.factors.map((f) => (
                  <li key={`${f.fuel}-${f.unit}`}>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{t(`gk.source.${f.fuel}`)} ({unitLabel(f.unit)})</span>: 1 {unitLabel(f.unit)} = {fmt(f.toKwh, 3)} kWh ({f.toKwhStatus}) · {fmt(f.kgCo2ePerKwh, 4)} kgCO₂e/kWh ({f.emissionStatus}) — {f.emissionSource}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {(cmp.data || []).length > 1 && (
        <div className="card min-w-0">
          <SectionTitle right={(
            <select className="input !w-auto !py-1 text-sm" value={cmpMetric} onChange={(e) => setCmpMetric(e.target.value)} aria-label={t('gk.portfolio.metric')}>
              {METRICS.map((m) => <option key={m} value={m}>{t(`gk.kpi.${m}`)}</option>)}
            </select>
          )}
          >
            {t('gk.kpis.compare', { client: est.client.name })}
          </SectionTitle>
          <ResponsiveContainer width="100%" height={Math.max(140, (cmp.data || []).length * 40 + 30)}>
            <BarChart data={(cmp.data || []).map((x) => ({ name: x.name, value: x.intensities?.[cmpMetric] ?? null, current: x.establishmentId === est.id }))} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={th.grid} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: th.axis }} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11, fill: th.axis }} tickFormatter={(n) => (n.length > 26 ? `${n.slice(0, 25)}…` : n)} />
              <Tooltip {...tt} cursor={cursor} formatter={(v) => [fmt(v, 2), t(`gk.kpi.${cmpMetric}`)]} />
              <Bar dataKey="value" name={t(`gk.kpi.${cmpMetric}`)} fill={th.colors[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
          {others.length === 0 && <p className="text-xs text-gray-500">{t('gk.noData')}</p>}
        </div>
      )}
    </div>
  );
}
