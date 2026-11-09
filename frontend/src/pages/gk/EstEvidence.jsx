import { useState } from 'react';
import { Eye, Download, Pencil, Trash2, Check, X, FileText } from 'lucide-react';
import gkApi, { openBlob, saveBlob } from '../../services/gkApi';
import { useAuth } from '../../context/AuthContext';
import { Loading, ErrorBox, Modal, Field, Note, Tone, SectionTitle, fmtDate, toInputDate, errText, useLoad } from './ui';
import { EvidenceUpload } from './EstCriteria';

function CriteriaPicker({ rows, value, onChange, t }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
      {rows.map((r) => (
        <label key={r.criterionId} className="flex items-start gap-2 p-2 text-sm cursor-pointer">
          <input type="checkbox" className="mt-0.5 rounded border-gray-300 text-brand-600" checked={value.includes(r.criterionId)} onChange={() => toggle(r.criterionId)} />
          <span><span className="font-mono font-semibold mr-1.5">{r.code}</span>{r.title}</span>
        </label>
      ))}
      {rows.length === 0 && <p className="p-2 text-sm text-gray-500">{t('gk.board.noRows')}</p>}
    </div>
  );
}

function EditModal({ ev, rows, onClose, onSaved, t }) {
  const [f, setF] = useState({ description: ev.description || '', documentDate: toInputDate(ev.documentDate), validUntil: toInputDate(ev.validUntil), criterionIds: ev.criteria.map((c) => c.id) });
  const [err, setErr] = useState('');
  const save = async () => {
    try { await gkApi.updateEvidence(ev.id, { ...f, documentDate: f.documentDate || null, validUntil: f.validUntil || null }); onSaved(); } catch (ex) { setErr(errText(ex)); }
  };
  return (
    <Modal title={ev.fileName} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>{t('gk.cancel')}</button><button className="btn-primary" onClick={save}>{t('gk.save')}</button></>}>
      <div className="space-y-3">
        <ErrorBox message={err} />
        <Field label={t('gk.evidence.description')}><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid [&>*]:min-w-0 gap-3 grid-cols-2">
          <Field label={t('gk.evidence.documentDate')}><input type="date" className="input" value={f.documentDate} onChange={(e) => setF({ ...f, documentDate: e.target.value })} /></Field>
          <Field label={t('gk.evidence.validUntil')}><input type="date" className="input" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
        </div>
        <Field label={t('gk.evidence.linkedCriteria')}><CriteriaPicker rows={rows} value={f.criterionIds} onChange={(v) => setF({ ...f, criterionIds: v })} t={t} /></Field>
      </div>
    </Modal>
  );
}

function ReviewModal({ ev, onClose, onSaved, t }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const go = async (decision) => {
    try { await gkApi.reviewEvidence(ev.id, { decision, note }); onSaved(); } catch (ex) { setErr(errText(ex)); }
  };
  return (
    <Modal title={t('gk.evidence.reviewTitle', { name: ev.fileName })} onClose={onClose}
      footer={<><button className="btn-danger inline-flex items-center gap-1.5" onClick={() => go('rejected')}><X className="w-4 h-4" />{t('gk.evidence.reject')}</button><button className="btn-primary inline-flex items-center gap-1.5" onClick={() => go('approved')}><Check className="w-4 h-4" />{t('gk.evidence.approve')}</button></>}
    >
      <div className="space-y-3">
        <Note>{t('gk.evidence.reviewHelp')}</Note>
        <ErrorBox message={err} />
        <Field label={t('gk.evidence.reviewNote')} hint={t('gk.evidence.reviewNoteHint')}><textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export default function EvidenceTab({ est, t }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const ev = useLoad(() => gkApi.evidence(est.id), [est.id]);
  const board = useLoad(() => gkApi.board(est.id), [est.id]);
  const [picked, setPicked] = useState([]);
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState('all');
  const [err, setErr] = useState('');

  const reload = () => { ev.reload(); board.reload(); };
  const view = async (e, download) => {
    try { const blob = await gkApi.evidenceFile(e.id); if (download) saveBlob(blob, e.fileName); else openBlob(blob); } catch (ex) { setErr(errText(ex)); }
  };
  const del = async (e) => {
    if (!window.confirm(t('gk.evidence.confirmDelete', { name: e.fileName }))) return;
    try { await gkApi.deleteEvidence(e.id); reload(); } catch (ex) { setErr(errText(ex)); }
  };

  if (ev.loading && !ev.data) return <Loading />;
  const rows = board.data?.rows || [];
  const list = (ev.data || []).filter((e) => filter === 'all' || (filter === 'warnings' ? e.warnings.length > 0 : e.status === filter));

  return (
    <div className="space-y-4">
      <ErrorBox message={ev.error || board.error || err} />
      <div className="card">
        <SectionTitle>{t('gk.evidence.uploadTitle')}</SectionTitle>
        <div className="grid [&>*]:min-w-0 gap-4 lg:grid-cols-2">
          <Field label={t('gk.evidence.linkTo')} hint={t('gk.evidence.linkHint')}><CriteriaPicker rows={rows} value={picked} onChange={setPicked} t={t} /></Field>
          <EvidenceUpload estId={est.id} criterionIds={picked} onDone={() => { setPicked([]); reload(); }} t={t} />
        </div>
      </div>

      <div className="card !p-0">
        <div className="p-4 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('gk.evidence.vault')} ({(ev.data || []).length})</h3>
          <select className="input !w-auto !py-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('gk.evidence.filter')}>
            {['all', 'pending', 'approved', 'rejected', 'warnings'].map((x) => <option key={x} value={x}>{t(`gk.evidence.filters.${x}`)}</option>)}
          </select>
        </div>
        {list.length === 0 ? <p className="p-4 text-sm text-gray-500 dark:text-gray-400">{t('gk.evidence.empty')}</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {list.map((e) => (
              <li key={e.id} className="p-4 flex flex-wrap sm:flex-nowrap gap-3 items-start">
                <FileText className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white break-all">{e.fileName}</p>
                  {e.description && <p className="text-xs text-gray-500 dark:text-gray-400">{e.description}</p>}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {t('gk.evidence.documentDate')}: {fmtDate(e.documentDate)}{e.validUntil ? ` · ${t('gk.evidence.validUntil')}: ${fmtDate(e.validUntil)}` : ''} · {t('gk.evidence.uploaded')}: {fmtDate(e.createdAt)}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <Tone tone={e.status === 'approved' ? 'good' : e.status === 'rejected' ? 'critical' : 'neutral'}>{t(`gk.evidenceStatus.${e.status}`)}</Tone>
                    {e.criteria.map((c) => <span key={c.id} className="badge bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 font-mono">{c.code}</span>)}
                    {e.criteria.length === 0 && <Tone tone="warning">{t('gk.evidence.unlinked')}</Tone>}
                  </div>
                  {e.warnings.map((w, i) => <p key={i} className="mt-1"><Tone tone={w.severity === 'critical' ? 'critical' : 'warning'}>{w.text}</Tone></p>)}
                  {e.reviewNote && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('gk.evidence.reviewNote')}: {e.reviewNote}</p>}
                </div>
                <div className="flex flex-wrap gap-1 shrink-0">
                  <button className="btn-secondary !px-2 !py-1.5" onClick={() => view(e)} aria-label={t('gk.view')}><Eye className="w-4 h-4" /></button>
                  <button className="btn-secondary !px-2 !py-1.5" onClick={() => view(e, true)} aria-label={t('gk.download')}><Download className="w-4 h-4" /></button>
                  <button className="btn-secondary !px-2 !py-1.5" onClick={() => setModal({ kind: 'edit', ev: e })} aria-label={t('gk.edit')}><Pencil className="w-4 h-4" /></button>
                  {isAdmin && <button className="btn-secondary !px-2 !py-1.5 text-sm" onClick={() => setModal({ kind: 'review', ev: e })}>{t('gk.evidence.review')}</button>}
                  <button className="btn-secondary !px-2 !py-1.5 text-red-600" onClick={() => del(e)} aria-label={t('gk.delete')}><Trash2 className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!isAdmin && <Note tone="neutral">{t('gk.evidence.adminOnly')}</Note>}
      {modal?.kind === 'edit' && <EditModal ev={modal.ev} rows={rows} t={t} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'review' && <ReviewModal ev={modal.ev} t={t} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </div>
  );
}
