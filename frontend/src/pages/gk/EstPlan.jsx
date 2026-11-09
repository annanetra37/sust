import { useState } from 'react';
import { Plus, Pencil, Trash2, Target, ListTodo } from 'lucide-react';
import gkApi from '../../services/gkApi';
import { Loading, ErrorBox, Modal, Field, Tone, RuleList, SectionTitle, Note, fmt, fmtDate, toInputDate, errText, useLoad } from './ui';

const ACTION_STATUSES = ['planned', 'in_progress', 'done', 'not_fulfilled'];

function TargetModal({ estId, initial, onClose, onSaved, t }) {
  const [f, setF] = useState(initial ? { ...initial, documentDate: toInputDate(initial.documentDate), metric: initial.metric || '', baselineYear: initial.baselineYear ?? '', baselineValue: initial.baselineValue ?? '', targetValue: initial.targetValue ?? '', targetYear: initial.targetYear ?? '' }
    : { area: 4, description: '', metric: '', baselineYear: new Date().getUTCFullYear() - 1, baselineValue: '', targetValue: '', targetYear: '', documentDate: new Date().toISOString().slice(0, 10) });
  const [err, setErr] = useState('');
  const n = (v) => (v === '' || v == null ? null : Number(v));
  const save = async () => {
    const body = { area: Number(f.area), description: f.description, metric: f.metric, baselineYear: n(f.baselineYear), baselineValue: n(f.baselineValue), targetValue: n(f.targetValue), targetYear: n(f.targetYear), documentDate: f.documentDate || null };
    try { await (initial ? gkApi.updateTarget(initial.id, body) : gkApi.createTarget(estId, body)); onSaved(); } catch (ex) { setErr(errText(ex)); }
  };
  return (
    <Modal title={initial ? t('gk.plan.editTarget') : t('gk.plan.addTarget')} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>{t('gk.cancel')}</button><button className="btn-primary" disabled={!f.description.trim()} onClick={save}>{t('gk.save')}</button></>}>
      <div className="space-y-3">
        <ErrorBox message={err} />
        <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-3">
          <Field label={t('gk.criteria.area')} className="sm:col-span-1">
            <select className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>{[1, 2, 3, 4, 5, 6, 7].map((a) => <option key={a} value={a}>{a} · {t(`gk.area.${a}`)}</option>)}</select>
          </Field>
          <Field label={t('gk.plan.description')} className="sm:col-span-2"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        </div>
        <div className="grid [&>*]:min-w-0 gap-3 grid-cols-2 sm:grid-cols-3">
          <Field label={t('gk.plan.metric')}><input className="input" value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })} placeholder="kWh/guest-night" /></Field>
          <Field label={t('gk.plan.baselineYear')}><input type="number" className="input" value={f.baselineYear} onChange={(e) => setF({ ...f, baselineYear: e.target.value })} /></Field>
          <Field label={t('gk.plan.baselineValue')} hint={t('gk.plan.baselineHint')}><input type="number" step="any" className="input" value={f.baselineValue} onChange={(e) => setF({ ...f, baselineValue: e.target.value })} /></Field>
          <Field label={t('gk.plan.targetValue')}><input type="number" step="any" className="input" value={f.targetValue} onChange={(e) => setF({ ...f, targetValue: e.target.value })} /></Field>
          <Field label={t('gk.plan.targetYear')} hint={t('gk.plan.horizonHint')}><input type="number" className="input" value={f.targetYear} onChange={(e) => setF({ ...f, targetYear: e.target.value })} /></Field>
          <Field label={t('gk.plan.documentDate')}><input type="date" className="input" value={f.documentDate} onChange={(e) => setF({ ...f, documentDate: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function ActionModal({ estId, initial, targets, onClose, onSaved, t }) {
  const [f, setF] = useState(initial ? { ...initial, dueDate: toInputDate(initial.dueDate), targetId: initial.targetId || '', owner: initial.owner || '', measure: initial.measure || '', justification: initial.justification || '', nextStep: initial.nextStep || '' }
    : { description: '', targetId: targets[0]?.id || '', owner: '', measure: '', dueDate: '', status: 'planned', justification: '', nextStep: '' });
  const [err, setErr] = useState('');
  const save = async () => {
    const body = { ...f, dueDate: f.dueDate || null, targetId: f.targetId || null };
    delete body.id; delete body.establishmentId; delete body.createdAt;
    try { await (initial ? gkApi.updateAction(initial.id, body) : gkApi.createAction(estId, body)); onSaved(); } catch (ex) { setErr(errText(ex)); }
  };
  return (
    <Modal title={initial ? t('gk.plan.editAction') : t('gk.plan.addAction')} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>{t('gk.cancel')}</button><button className="btn-primary" disabled={!f.description.trim()} onClick={save}>{t('gk.save')}</button></>}>
      <div className="space-y-3">
        <ErrorBox message={err} />
        <Field label={t('gk.plan.description')}><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-2">
          <Field label={t('gk.plan.target')}>
            <select className="input" value={f.targetId} onChange={(e) => setF({ ...f, targetId: e.target.value })}>
              <option value="">—</option>{targets.map((x) => <option key={x.id} value={x.id}>{x.description}</option>)}
            </select>
          </Field>
          <Field label={t('gk.plan.owner')}><input className="input" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></Field>
          <Field label={t('gk.plan.measure')} hint={t('gk.plan.measureHint')}><input className="input" value={f.measure} onChange={(e) => setF({ ...f, measure: e.target.value })} /></Field>
          <Field label={t('gk.plan.dueDate')}><input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
          <Field label={t('gk.plan.status')}>
            <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{ACTION_STATUSES.map((s) => <option key={s} value={s}>{t(`gk.actionStatus.${s}`)}</option>)}</select>
          </Field>
        </div>
        {f.status === 'not_fulfilled' && (
          <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-2">
            <Field label={t('gk.plan.justification')}><textarea className="input" rows={2} value={f.justification} onChange={(e) => setF({ ...f, justification: e.target.value })} /></Field>
            <Field label={t('gk.plan.nextStep')}><textarea className="input" rows={2} value={f.nextStep} onChange={(e) => setF({ ...f, nextStep: e.target.value })} /></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function PlanTab({ est, t }) {
  const { data, loading, error, reload } = useLoad(() => gkApi.plan(est.id), [est.id]);
  const [modal, setModal] = useState(null);
  const [err, setErr] = useState('');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const del = async (fn) => { if (!window.confirm(t('gk.confirmDelete'))) return; try { await fn(); reload(); } catch (ex) { setErr(errText(ex)); } };
  const span = data.checks.actions.rules.find((r) => r.key === 'span');
  const start = span?.planStart ? new Date(span.planStart) : new Date();
  const y2 = new Date(start); y2.setUTCMonth(y2.getUTCMonth() + 12);
  const bucket = (a) => (!a.dueDate ? 'undated' : new Date(a.dueDate) < y2 ? 'year1' : 'year2');
  const targetName = Object.fromEntries(data.targets.map((x) => [x.id, x.description]));
  const failing = new Set([...data.checks.actions.rules, ...data.checks.targets.rules].filter((r) => r.status === 'fail').flatMap((r) => (r.items || []).map((x) => (typeof x === 'string' ? x : x.id))));

  return (
    <div className="space-y-4">
      <ErrorBox message={err} />
      <Note tone="neutral">{t('gk.plan.intro', { n: est.employees ?? '—' })}</Note>
      <div className="grid [&>*]:min-w-0 gap-4 lg:grid-cols-2">
        <div className="card">
          <SectionTitle>{t('gk.plan.targetChecks')}</SectionTitle>
          <RuleList rules={data.checks.targets.rules} t={t} ns="targets" />
        </div>
        <div className="card">
          <SectionTitle>{t('gk.plan.actionChecks')}</SectionTitle>
          <RuleList rules={data.checks.actions.rules} t={t} ns="actions" />
        </div>
      </div>

      <div className="card">
        <SectionTitle right={<button className="btn-primary !py-1.5 inline-flex items-center gap-1.5 text-sm" onClick={() => setModal({ kind: 'target' })}><Plus className="w-4 h-4" />{t('gk.plan.addTarget')}</button>}>
          <span className="inline-flex items-center gap-1.5"><Target className="w-4 h-4" />{t('gk.plan.targets')} ({data.targets.length})</span>
        </SectionTitle>
        {data.targets.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">{t('gk.plan.noTargets')}</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.targets.map((x) => (
              <li key={x.id} className="py-2.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 dark:text-white">{x.description}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t(`gk.area.${x.area}`)} · {t('gk.plan.baselineLine', { y: x.baselineYear ?? '—', v: fmt(x.baselineValue, 2), tv: fmt(x.targetValue, 2), ty: x.targetYear ?? '—' })}{x.metric ? ` ${x.metric}` : ''} · {t('gk.plan.documentDate')}: {fmtDate(x.documentDate)}
                  </p>
                  {failing.has(x.id) && <span className="mt-1 inline-block"><Tone tone="critical">{t('gk.plan.needsFix')}</Tone></span>}
                </div>
                <button className="btn-secondary !px-2 !py-1.5" onClick={() => setModal({ kind: 'target', item: x })} aria-label={t('gk.edit')}><Pencil className="w-4 h-4" /></button>
                <button className="btn-secondary !px-2 !py-1.5 text-red-600" onClick={() => del(() => gkApi.deleteTarget(x.id))} aria-label={t('gk.delete')}><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <SectionTitle right={<button className="btn-primary !py-1.5 inline-flex items-center gap-1.5 text-sm" onClick={() => setModal({ kind: 'action' })}><Plus className="w-4 h-4" />{t('gk.plan.addAction')}</button>}>
          <span className="inline-flex items-center gap-1.5"><ListTodo className="w-4 h-4" />{t('gk.plan.actions')} ({data.actions.length})</span>
        </SectionTitle>
        {span && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t('gk.plan.window', { from: span.planStart, to: span.planEnd })}</p>}
        {data.actions.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">{t('gk.plan.noActions')}</p> : ['year1', 'year2', 'undated'].map((b) => {
          const list = data.actions.filter((a) => bucket(a) === b);
          if (!list.length) return null;
          return (
            <div key={b} className="mt-3">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t(`gk.plan.bucket.${b}`)}</p>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {list.map((a) => (
                  <li key={a.id} className="py-2.5 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 dark:text-white">{a.description}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {a.owner || t('gk.plan.noOwner')} · {fmtDate(a.dueDate)} · {a.measure || t('gk.plan.noMeasure')}{a.targetId ? ` · → ${targetName[a.targetId]}` : ''}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <Tone tone={a.status === 'done' ? 'good' : a.status === 'not_fulfilled' ? 'critical' : a.status === 'in_progress' ? 'info' : 'neutral'}>{t(`gk.actionStatus.${a.status}`)}</Tone>
                        {failing.has(a.id) && <Tone tone="critical">{t('gk.plan.needsFix')}</Tone>}
                      </div>
                      {a.status === 'not_fulfilled' && (a.justification || a.nextStep) && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{a.justification} {a.nextStep ? `→ ${a.nextStep}` : ''}</p>}
                    </div>
                    <button className="btn-secondary !px-2 !py-1.5" onClick={() => setModal({ kind: 'action', item: a })} aria-label={t('gk.edit')}><Pencil className="w-4 h-4" /></button>
                    <button className="btn-secondary !px-2 !py-1.5 text-red-600" onClick={() => del(() => gkApi.deleteAction(a.id))} aria-label={t('gk.delete')}><Trash2 className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {modal?.kind === 'target' && <TargetModal estId={est.id} initial={modal.item} t={t} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'action' && <ActionModal estId={est.id} initial={modal.item} targets={data.targets} t={t} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </div>
  );
}
