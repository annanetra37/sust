import { useState } from 'react';
import { Plus, Trash2, UserCheck, GraduationCap, History, LogOut } from 'lucide-react';
import gkApi from '../../services/gkApi';
import { Loading, ErrorBox, Modal, Field, Check, Tone, RuleList, SectionTitle, Note, fmtDate, errText, useLoad } from './ui';

const ROLES = ['representative', 'substitute', 'committee'];
const KINDS = ['briefing', 'general_training', 'departmental_training', 'new_hire'];
const today = () => new Date().toISOString().slice(0, 10);

function MemberModal({ estId, onClose, onSaved, t }) {
  const [f, setF] = useState({ role: 'representative', name: '', position: '', email: '', permanentStaff: true, fromDate: today(), replaceCurrent: true });
  const [err, setErr] = useState('');
  const save = async () => { try { await gkApi.addMember(estId, f); onSaved(); } catch (ex) { setErr(errText(ex)); } };
  return (
    <Modal title={t('gk.people.addMember')} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>{t('gk.cancel')}</button><button className="btn-primary" disabled={!f.name.trim()} onClick={save}>{t('gk.save')}</button></>}>
      <div className="space-y-3">
        <ErrorBox message={err} />
        <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-2">
          <Field label={t('gk.people.role')}><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{t(`gk.role.${r}`)}</option>)}</select></Field>
          <Field label={t('gk.people.name')}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={t('gk.people.position')}><input className="input" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></Field>
          <Field label={t('gk.people.email')}><input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label={t('gk.people.fromDate')}><input type="date" className="input" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value })} /></Field>
        </div>
        <Check label={t('gk.people.permanent')} checked={f.permanentStaff} onChange={(v) => setF({ ...f, permanentStaff: v })} />
        {f.role !== 'committee' && <Check label={t('gk.people.replaceCurrent')} hint={t('gk.people.replaceHint')} checked={f.replaceCurrent} onChange={(v) => setF({ ...f, replaceCurrent: v })} />}
      </div>
    </Modal>
  );
}

function TrainingModal({ estId, onClose, onSaved, t }) {
  const [f, setF] = useState({ kind: 'briefing', topic: '', department: '', date: today(), durationMin: '', format: 'in person', participants: '', staffName: '', hireDate: '' });
  const [err, setErr] = useState('');
  const n = (v) => (v === '' ? null : Number(v));
  const save = async () => {
    try { await gkApi.addTraining(estId, { ...f, durationMin: n(f.durationMin), participants: n(f.participants), hireDate: f.hireDate || null }); onSaved(); } catch (ex) { setErr(errText(ex)); }
  };
  return (
    <Modal title={t('gk.people.addTraining')} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>{t('gk.cancel')}</button><button className="btn-primary" disabled={!f.topic.trim()} onClick={save}>{t('gk.save')}</button></>}>
      <div className="space-y-3">
        <ErrorBox message={err} />
        <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-2">
          <Field label={t('gk.people.kind')}><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map((k) => <option key={k} value={k}>{t(`gk.trainingKind.${k}`)}</option>)}</select></Field>
          <Field label={t('gk.people.topic')}><input className="input" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></Field>
          <Field label={t('gk.people.department')}><input className="input" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field>
          <Field label={t('gk.people.date')}><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={t('gk.people.duration')}><input type="number" min="0" className="input" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} /></Field>
          <Field label={t('gk.people.format')}><input className="input" value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })} /></Field>
          <Field label={t('gk.people.participants')}><input type="number" min="0" className="input" value={f.participants} onChange={(e) => setF({ ...f, participants: e.target.value })} /></Field>
          {f.kind === 'new_hire' && (
            <>
              <Field label={t('gk.people.staffName')}><input className="input" value={f.staffName} onChange={(e) => setF({ ...f, staffName: e.target.value })} /></Field>
              <Field label={t('gk.people.hireDate')} hint={t('gk.people.hireHint')}><input type="date" className="input" value={f.hireDate} onChange={(e) => setF({ ...f, hireDate: e.target.value })} /></Field>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function PeopleTab({ est, t }) {
  const thisYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(thisYear);
  const { data, loading, error, reload } = useLoad(() => gkApi.people(est.id, year), [est.id, year]);
  const [modal, setModal] = useState(null);
  const [err, setErr] = useState('');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const now = new Date();
  const current = data.team.filter((m) => !m.toDate || new Date(m.toDate) > now);
  const past = data.team.filter((m) => m.toDate && new Date(m.toDate) <= now);
  const act = async (fn, confirmMsg) => { if (confirmMsg && !window.confirm(confirmMsg)) return; try { await fn(); reload(); } catch (ex) { setErr(errText(ex)); } };
  const trainingsInYear = data.trainings.filter((x) => new Date(x.date).getUTCFullYear() === year);

  return (
    <div className="space-y-4">
      <ErrorBox message={err} />
      <div className="grid [&>*]:min-w-0 gap-4 lg:grid-cols-2">
        <div className="card">
          <SectionTitle>{t('gk.people.teamChecks')}</SectionTitle>
          <RuleList rules={data.checks.team.rules} t={t} ns="team" />
        </div>
        <div className="card">
          <SectionTitle right={(
            <select className="input !w-auto !py-1 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t('gk.data.year')}>
              {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          >
            {t('gk.people.trainingChecks')}
          </SectionTitle>
          <RuleList rules={data.checks.training.rules} t={t} ns="training" />
          {year === thisYear && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">{t('gk.people.runningYear')}</p>}
        </div>
      </div>

      <div className="card">
        <SectionTitle right={<button className="btn-primary !py-1.5 inline-flex items-center gap-1.5 text-sm" onClick={() => setModal('member')}><Plus className="w-4 h-4" />{t('gk.people.addMember')}</button>}>
          <span className="inline-flex items-center gap-1.5"><UserCheck className="w-4 h-4" />{t('gk.people.team')}</span>
        </SectionTitle>
        {current.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">{t('gk.people.noTeam')}</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {current.map((m) => (
              <li key={m.id} className="py-2 flex flex-wrap items-center gap-2">
                <Tone tone={m.role === 'committee' ? 'neutral' : 'info'}>{t(`gk.role.${m.role}`)}</Tone>
                <span className="min-w-[10rem] flex-1 text-sm break-words">
                  <span className="font-medium text-gray-900 dark:text-white">{m.name}</span>
                  <span className="text-gray-500 dark:text-gray-400">{m.position ? ` · ${m.position}` : ''}{m.email ? ` · ${m.email}` : ''} · {t('gk.people.since', { d: fmtDate(m.fromDate) })}</span>
                  {!m.permanentStaff && <span className="ml-1.5"><Tone tone="warning">{t('gk.people.notPermanent')}</Tone></span>}
                </span>
                <button className="btn-secondary !px-2 !py-1.5 inline-flex items-center gap-1 text-xs" onClick={() => act(() => gkApi.updateMember(m.id, { toDate: today() }))} title={t('gk.people.end')}><LogOut className="w-3.5 h-3.5" />{t('gk.people.end')}</button>
                <button className="btn-secondary !px-2 !py-1.5 text-red-600" onClick={() => act(() => gkApi.deleteMember(m.id), t('gk.confirmDelete'))} aria-label={t('gk.delete')}><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer inline-flex items-center gap-1"><History className="w-3.5 h-3.5" />{t('gk.people.history', { n: past.length })}</summary>
            <ul className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
              {past.map((m) => <li key={m.id}>{t(`gk.role.${m.role}`)}: {m.name} · {fmtDate(m.fromDate)} → {fmtDate(m.toDate)}</li>)}
            </ul>
          </details>
        )}
      </div>

      <div className="card">
        <SectionTitle right={<button className="btn-primary !py-1.5 inline-flex items-center gap-1.5 text-sm" onClick={() => setModal('training')}><Plus className="w-4 h-4" />{t('gk.people.addTraining')}</button>}>
          <span className="inline-flex items-center gap-1.5"><GraduationCap className="w-4 h-4" />{t('gk.people.trainings', { y: year })}</span>
        </SectionTitle>
        <Note tone="neutral">{t('gk.people.trainingHelp')}</Note>
        {trainingsInYear.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('gk.people.noTrainings')}</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 mt-2">
            {trainingsInYear.map((x) => (
              <li key={x.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="tabular-nums text-gray-500 dark:text-gray-400 w-24 shrink-0">{fmtDate(x.date)}</span>
                <Tone tone="neutral">{t(`gk.trainingKind.${x.kind}`)}</Tone>
                <span className="min-w-[10rem] flex-1 text-gray-800 dark:text-gray-200 break-words">{x.topic}{x.department ? ` · ${x.department}` : ''}{x.staffName ? ` · ${x.staffName} (${t('gk.people.hired', { d: fmtDate(x.hireDate) })})` : ''}{x.participants ? ` · ${t('gk.people.participantsN', { n: x.participants })}` : ''}</span>
                <button className="btn-secondary !px-2 !py-1.5 text-red-600" onClick={() => act(() => gkApi.deleteTraining(x.id), t('gk.confirmDelete'))} aria-label={t('gk.delete')}><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {modal === 'member' && <MemberModal estId={est.id} t={t} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal === 'training' && <TrainingModal estId={est.id} t={t} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </div>
  );
}
