import { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, Paperclip, AlertTriangle, MessageSquare, History, Upload, Link2, ChevronDown, ChevronRight, CalendarClock } from 'lucide-react';
import gkApi, { openBlob } from '../../services/gkApi';
import {
  Loading, ErrorBox, Drawer, Field, Note, Tone, StatusPill, TypeBadge, RequiredVsAchieved, Gauge, fmtDate, toInputDate, errText, useLoad,
} from './ui';
import { RequirementText } from './EstOverview';

const STATUSES = ['not_started', 'in_progress', 'evidence_uploaded', 'approved', 'conforms', 'na'];
const DATA_TABS = { energy: 'data', water: 'data', waste: 'data', occupancy: 'data', targets: 'plan', actions: 'plan', team: 'people', training: 'people' };
export const EVIDENCE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx';

export function EvidenceUpload({ estId, criterionIds = [], onDone, t, compact }) {
  const fileRef = useRef();
  const [file, setFile] = useState(null);
  const [documentDate, setDocumentDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [description, setDescription] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setErr(t('gk.evidence.tooLarge')); return; }
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (documentDate) fd.append('documentDate', documentDate);
      if (validUntil) fd.append('validUntil', validUntil);
      if (description) fd.append('description', description);
      fd.append('criterionIds', JSON.stringify(criterionIds));
      await gkApi.uploadEvidence(estId, fd);
      setFile(null); setDocumentDate(''); setValidUntil(''); setDescription('');
      onDone?.();
    } catch (ex) { setErr(errText(ex)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-3">
      <ErrorBox message={err} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary !py-1.5 text-sm inline-flex items-center gap-1.5" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4" />{t('gk.chooseFile')}</button>
        <span className="text-xs text-gray-600 dark:text-gray-400 truncate min-w-0 max-w-[14rem]">{file ? file.name : t('gk.evidence.allowed')}</span>
        <input ref={fileRef} type="file" accept={EVIDENCE_ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>
      <div className={`grid [&>*]:min-w-0 gap-2 ${compact ? 'grid-cols-2' : 'sm:grid-cols-3'}`}>
        <Field label={t('gk.evidence.documentDate')}><input type="date" className="input !py-1.5" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} /></Field>
        <Field label={t('gk.evidence.validUntil')}><input type="date" className="input !py-1.5" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
        {!compact && <Field label={t('gk.evidence.description')}><input className="input !py-1.5" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>}
      </div>
      <button type="button" className="btn-primary !py-1.5 text-sm" disabled={!file || busy} onClick={submit}>{t('gk.evidence.upload')}</button>
    </div>
  );
}

function CriterionDrawer({ row, est, onClose, onChanged, t }) {
  const [form, setForm] = useState({ status: row.status, naJustification: row.naJustification || '', ownerName: row.ownerName || '', dueDate: toInputDate(row.dueDate) });
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await gkApi.setStatus(est.id, row.criterionId, { ...form, dueDate: form.dueDate || null, naJustification: form.status === 'na' ? form.naJustification : null });
      onChanged();
    } catch (ex) { setErr(errText(ex)); } finally { setBusy(false); }
  };
  const addComment = async () => {
    if (!comment.trim()) return;
    try { await gkApi.addComment(est.id, row.criterionId, comment.trim()); setComment(''); onChanged(); } catch (ex) { setErr(errText(ex)); }
  };
  const view = async (id) => { try { openBlob(await gkApi.evidenceFile(id)); } catch (ex) { setErr(errText(ex)); } };
  const comments = [...(row.comments || [])].reverse();

  return (
    <Drawer title={`${row.code} · ${row.title}`} onClose={onClose}>
      <div className="flex flex-wrap gap-1.5">
        <TypeBadge type={row.effectiveType} t={t} />
        <StatusPill status={row.status} t={t} />
        {row.custom && <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">{t('gk.criteria.yours')}</span>}
      </div>
      {row.notes?.length > 0 && <Note tone="neutral">{row.notes.join(' ')}</Note>}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('gk.board.guidance')}</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{row.guidance || t('gk.board.noGuidance')}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t('gk.board.paraphrased')}</p>
        {row.auditMethod && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('gk.criteria.auditMethod')}: {t(`gk.auditMethod.${row.auditMethod}`)}</p>}
      </section>

      <section className="space-y-3">
        <ErrorBox message={err} />
        <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-2">
          <Field label={t('gk.board.status')}>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`gk.status.${s}`)}</option>)}
            </select>
          </Field>
          <Field label={t('gk.board.owner')}><input className="input" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} /></Field>
          <Field label={t('gk.board.dueDate')}><input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
        </div>
        {form.status === 'na' && (
          <Field label={t('gk.board.naJustification')} hint={row.naAllowed ? t('gk.board.naAllowedHint') : t('gk.board.naHint')}>
            <textarea className="input" rows={3} value={form.naJustification} onChange={(e) => setForm({ ...form, naJustification: e.target.value })} />
          </Field>
        )}
        <button className="btn-primary" disabled={busy || (form.status === 'na' && !form.naJustification.trim())} onClick={save}>{t('gk.save')}</button>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" />{t('gk.board.evidence')}</h3>
        {row.evidenceTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {row.evidenceTypes.map((et) => <span key={et} className="badge bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{et}</span>)}
          </div>
        )}
        <ul className="mt-2 space-y-2">
          {row.evidence.map((e) => (
            <li key={e.id} className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button className="text-brand-700 dark:text-brand-300 hover:underline truncate min-w-0 text-left" onClick={() => view(e.id)}>{e.fileName}</button>
                <Tone tone={e.status === 'approved' ? 'good' : e.status === 'rejected' ? 'critical' : 'neutral'}>{t(`gk.evidenceStatus.${e.status}`)}</Tone>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('gk.evidence.documentDate')}: {fmtDate(e.documentDate)}{e.validUntil ? ` · ${t('gk.evidence.validUntil')}: ${fmtDate(e.validUntil)}` : ''}</p>
              {e.warnings.map((w, i) => <p key={i} className="mt-1"><Tone tone={w.severity === 'critical' ? 'critical' : 'warning'}>{w.text}</Tone></p>)}
            </li>
          ))}
        </ul>
        <div className="mt-2"><EvidenceUpload estId={est.id} criterionIds={[row.criterionId]} onDone={onChanged} t={t} compact /></div>
      </section>

      {row.dataLink && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" />{t('gk.board.linkedData')}</h3>
          <Link to={`/gk/establishments/${est.id}/${DATA_TABS[row.dataLink] || 'data'}`} className="text-sm text-brand-700 dark:text-brand-300 hover:underline">{t(`gk.dataLink.${row.dataLink}`)} →</Link>
        </section>
      )}

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" />{t('gk.board.comments')}</h3>
        <div className="flex gap-2 mt-2">
          <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} placeholder={t('gk.board.addComment')} />
          <button className="btn-secondary" onClick={addComment} disabled={!comment.trim()}>{t('gk.add')}</button>
        </div>
        <ul className="mt-3 space-y-2">
          {comments.map((c, i) => (
            <li key={i} className="text-sm flex gap-2">
              {c.kind === 'status' ? <History className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" /> : <MessageSquare className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">{c.by} · {new Date(c.at).toLocaleString()}</p>
                {c.kind === 'status'
                  ? <p className="text-gray-700 dark:text-gray-300">{t('gk.board.statusChange', { from: t(`gk.status.${c.from}`), to: t(`gk.status.${c.to}`) })}{c.text ? ` — ${c.text}` : ''}</p>
                  : <p className="text-gray-700 dark:text-gray-300 break-words">{c.text}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Drawer>
  );
}

export default function CriteriaTab({ est, t }) {
  const { data, loading, error, reload } = useLoad(() => gkApi.board(est.id), [est.id, est.updatedAt]);
  const [f, setF] = useState({ area: '', type: '', status: '', owner: '', q: '' });
  const [openId, setOpenId] = useState(null);
  const [showNa, setShowNa] = useState(false);

  const rows = useMemo(() => (data?.rows || []).filter((r) => (!f.area || r.area === Number(f.area))
    && (!f.type || r.effectiveType === f.type)
    && (!f.status || r.status === f.status)
    && (!f.owner || (r.ownerName || '') === f.owner)
    && (!f.q || `${r.code} ${r.title}`.toLowerCase().includes(f.q.toLowerCase()))), [data, f]);
  const owners = useMemo(() => [...new Set((data?.rows || []).map((r) => r.ownerName).filter(Boolean))].sort(), [data]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const s = data.summary;
  const open = data.rows.find((r) => r.criterionId === openId);

  return (
    <div className="space-y-4">
      <div className="grid [&>*]:min-w-0 gap-4 lg:grid-cols-3">
        <div className="card !p-4 flex items-center gap-4">
          <Gauge value={s.readinessPct} label={t('gk.readiness')} />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-gray-900 dark:text-white">{t('gk.overview.doneOf', { done: s.done, total: s.applicable })}</p>
            <p className="mt-1"><Tone tone={s.imperativeGaps ? 'critical' : 'good'}>{t('gk.portfolio.gapsN', { n: s.imperativeGaps })}</Tone></p>
          </div>
        </div>
        <div className="card !p-4 lg:col-span-2">
          <RequiredVsAchieved required={s.guideline.requiredPct} achieved={s.guideline.achievedPct} t={t} />
          <RequirementText req={data.requirement} t={t} />
        </div>
      </div>
      <Note tone="neutral">{t('gk.board.definition')}</Note>

      <div className="card !p-3 grid [&>*]:min-w-0 gap-2 grid-cols-2 lg:grid-cols-5">
        <label className="relative col-span-2 lg:col-span-1">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" aria-hidden="true" />
          <input className="input !pl-8" placeholder={t('gk.board.search')} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label={t('gk.board.search')} />
        </label>
        <select className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} aria-label={t('gk.criteria.area')}>
          <option value="">{t('gk.board.allAreas')}</option>{[1, 2, 3, 4, 5, 6, 7].map((a) => <option key={a} value={a}>{a} · {t(`gk.area.${a}`)}</option>)}
        </select>
        <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label={t('gk.criteria.type')}>
          <option value="">{t('gk.board.allTypes')}</option><option value="imperative">{t('gk.type.imperative')}</option><option value="guideline">{t('gk.type.guideline')}</option>
        </select>
        <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label={t('gk.board.status')}>
          <option value="">{t('gk.board.allStatuses')}</option>{STATUSES.map((x) => <option key={x} value={x}>{t(`gk.status.${x}`)}</option>)}
        </select>
        <select className="input" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} aria-label={t('gk.board.owner')}>
          <option value="">{t('gk.board.allOwners')}</option>{owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <div className="card !p-0">
        {rows.length === 0 ? <p className="p-4 text-sm text-gray-500 dark:text-gray-400">{t('gk.board.noRows')}</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((r) => (
              <li key={r.criterionId}>
                <button className="w-full text-left p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 flex flex-wrap sm:flex-nowrap items-start gap-3" onClick={() => setOpenId(r.criterionId)}>
                  <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white w-11 shrink-0">{r.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-gray-900 dark:text-white">{r.title}</span>
                    <span className="flex flex-wrap items-center gap-1.5 mt-1">
                      <TypeBadge type={r.effectiveType} t={t} />
                      {r.effectiveType !== r.baseType && <span className="text-[11px] text-gray-500 dark:text-gray-400">{t('gk.board.typeChanged')}</span>}
                      {r.ownerName && <span className="text-xs text-gray-500 dark:text-gray-400">{r.ownerName}</span>}
                      {r.dueDate && <span className="text-xs inline-flex items-center gap-0.5 text-gray-500 dark:text-gray-400"><CalendarClock className="w-3 h-3" />{fmtDate(r.dueDate)}</span>}
                      {r.overdue && <Tone tone="critical">{t('gk.board.overdue')}</Tone>}
                      {r.evidence.length > 0 && <span className="text-xs inline-flex items-center gap-0.5 text-gray-500 dark:text-gray-400"><Paperclip className="w-3 h-3" />{r.evidence.length}</span>}
                      {r.evidenceWarnings > 0 && <Tone tone="warning" icon={AlertTriangle}>{t('gk.board.warningsN', { n: r.evidenceWarnings })}</Tone>}
                    </span>
                  </span>
                  <span className="shrink-0"><StatusPill status={r.status} t={t} /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card !p-4">
        <button className="w-full flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white" onClick={() => setShowNa((v) => !v)} aria-expanded={showNa}>
          <span>{t('gk.board.notApplicable', { n: data.notApplicable.length })}</span>
          {showNa ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {showNa && (
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
            {data.notApplicable.length === 0 && <li className="text-sm text-gray-500 dark:text-gray-400 py-1">{t('gk.board.noneNa')}</li>}
            {data.notApplicable.map((r) => (
              <li key={r.criterionId} className="py-2 text-sm">
                <span className="font-mono font-semibold mr-2">{r.code}</span>{r.title}
                <p className="text-xs text-gray-500 dark:text-gray-400">{r.reasons.join(' ')}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      {open && <CriterionDrawer row={open} est={est} t={t} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  );
}
