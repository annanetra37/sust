import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Send, CheckCircle2, Undo2, Unlock, MessageSquare, Loader2 } from 'lucide-react';
import feApi from '../../services/feApi';
import { useT } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { HelpBanner } from '../../components/HelpSystem';
import { useFeSelection, PeriodPicker, PageHeader, ErrorBox, Notice, Field, Spinner, StatusBadge, IllustrativeBanner, fmt, fmtT, errText } from './common';

export default function Review() {
  const { t } = useT();
  const { user } = useAuth();
  const { period, reload } = useFeSelection();
  const [detail, setDetail] = useState(null);
  const [events, setEvents] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const admin = user?.role === 'ADMIN';

  const load = useCallback(() => {
    if (!period) return;
    Promise.all([feApi.period(period.id), feApi.events(period.id)])
      .then(([d, e]) => { setDetail(d); setEvents(e); })
      .catch((err) => setError(errText(err, t('fe.errors.load'))));
  }, [period, t]);
  useEffect(() => { setDetail(null); setEvents(null); load(); }, [load]);

  const act = async (name, fn, needText) => {
    if (needText && !text.trim()) { setError(t(name === 'reopen' ? 'fe.review.reasonRequired' : 'fe.review.commentRequired')); return; }
    setBusy(name); setError('');
    try { await fn(); setText(''); await reload(); load(); } catch (err) { setError(errText(err, t('fe.errors.save'))); } finally { setBusy(''); }
  };
  const status = detail?.status || period?.status;
  const run = detail?.latestRun;
  const Btn = ({ name, icon: Icon, onClick, kind = 'btn-secondary', label }) => (
    <button className={`${kind} flex items-center gap-2`} onClick={onClick} disabled={!!busy}>
      {busy === name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}{label}
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader icon={ClipboardCheck} title={t('fe.review.title')} subtitle={t('fe.review.subtitle')} />
      <HelpBanner id="fe-review" title={t('fe.review.helpTitle')}>{t('fe.review.helpBody')}</HelpBanner>
      <PeriodPicker />
      <ErrorBox message={error} />
      {period && !detail && !error && <Spinner />}
      {detail && (
        <>
          <div className="card !p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold text-gray-900 dark:text-white">{detail.name}</h2>
              <StatusBadge status={status} />
            </div>
            {run ? (
              <>
                <IllustrativeBanner factorSet={run.totals?.factorSet} />
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t('fe.review.latestRun', { date: new Date(run.createdAt).toLocaleString(), t: fmtT(run.totals?.absoluteFinanced), cov: fmt(run.totals?.coveragePct, 1), dq: fmt(run.totals?.weightedDq, 2), ex: run.totals?.exceptions })}
                </p>
                <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 break-all">in {run.inputsHash} · out {run.outputsHash}</p>
              </>
            ) : <Notice tone="warn">{t('fe.review.noRun')}</Notice>}
            {!admin && <p className="text-xs text-gray-500 dark:text-gray-400">{t('fe.review.adminOnly')}</p>}

            <Field label={status === 'LOCKED' ? `${t('fe.review.reason')} *` : t('fe.review.comment')}>
              <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={status === 'LOCKED' ? t('fe.review.reasonPlaceholder') : ''} />
            </Field>
            <div className="flex gap-2 flex-wrap">
              {status === 'OPEN' && <Btn name="submit" icon={Send} kind="btn-primary" label={t('fe.review.submit')} onClick={() => act('submit', () => feApi.submit(period.id, text))} />}
              {status === 'IN_REVIEW' && admin && <>
                <Btn name="approve" icon={CheckCircle2} kind="btn-primary" label={t('fe.review.approve')} onClick={() => act('approve', () => feApi.approve(period.id, text))} />
                <Btn name="reject" icon={Undo2} label={t('fe.review.reject')} onClick={() => act('reject', () => feApi.reject(period.id, text), true)} />
              </>}
              {status === 'LOCKED' && admin && <Btn name="reopen" icon={Unlock} kind="btn-danger" label={t('fe.review.reopen')} onClick={() => act('reopen', () => feApi.reopen(period.id, text), true)} />}
              <Btn name="comment" icon={MessageSquare} label={t('fe.review.addComment')} onClick={() => act('comment', () => feApi.comment(period.id, text), true)} />
            </div>
          </div>

          <div className="card !p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('fe.review.trail')}</h2>
            {!events?.length ? <p className="text-sm text-gray-500">{t('fe.review.noEvents')}</p> : (
              <ol className="space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                    <p className="text-sm text-gray-900 dark:text-white">
                      <span className="font-semibold">{t(`fe.review.actions.${e.action}`)}</span>
                      {e.fromStatus && <span className="text-gray-500 dark:text-gray-400"> · {t(`fe.status.${e.fromStatus}`)} → {t(`fe.status.${e.toStatus}`)}</span>}
                    </p>
                    {e.comment && <p className="text-sm text-gray-700 dark:text-gray-300 break-words">“{e.comment}”</p>}
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{e.user} · {new Date(e.createdAt).toLocaleString()}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}
