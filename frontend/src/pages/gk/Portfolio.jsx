import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Hotel, Building2, Gauge as GaugeIcon, AlertTriangle, CalendarClock, Award, Plus, ArrowRight, Trophy } from 'lucide-react';
import gkApi from '../../services/gkApi';
import { useT } from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import {
  Loading, ErrorBox, Kpi, Gauge, RequiredVsAchieved, Tone, Note, SectionTitle, fmt, fmtDate, chartTheme, tooltipProps, useLoad,
} from './ui';

export function certTone(status) {
  if (status === 'certified') return 'good';
  if (status === 'applied') return 'info';
  if (status === 'suspended' || status === 'expired' || status === 'withdrawn') return 'critical';
  return 'neutral';
}

export default function Portfolio() {
  const { t } = useT();
  const { dark } = useTheme();
  const { data, loading, error } = useLoad(() => gkApi.portfolio(), []);
  const [metric, setMetric] = useState('kwhPerGuestNight');
  const [alertFilter, setAlertFilter] = useState('all');

  const th = chartTheme(dark);
  const league = useMemo(() => {
    if (!data) return [];
    return [...data.league].filter((r) => r[metric] != null).sort((a, b) => a[metric] - b[metric]);
  }, [data, metric]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;

  const alerts = data.alerts.filter((a) => alertFilter === 'all' || a.severity === alertFilter);
  const expiring = data.establishments.filter((e) => e.certificate && e.certificate.validTo).sort((a, b) => a.certificate.validTo.localeCompare(b.certificate.validTo));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('gk.portfolio.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('gk.portfolio.subtitle')}</p>
        </div>
        <Link to="/gk/clients" className="btn-primary inline-flex items-center gap-1.5"><Plus className="w-4 h-4" />{t('gk.portfolio.addEstablishment')}</Link>
      </div>

      <Note>{t('gk.portfolio.intro')}</Note>

      {data.establishments.length === 0 ? (
        <div className="card text-center py-12">
          <Hotel className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-gray-700 dark:text-gray-300 font-medium">{t('gk.portfolio.empty')}</p>
          <Link to="/gk/clients" className="btn-primary inline-block mt-4">{t('gk.portfolio.startClient')}</Link>
        </div>
      ) : (
        <>
          <div className="grid [&>*]:min-w-0 grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Building2} label={t('gk.portfolio.establishments')} value={data.totals.establishments} sub={t('gk.portfolio.clientsN', { n: data.totals.clients })} />
            <Kpi icon={GaugeIcon} label={t('gk.portfolio.avgReadiness')} value={`${fmt(data.totals.avgReadiness, 1)}%`} />
            <Kpi icon={AlertTriangle} label={t('gk.portfolio.imperativeGaps')} value={data.totals.imperativeGaps} />
            <Kpi icon={CalendarClock} label={t('gk.portfolio.criticalAlerts')} value={data.totals.criticalAlerts} />
          </div>

          <div className="grid [&>*]:min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.establishments.map((e) => (
              <Link key={e.id} to={`/gk/establishments/${e.id}`} className="card !p-4 hover:border-brand-300 dark:hover:border-brand-700 transition-colors flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <Gauge value={e.readinessPct} label={t('gk.readiness')} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">{e.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{e.client.name}{e.city ? ` · ${e.city}` : ''}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Tone tone={e.imperativeGaps ? 'critical' : 'good'}>{t('gk.portfolio.gapsN', { n: e.imperativeGaps })}</Tone>
                      {e.certificate
                        ? <Tone tone={certTone(e.certificate.status)} icon={Award}>{t(`gk.certStatus.${e.certificate.status}`)}{e.certificate.validTo ? ` · ${e.certificate.validTo}` : ''}</Tone>
                        : <Tone tone="neutral" icon={Award}>{t('gk.portfolio.noCert')}</Tone>}
                    </div>
                  </div>
                </div>
                <RequiredVsAchieved required={e.guideline.requiredPct} achieved={e.guideline.achievedPct} t={t} />
                <div className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5 min-h-[2rem]">
                  <CalendarClock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {e.nextDeadline ? <span className="min-w-0"><span className="font-medium">{e.nextDeadline.date}</span> · {e.nextDeadline.label}</span> : <span>{t('gk.portfolio.noDeadline')}</span>}
                </div>
              </Link>
            ))}
          </div>

          <div className="grid [&>*]:min-w-0 gap-4 lg:grid-cols-5">
            <div className="card lg:col-span-3 min-w-0">
              <SectionTitle right={(
                <select className="input !w-auto !py-1 text-sm" value={metric} onChange={(ev) => setMetric(ev.target.value)} aria-label={t('gk.portfolio.metric')}>
                  {['kwhPerGuestNight', 'kgCo2ePerOccupiedRoom', 'litresPerGuestNight', 'recyclingRatePct'].map((m) => <option key={m} value={m}>{t(`gk.kpi.${m}`)}</option>)}
                </select>
              )}
              >
                <span className="inline-flex items-center gap-1.5"><Trophy className="w-4 h-4" />{t('gk.portfolio.league')}</span>
              </SectionTitle>
              {league.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">{t('gk.portfolio.noKpis')}</p> : (
                <>
                  <ResponsiveContainer width="100%" height={Math.max(140, league.length * 38 + 30)}>
                    <BarChart data={league} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={th.grid} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: th.axis }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: th.axis }} width={160} tickFormatter={(n) => (n.length > 26 ? `${n.slice(0, 25)}…` : n)} />
                      <Tooltip {...tooltipProps(th)} cursor={{ fill: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }} formatter={(v) => [fmt(v, 2), t(`gk.kpi.${metric}`)]} />
                      <Bar dataKey={metric} name={t(`gk.kpi.${metric}`)} fill={th.colors[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto mt-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                          <th className="py-2 pr-2">#</th><th className="py-2 pr-2">{t('gk.establishment')}</th>
                          <th className="py-2 pr-2 text-right">{t('gk.kpi.kwhPerGuestNight')}</th>
                          <th className="py-2 pr-2 text-right">{t('gk.kpi.kgCo2ePerOccupiedRoom')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {league.map((r, i) => (
                          <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800/60">
                            <td className="py-1.5 pr-2 text-gray-500">{i + 1}</td>
                            <td className="py-1.5 pr-2"><Link to={`/gk/establishments/${r.id}/kpis`} className="text-brand-700 dark:text-brand-300 hover:underline">{r.name}</Link></td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.kwhPerGuestNight, 1)}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.kgCo2ePerOccupiedRoom, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="card lg:col-span-2 min-w-0">
              <SectionTitle right={<Link to="/gk/certificates" className="text-xs text-brand-700 dark:text-brand-300 inline-flex items-center gap-1 hover:underline">{t('gk.portfolio.calendar')}<ArrowRight className="w-3 h-3" /></Link>}>
                {t('gk.portfolio.expiries')}
              </SectionTitle>
              {expiring.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">{t('gk.portfolio.noCerts')}</p> : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {expiring.map((e) => (
                    <li key={e.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-gray-800 dark:text-gray-200">{e.name}</span>
                      <Tone tone={e.certificate.daysToExpiry < 0 ? 'critical' : e.certificate.daysToExpiry <= 90 ? 'warning' : 'good'}>{fmtDate(e.certificate.validTo)}</Tone>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card">
            <SectionTitle right={(
              <div className="flex gap-1" role="group" aria-label={t('gk.portfolio.filterAlerts')}>
                {['all', 'critical', 'warning'].map((f) => (
                  <button key={f} type="button" onClick={() => setAlertFilter(f)} className={`px-2.5 py-1 rounded-lg text-xs border ${alertFilter === f ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                    {t(`gk.portfolio.alertFilter.${f}`)}
                  </button>
                ))}
              </div>
            )}
            >
              {t('gk.portfolio.alerts')} ({alerts.length})
            </SectionTitle>
            {alerts.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">{t('gk.portfolio.noAlerts')}</p> : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {alerts.map((a, i) => (
                  <li key={`${a.establishmentId}-${a.key}-${i}`} className="py-2 flex flex-wrap items-start gap-2 text-sm">
                    <Tone tone={a.severity === 'critical' ? 'critical' : 'warning'}>{t(`gk.severity.${a.severity}`)}</Tone>
                    <Link to={`/gk/establishments/${a.establishmentId}`} className="font-medium text-gray-900 dark:text-white hover:underline">{a.establishmentName}</Link>
                    <span className="text-gray-600 dark:text-gray-400 min-w-0">{a.text}{a.due ? ` (${a.due})` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
