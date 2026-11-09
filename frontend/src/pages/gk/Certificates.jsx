import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Award, CalendarDays } from 'lucide-react';
import gkApi from '../../services/gkApi';
import { useT } from '../../i18n';
import { Loading, ErrorBox, Tone, Note, SectionTitle, fmtDate, useLoad } from './ui';
import { certTone } from './Portfolio';

export function windowTone(state) {
  return state === 'open' ? 'warning' : state === 'overdue' ? 'critical' : state === 'done' ? 'good' : 'neutral';
}

export default function Certificates() {
  const { t } = useT();
  const { data, loading, error } = useLoad(() => gkApi.certificates(), []);

  const months = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    for (const c of data) {
      for (const [kind, date] of [
        ['expiry', c.timers.validTo],
        ['surveillance', c.timers.surveillance && c.timers.surveillance.state !== 'done' ? c.timers.surveillance.from : null],
        ['renewal', c.timers.renewal ? c.timers.renewal.from : null],
      ]) {
        if (!date || !['certified', 'suspended'].includes(c.timers.effectiveStatus) && kind !== 'expiry') continue;
        const key = date.slice(0, 7);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ kind, date, cert: c });
      }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, items]) => ({ month, items: items.sort((a, b) => a.date.localeCompare(b.date)) }));
  }, [data]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('gk.certs.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('gk.certs.subtitle')}</p>
      </div>
      <Note>{t('gk.certs.rules')}</Note>
      {data.length === 0 ? (
        <div className="card text-center py-12"><Award className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" /><p className="mt-3 text-gray-600 dark:text-gray-400">{t('gk.certs.empty')}</p></div>
      ) : (
        <>
          <div className="card !p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="p-3">{t('gk.establishment')}</th><th className="p-3">{t('gk.certs.period')}</th><th className="p-3">{t('gk.certs.status')}</th>
                  <th className="p-3">{t('gk.certs.validity')}</th><th className="p-3">{t('gk.certs.surveillance')}</th><th className="p-3">{t('gk.certs.renewal')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800/60 align-top">
                    <td className="p-3">
                      <Link to={`/gk/establishments/${c.establishment.id}/audit`} className="font-medium text-brand-700 dark:text-brand-300 hover:underline">{c.establishment.name}</Link>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{c.establishment.client.name}</p>
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">{c.periodNumber} · {c.criteriaVersion}</td>
                    <td className="p-3"><Tone tone={certTone(c.timers.effectiveStatus)}>{t(`gk.certStatus.${c.timers.effectiveStatus}`)}</Tone></td>
                    <td className="p-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtDate(c.timers.validFrom)} → {fmtDate(c.timers.validTo)}
                      {c.timers.daysToExpiry != null && <p className="text-xs text-gray-500 dark:text-gray-400">{c.timers.daysToExpiry >= 0 ? t('gk.certs.daysLeft', { n: c.timers.daysToExpiry }) : t('gk.certs.expiredAgo', { n: -c.timers.daysToExpiry })}</p>}
                    </td>
                    <td className="p-3">{c.timers.surveillance ? <><Tone tone={windowTone(c.timers.surveillance.state)}>{t(`gk.window.${c.timers.surveillance.state}`)}</Tone><p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{c.timers.surveillance.from} → {c.timers.surveillance.to}</p></> : '—'}</td>
                    <td className="p-3">{c.timers.renewal ? <><Tone tone={windowTone(c.timers.renewal.state)}>{t(`gk.window.${c.timers.renewal.state}`)}</Tone><p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{c.timers.renewal.from} → {c.timers.renewal.to}</p></> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <SectionTitle><span className="inline-flex items-center gap-1.5"><CalendarDays className="w-4 h-4" />{t('gk.certs.calendar')}</span></SectionTitle>
            <ol className="space-y-4">
              {months.map(({ month, items }) => (
                <li key={month} className={`border-l-2 pl-3 ${month === thisMonth ? 'border-brand-600' : 'border-gray-200 dark:border-gray-700'}`}>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{month}{month === thisMonth ? ` · ${t('gk.certs.thisMonth')}` : ''}</p>
                  <ul className="mt-1 space-y-1">
                    {items.map((it, i) => (
                      <li key={i} className="text-sm flex flex-wrap items-center gap-2">
                        <span className="tabular-nums text-gray-500 dark:text-gray-400">{it.date}</span>
                        <Tone tone={it.kind === 'expiry' ? (it.date < new Date().toISOString().slice(0, 10) ? 'critical' : 'warning') : 'info'}>{t(`gk.certs.event.${it.kind}`)}</Tone>
                        <span className="text-gray-800 dark:text-gray-200">{it.cert.establishment.name}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
