import { useState } from 'react';
import { Plus, Pencil, Trash2, Award, AlertOctagon, CheckCircle2, ClipboardList } from 'lucide-react';
import gkApi from '../../services/gkApi';
import { Loading, ErrorBox, Modal, Field, Tone, SectionTitle, Note, fmtDate, toInputDate, errText, useLoad } from './ui';
import { certTone } from './Portfolio';
import { windowTone } from './Certificates';
import { RequirementText } from './EstOverview';

const CERT_STATUSES = ['applied', 'certified', 'suspended', 'expired', 'withdrawn'];

function CertModal({ est, initial, nextPeriod, onClose, onSaved, t }) {
  const [f, setF] = useState(initial
    ? { periodNumber: initial.periodNumber, criteriaVersion: initial.criteriaVersion, status: initial.status, auditDate: toInputDate(initial.auditDate), validFrom: toInputDate(initial.validFrom), validTo: toInputDate(initial.validTo), surveillanceDate: toInputDate(initial.surveillanceDate), notes: initial.notes || '' }
    : { periodNumber: nextPeriod, criteriaVersion: est.criteriaVersion, status: 'applied', auditDate: '', validFrom: '', validTo: '', surveillanceDate: '', notes: '' });
  const [err, setErr] = useState('');
  const save = async () => {
    const body = { ...f, periodNumber: Number(f.periodNumber) };
    for (const k of ['auditDate', 'validFrom', 'validTo', 'surveillanceDate']) body[k] = f[k] || null;
    if (!f.validTo) delete body.validTo; // backend defaults to validFrom + 24 months
    try { await (initial ? gkApi.updateCertification(initial.id, body) : gkApi.createCertification(est.id, body)); onSaved(); } catch (ex) { setErr(errText(ex)); }
  };
  return (
    <Modal title={initial ? t('gk.audit.editCert') : t('gk.audit.addCert')} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>{t('gk.cancel')}</button><button className="btn-primary" onClick={save}>{t('gk.save')}</button></>}>
      <div className="space-y-3">
        <ErrorBox message={err} />
        <div className="grid [&>*]:min-w-0 gap-3 grid-cols-2 sm:grid-cols-3">
          <Field label={t('gk.certs.period')}><input type="number" min="1" className="input" value={f.periodNumber} onChange={(e) => setF({ ...f, periodNumber: e.target.value })} /></Field>
          <Field label={t('gk.criteria.version')}><select className="input" value={f.criteriaVersion} onChange={(e) => setF({ ...f, criteriaVersion: e.target.value })}><option value="2026-2031">2026–2031</option><option value="2022-2026">2022–2026</option></select></Field>
          <Field label={t('gk.certs.status')}><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{CERT_STATUSES.map((s) => <option key={s} value={s}>{t(`gk.certStatus.${s}`)}</option>)}</select></Field>
          <Field label={t('gk.audit.auditDate')}><input type="date" className="input" value={f.auditDate} onChange={(e) => setF({ ...f, auditDate: e.target.value })} /></Field>
          <Field label={t('gk.audit.validFrom')}><input type="date" className="input" value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} /></Field>
          <Field label={t('gk.audit.validTo')} hint={t('gk.audit.validToHint')}><input type="date" className="input" value={f.validTo} onChange={(e) => setF({ ...f, validTo: e.target.value })} /></Field>
          <Field label={t('gk.audit.surveillanceDate')}><input type="date" className="input" value={f.surveillanceDate} onChange={(e) => setF({ ...f, surveillanceDate: e.target.value })} /></Field>
        </div>
        <Field label={t('gk.data.notes')}><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function NcModal({ estId, certs, onClose, onSaved, t }) {
  const [f, setF] = useState({ certificationId: certs[0]?.id || '', criterionCode: '', description: '', raisedAt: new Date().toISOString().slice(0, 10), deadline: '' });
  const [err, setErr] = useState('');
  const save = async () => {
    try { await gkApi.createNc(estId, { ...f, certificationId: f.certificationId || null, deadline: f.deadline || null }); onSaved(); } catch (ex) { setErr(errText(ex)); }
  };
  return (
    <Modal title={t('gk.audit.addNc')} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>{t('gk.cancel')}</button><button className="btn-primary" disabled={!f.description.trim()} onClick={save}>{t('gk.save')}</button></>}>
      <div className="space-y-3">
        <ErrorBox message={err} />
        <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-2">
          <Field label={t('gk.audit.audit')}>
            <select className="input" value={f.certificationId} onChange={(e) => setF({ ...f, certificationId: e.target.value })}>
              <option value="">—</option>{certs.map((c) => <option key={c.id} value={c.id}>{t('gk.certs.periodN', { n: c.periodNumber })} · {fmtDate(c.auditDate)}</option>)}
            </select>
          </Field>
          <Field label={t('gk.audit.criterion')}><input className="input" value={f.criterionCode} onChange={(e) => setF({ ...f, criterionCode: e.target.value })} placeholder="3.1" /></Field>
          <Field label={t('gk.audit.raised')}><input type="date" className="input" value={f.raisedAt} onChange={(e) => setF({ ...f, raisedAt: e.target.value })} /></Field>
          <Field label={t('gk.audit.deadline')} hint={t('gk.audit.deadlineHint')}><input type="date" className="input" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field>
        </div>
        <Field label={t('gk.plan.description')}><textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export default function AuditTab({ est, t }) {
  const { data, loading, error, reload } = useLoad(() => gkApi.audit(est.id), [est.id]);
  const [modal, setModal] = useState(null);
  const [err, setErr] = useState('');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const act = async (fn, msg) => { if (msg && !window.confirm(msg)) return; try { await fn(); reload(); } catch (ex) { setErr(errText(ex)); } };
  const nextPeriod = Math.max(0, ...data.certifications.map((c) => c.periodNumber), est.priorPeriods) + 1;
  const tasks = data.certifications.flatMap((c) => c.timers.tasks.map((x) => ({ ...x, period: c.periodNumber })));

  return (
    <div className="space-y-4">
      <ErrorBox message={err} />
      <div className="card">
        <SectionTitle>{t('gk.audit.bar')}</SectionTitle>
        <RequirementText req={data.requirement} t={t} />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t('gk.audit.packNote')}</p>
      </div>

      {tasks.length > 0 && (
        <div className="card">
          <SectionTitle><span className="inline-flex items-center gap-1.5"><ClipboardList className="w-4 h-4" />{t('gk.audit.tasks')}</span></SectionTitle>
          <ul className="space-y-1.5">
            {tasks.map((x, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <Tone tone={x.severity === 'critical' ? 'critical' : 'warning'}>{t(`gk.severity.${x.severity}`)}</Tone>
                <span className="text-gray-800 dark:text-gray-200">{x.label}</span>
                {x.due && <span className="text-xs text-gray-500 dark:text-gray-400">{t('gk.audit.due', { d: x.due })}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <SectionTitle right={<button className="btn-primary !py-1.5 inline-flex items-center gap-1.5 text-sm" onClick={() => setModal({ kind: 'cert' })}><Plus className="w-4 h-4" />{t('gk.audit.addCert')}</button>}>
          <span className="inline-flex items-center gap-1.5"><Award className="w-4 h-4" />{t('gk.audit.certificates')}</span>
        </SectionTitle>
        <Note tone="neutral">{t('gk.certs.rules')}</Note>
        {data.certifications.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('gk.certs.empty')}</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 mt-2">
            {data.certifications.map((c) => (
              <li key={c.id} className="py-3 flex flex-wrap sm:flex-nowrap gap-3 items-start">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('gk.certs.periodN', { n: c.periodNumber })}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{c.criteriaVersion}</span>
                    <Tone tone={certTone(c.timers.effectiveStatus)}>{t(`gk.certStatus.${c.timers.effectiveStatus}`)}</Tone>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t('gk.audit.auditDate')}: {fmtDate(c.auditDate)} · {t('gk.certs.validity')}: {fmtDate(c.timers.validFrom)} → {fmtDate(c.timers.validTo)}</p>
                  {c.timers.surveillance && <p className="text-xs flex flex-wrap items-center gap-1.5 text-gray-600 dark:text-gray-400">{t('gk.certs.surveillance')} {c.timers.surveillance.from} → {c.timers.surveillance.to}: <Tone tone={windowTone(c.timers.surveillance.state)}>{t(`gk.window.${c.timers.surveillance.state}`)}</Tone></p>}
                  {c.timers.renewal && <p className="text-xs flex flex-wrap items-center gap-1.5 text-gray-600 dark:text-gray-400">{t('gk.certs.renewal')} {c.timers.renewal.from} → {c.timers.renewal.to}: <Tone tone={windowTone(c.timers.renewal.state)}>{t(`gk.window.${c.timers.renewal.state}`)}</Tone></p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button className="btn-secondary !px-2 !py-1.5" onClick={() => setModal({ kind: 'cert', item: c })} aria-label={t('gk.edit')}><Pencil className="w-4 h-4" /></button>
                  <button className="btn-secondary !px-2 !py-1.5 text-red-600" onClick={() => act(() => gkApi.deleteCertification(c.id), t('gk.confirmDelete'))} aria-label={t('gk.delete')}><Trash2 className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <SectionTitle right={<button className="btn-primary !py-1.5 inline-flex items-center gap-1.5 text-sm" onClick={() => setModal({ kind: 'nc' })}><Plus className="w-4 h-4" />{t('gk.audit.addNc')}</button>}>
          <span className="inline-flex items-center gap-1.5"><AlertOctagon className="w-4 h-4" />{t('gk.audit.ncs')}</span>
        </SectionTitle>
        <div className="flex flex-wrap gap-2 mb-3">
          <Tone tone={data.ncSummary.open ? 'warning' : 'good'}>{t('gk.audit.openN', { n: data.ncSummary.open })}</Tone>
          {data.ncSummary.overdue > 0 && <Tone tone="critical">{t('gk.audit.overdueN', { n: data.ncSummary.overdue })}</Tone>}
          {data.ncSummary.byAudit.filter((g) => g.followUpRequired).map((g) => (
            <Tone key={g.certificationId || 'none'} tone="critical">{t('gk.audit.followUp', { n: g.total })}</Tone>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t('gk.audit.ncRule')}</p>
        {data.nonConformities.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">{t('gk.audit.noNcs')}</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.nonConformities.map((n) => (
              <li key={n.id} className="py-2.5 flex flex-wrap sm:flex-nowrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 dark:text-white">{n.criterionCode && <span className="font-mono font-semibold mr-2">{n.criterionCode}</span>}{n.description}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('gk.audit.raised')}: {fmtDate(n.raisedAt)} · {t('gk.audit.deadline')}: {fmtDate(n.deadline)}{n.closedAt ? ` · ${t('gk.audit.closed')}: ${fmtDate(n.closedAt)}` : ''}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Tone tone={n.status === 'closed' ? 'good' : n.overdue ? 'critical' : 'warning'}>{n.status === 'closed' ? t('gk.audit.closed') : n.overdue ? t('gk.board.overdue') : t('gk.audit.open')}</Tone>
                  </div>
                  {n.closureNote && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{n.closureNote}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {n.status === 'open'
                    ? <button className="btn-secondary !px-2 !py-1.5 inline-flex items-center gap-1 text-xs" onClick={() => { const note = window.prompt(t('gk.audit.closurePrompt')); if (note !== null) act(() => gkApi.updateNc(n.id, { status: 'closed', closureNote: note })); }}><CheckCircle2 className="w-3.5 h-3.5" />{t('gk.audit.close')}</button>
                    : <button className="btn-secondary !px-2 !py-1.5 text-xs" onClick={() => act(() => gkApi.updateNc(n.id, { status: 'open' }))}>{t('gk.audit.reopen')}</button>}
                  <button className="btn-secondary !px-2 !py-1.5 text-red-600" onClick={() => act(() => gkApi.deleteNc(n.id), t('gk.confirmDelete'))} aria-label={t('gk.delete')}><Trash2 className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {modal?.kind === 'cert' && <CertModal est={est} initial={modal.item} nextPeriod={nextPeriod} t={t} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'nc' && <NcModal estId={est.id} certs={data.certifications} t={t} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </div>
  );
}
