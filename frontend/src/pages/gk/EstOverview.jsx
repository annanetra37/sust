import { Link } from 'react-router-dom';
import { ListChecks, AlertTriangle, CalendarClock, Database, Award, Zap, Droplets, Leaf } from 'lucide-react';
import gkApi from '../../services/gkApi';
import {
  Loading, ErrorBox, Kpi, Gauge, RequiredVsAchieved, Tone, StatusPill, SectionTitle, Note, ruleTone, fmt, fmtDate, useLoad,
} from './ui';
import { certTone } from './Portfolio';
import { windowTone } from './Certificates';

export function RequirementText({ req, t }) {
  return (
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
      {t('gk.guideline.periodLine', { period: req.period, base: req.basePct, req: req.requiredPct })}
      {req.transitionActive && ` ${t('gk.guideline.transitionLine', { date: req.transitionEnds })}`}
      {req.dispensation && ` ${t('gk.guideline.dispensationLine')}`}
    </p>
  );
}

export default function OverviewTab({ est, t }) {
  const { data: o, loading, error } = useLoad(() => gkApi.overview(est.id), [est.id, est.updatedAt]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const s = o.summary;
  const cert = o.currentCertificate;
  const base = `/gk/establishments/${est.id}`;
  const checks = [
    ['targets', '1.2', o.checks.targets, 'plan'],
    ['actions', '1.3', o.checks.actions, 'plan'],
    ['team', '1.1', o.checks.team, 'people'],
    ['training', '1.20/1.21', o.checks.trainingLastYear, 'people'],
    ['coverage', '3.1', { pass: o.checks.coverage.water.pass, rules: [] }, 'data'],
  ];

  return (
    <div className="space-y-5">
      <div className="grid [&>*]:min-w-0 gap-4 lg:grid-cols-3">
        <div className="card flex items-center gap-4">
          <Gauge value={s.readinessPct} size={96} label={t('gk.readiness')} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('gk.readiness')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('gk.overview.doneOf', { done: s.done, total: s.applicable })}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t('gk.overview.readinessDef')}</p>
          </div>
        </div>
        <div className="card">
          <RequiredVsAchieved required={s.guideline.requiredPct} achieved={s.guideline.achievedPct} t={t} />
          <RequirementText req={o.requirement} t={t} />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('gk.guideline.counts', { met: s.guideline.met, total: s.guideline.applicable, needed: s.guideline.neededCount })}</p>
        </div>
        <div className="card">
          <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5"><Award className="w-4 h-4" />{t('gk.overview.certificate')}</p>
          {cert ? (
            <div className="mt-2 space-y-1.5 text-sm">
              <Tone tone={certTone(cert.timers.effectiveStatus)}>{t(`gk.certStatus.${cert.timers.effectiveStatus}`)} · {t('gk.certs.periodN', { n: cert.periodNumber })}</Tone>
              <p className="text-gray-700 dark:text-gray-300">{fmtDate(cert.timers.validFrom)} → {fmtDate(cert.timers.validTo)}</p>
              {cert.timers.surveillance && <p className="text-xs flex flex-wrap items-center gap-1.5 text-gray-600 dark:text-gray-400">{t('gk.certs.surveillance')}: <Tone tone={windowTone(cert.timers.surveillance.state)}>{t(`gk.window.${cert.timers.surveillance.state}`)}</Tone></p>}
              {cert.timers.renewal && <p className="text-xs flex flex-wrap items-center gap-1.5 text-gray-600 dark:text-gray-400">{t('gk.certs.renewal')}: <Tone tone={windowTone(cert.timers.renewal.state)}>{t(`gk.window.${cert.timers.renewal.state}`)}</Tone></p>}
            </div>
          ) : <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('gk.portfolio.noCert')}</p>}
          <Link to={`${base}/audit`} className="text-xs text-brand-700 dark:text-brand-300 hover:underline mt-2 inline-block">{t('gk.overview.openAudit')}</Link>
        </div>
      </div>

      <div className="grid [&>*]:min-w-0 grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={AlertTriangle} label={t('gk.overview.imperativeGaps')} value={s.imperativeGaps} sub={t('gk.overview.ofImperative', { n: s.imperativeTotal })} />
        <Kpi icon={Zap} label={t('gk.kpi.kwhPerGuestNight')} value={fmt(o.kpis.intensities?.kwhPerGuestNight, 1)} sub={o.kpis.period ? `${o.kpis.period.from} → ${o.kpis.period.to}` : t('gk.noData')} />
        <Kpi icon={Droplets} label={t('gk.kpi.litresPerGuestNight')} value={fmt(o.kpis.intensities?.litresPerGuestNight, 0)} />
        <Kpi icon={Leaf} label={t('gk.kpi.kgCo2ePerOccupiedRoom')} value={fmt(o.kpis.intensities?.kgCo2ePerOccupiedRoom, 1)} />
      </div>

      <div className="grid [&>*]:min-w-0 gap-4 lg:grid-cols-2">
        <div className="card">
          <SectionTitle right={<Link to={`${base}/criteria`} className="text-xs text-brand-700 dark:text-brand-300 hover:underline">{t('gk.overview.openBoard')}</Link>}>
            <span className="inline-flex items-center gap-1.5"><ListChecks className="w-4 h-4" />{t('gk.overview.imperativeOpen')}</span>
          </SectionTitle>
          {o.imperativeOpen.length === 0 ? <Tone tone="good">{t('gk.overview.noImperativeOpen')}</Tone> : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {o.imperativeOpen.map((r) => (
                <li key={r.code} className="py-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate"><span className="font-mono font-semibold mr-2">{r.code}</span>{r.title}</span>
                  <StatusPill status={r.status} t={t} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <SectionTitle><span className="inline-flex items-center gap-1.5"><CalendarClock className="w-4 h-4" />{t('gk.overview.tasks')}</span></SectionTitle>
          {o.tasks.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">{t('gk.overview.noTasks')}</p> : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {o.tasks.map((x) => (
                <li key={x.code} className="py-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0"><span className="font-mono font-semibold mr-2">{x.code}</span>{x.title}{x.ownerName ? ` · ${x.ownerName}` : ''}</span>
                  <Tone tone={x.overdue ? 'critical' : 'warning'}>{fmtDate(x.dueDate)}</Tone>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 flex items-center gap-1.5"><Database className="w-3.5 h-3.5" />{t('gk.overview.lastEntry')}: {fmtDate(o.lastDataEntry)}</p>
        </div>
      </div>

      <div className="card">
        <SectionTitle>{t('gk.overview.ruleChecks')}</SectionTitle>
        <div className="grid [&>*]:min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {checks.map(([k, code, c, tab]) => {
            const worst = c.pass ? (c.rules.some((r) => r.status === 'warning') ? 'warning' : 'pass') : 'fail';
            return (
              <Link key={k} to={`${base}/${tab}`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:border-brand-300 dark:hover:border-brand-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{code}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{t(`gk.overview.check.${k}`)}</p>
                <div className="mt-1.5"><Tone tone={ruleTone(worst)}>{t(`gk.rule.${worst}`)}</Tone></div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="card">
        <SectionTitle>{t('gk.overview.alerts')} ({o.alerts.length})</SectionTitle>
        {o.alerts.length === 0 ? <Tone tone="good">{t('gk.portfolio.noAlerts')}</Tone> : (
          <ul className="space-y-1.5">
            {o.alerts.map((a, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2 text-sm">
                <Tone tone={a.severity === 'critical' ? 'critical' : 'warning'}>{t(`gk.severity.${a.severity}`)}</Tone>
                <span className="text-gray-700 dark:text-gray-300 min-w-0">{a.text}{a.due ? ` (${a.due})` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {o.kpis.warnings?.length > 0 && <Note tone="warning">{o.kpis.warnings.join(' ')}</Note>}
    </div>
  );
}
