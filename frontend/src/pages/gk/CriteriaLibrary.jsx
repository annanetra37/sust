import { useState, useRef } from 'react';
import { BookOpen, Plus, Upload, Download, Pencil, Trash2, Copy } from 'lucide-react';
import gkApi from '../../services/gkApi';
import { useT } from '../../i18n';
import { Loading, ErrorBox, Modal, Field, Note, TypeBadge, errText, useLoad, downloadText } from './ui';

const AUDIT_METHODS = ['document', 'sampling', 'visual', 'interview'];
const DATA_LINKS = ['energy', 'water', 'waste', 'occupancy', 'targets', 'actions', 'team', 'training'];
const IMPORT_COLUMNS = ['code', 'version', 'area', 'subArea', 'title', 'guidance', 'type', 'applicability', 'evidenceTypes', 'auditMethod', 'dataLink'];

const emptyCriterion = () => ({ code: '', version: '2026-2031', area: 1, subArea: '', title: '', guidance: '', type: 'guideline', applicability: '{}', evidenceTypes: '', auditMethod: '', dataLink: '' });

function CriterionForm({ initial, areas, onClose, onSaved, t }) {
  const [f, setF] = useState(initial ? {
    ...emptyCriterion(), ...initial,
    applicability: JSON.stringify(initial.applicability || {}, null, 2),
    evidenceTypes: (initial.evidenceTypes || []).join('; '),
    subArea: initial.subArea || '', guidance: initial.guidance || '', auditMethod: initial.auditMethod || '', dataLink: initial.dataLink || '',
  } : emptyCriterion());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = initial && initial.id && initial.companyId;
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = async () => {
    setBusy(true); setErr('');
    try {
      let applicability;
      try { applicability = f.applicability.trim() ? JSON.parse(f.applicability) : {}; } catch { throw { error: t('gk.criteria.badJson') }; }
      const body = {
        code: f.code, version: f.version, area: Number(f.area), subArea: f.subArea, title: f.title, guidance: f.guidance, type: f.type,
        applicability, evidenceTypes: f.evidenceTypes, auditMethod: f.auditMethod || null, dataLink: f.dataLink || null,
      };
      onSaved(editing ? await gkApi.updateCriterion(initial.id, body) : await gkApi.createCriterion(body));
    } catch (ex) { setErr(errText(ex)); } finally { setBusy(false); }
  };
  const area = areas.find((a) => a.area === Number(f.area));
  return (
    <Modal title={editing ? t('gk.criteria.edit', { code: initial.code }) : t('gk.criteria.add')} onClose={onClose} wide
      footer={<><button className="btn-secondary" onClick={onClose}>{t('gk.cancel')}</button><button className="btn-primary" disabled={busy} onClick={save}>{t('gk.save')}</button></>}
    >
      <div className="space-y-3">
        <Note tone="warning">{t('gk.criteria.paraphraseRule')}</Note>
        <ErrorBox message={err} />
        <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-4">
          <Field label={t('gk.criteria.code')}><input className="input" value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="3.2" /></Field>
          <Field label={t('gk.criteria.version')}>
            <select className="input" value={f.version} onChange={(e) => set('version', e.target.value)}><option value="2026-2031">2026–2031</option><option value="2022-2026">2022–2026</option></select>
          </Field>
          <Field label={t('gk.criteria.area')}>
            <select className="input" value={f.area} onChange={(e) => set('area', e.target.value)}>{areas.map((a) => <option key={a.area} value={a.area}>{a.area} · {t(`gk.area.${a.area}`)}</option>)}</select>
          </Field>
          <Field label={t('gk.criteria.type')}>
            <select className="input" value={f.type} onChange={(e) => set('type', e.target.value)}><option value="imperative">{t('gk.type.imperative')}</option><option value="guideline">{t('gk.type.guideline')}</option></select>
          </Field>
        </div>
        <Field label={t('gk.criteria.subArea')}>
          <input className="input" list="gk-subareas" value={f.subArea} onChange={(e) => set('subArea', e.target.value)} />
          <datalist id="gk-subareas">{(area?.subAreas || []).map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label={t('gk.criteria.title')} hint={t('gk.criteria.titleHint')}><input className="input" maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label={t('gk.criteria.guidance')} hint={t('gk.criteria.guidanceHint')}><textarea className="input" rows={3} maxLength={1500} value={f.guidance} onChange={(e) => set('guidance', e.target.value)} /></Field>
        <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-3">
          <Field label={t('gk.criteria.evidenceTypes')} hint={t('gk.criteria.evidenceTypesHint')}><input className="input" value={f.evidenceTypes} onChange={(e) => set('evidenceTypes', e.target.value)} /></Field>
          <Field label={t('gk.criteria.auditMethod')}>
            <select className="input" value={f.auditMethod} onChange={(e) => set('auditMethod', e.target.value)}><option value="">—</option>{AUDIT_METHODS.map((m) => <option key={m} value={m}>{t(`gk.auditMethod.${m}`)}</option>)}</select>
          </Field>
          <Field label={t('gk.criteria.dataLink')}>
            <select className="input" value={f.dataLink} onChange={(e) => set('dataLink', e.target.value)}><option value="">—</option>{DATA_LINKS.map((m) => <option key={m} value={m}>{t(`gk.dataLink.${m}`)}</option>)}</select>
          </Field>
        </div>
        <Field label={t('gk.criteria.applicability')} hint={t('gk.criteria.applicabilityHint')}>
          <textarea className="input font-mono text-xs" rows={5} value={f.applicability} onChange={(e) => set('applicability', e.target.value)} spellCheck={false} />
        </Field>
      </div>
    </Modal>
  );
}

function ImportModal({ onClose, onDone, t }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  const run = async () => {
    setBusy(true); setErr('');
    try {
      const trimmed = text.trim();
      let body;
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        body = { criteria: Array.isArray(parsed) ? parsed : parsed.criteria };
      } else body = { csv: trimmed };
      const r = await gkApi.importCriteria(body);
      onDone(r);
    } catch (ex) { setErr(ex instanceof SyntaxError ? t('gk.criteria.badJson') : errText(ex)); } finally { setBusy(false); }
  };
  const template = () => downloadText(`${IMPORT_COLUMNS.join(',')}\n9.9,2026-2031,4,Energy management,Short paraphrased title,Short paraphrased guidance,guideline,"{""minEmployees"":51}",meter log;invoice,document,energy\n`, 'gk-criteria-template.csv');
  return (
    <Modal title={t('gk.criteria.import')} onClose={onClose} wide
      footer={<><button className="btn-secondary" onClick={onClose}>{t('gk.cancel')}</button><button className="btn-primary" disabled={busy || !text.trim()} onClick={run}>{t('gk.criteria.importRun')}</button></>}
    >
      <div className="space-y-3">
        <Note>{t('gk.criteria.importHelp', { cols: IMPORT_COLUMNS.join(', ') })}</Note>
        <Note tone="warning">{t('gk.criteria.paraphraseRule')}</Note>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={template}><Download className="w-4 h-4" />{t('gk.downloadTemplate')}</button>
          <button className="btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4" />{t('gk.chooseFile')}</button>
          <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ''; }} />
        </div>
        <ErrorBox message={err} />
        <textarea className="input font-mono text-xs" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('gk.criteria.importPlaceholder')} spellCheck={false} />
      </div>
    </Modal>
  );
}

export default function CriteriaLibrary() {
  const { t } = useT();
  const [filters, setFilters] = useState({ version: '2026-2031', area: '', type: '' });
  const { data, loading, error, reload } = useLoad(() => gkApi.criteria(filters), [filters.version, filters.area, filters.type]);
  const [modal, setModal] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const areas = data?.areas || [];

  const del = async (c) => {
    if (!window.confirm(t('gk.criteria.confirmDelete', { code: c.code }))) return;
    try { await gkApi.deleteCriterion(c.id); reload(); } catch (ex) { setErr(errText(ex)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('gk.criteria.pageTitle')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('gk.criteria.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary inline-flex items-center gap-1.5" onClick={() => setModal({ kind: 'import' })}><Upload className="w-4 h-4" />{t('gk.criteria.import')}</button>
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={() => setModal({ kind: 'form' })}><Plus className="w-4 h-4" />{t('gk.criteria.add')}</button>
        </div>
      </div>
      <Note tone="warning">{t('gk.criteria.starterNote')}</Note>
      {msg && <Note>{msg}</Note>}
      <ErrorBox message={error || err} />

      <div className="card !p-4 grid [&>*]:min-w-0 gap-3 sm:grid-cols-3">
        <Field label={t('gk.criteria.version')}>
          <select className="input" value={filters.version} onChange={(e) => setFilters({ ...filters, version: e.target.value })}><option value="2026-2031">2026–2031</option><option value="2022-2026">2022–2026</option></select>
        </Field>
        <Field label={t('gk.criteria.area')}>
          <select className="input" value={filters.area} onChange={(e) => setFilters({ ...filters, area: e.target.value })}>
            <option value="">{t('gk.all')}</option>{[1, 2, 3, 4, 5, 6, 7].map((a) => <option key={a} value={a}>{a} · {t(`gk.area.${a}`)}</option>)}
          </select>
        </Field>
        <Field label={t('gk.criteria.type')}>
          <select className="input" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="">{t('gk.all')}</option><option value="imperative">{t('gk.type.imperative')}</option><option value="guideline">{t('gk.type.guideline')}</option>
          </select>
        </Field>
      </div>

      {loading ? <Loading /> : (
        <div className="space-y-5">
          {(filters.area ? areas.filter((a) => a.area === Number(filters.area)) : areas).map((a) => {
            const list = (data?.criteria || []).filter((c) => c.area === a.area);
            return (
              <section key={a.area} className="card !p-4">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><BookOpen className="w-4 h-4" />{a.area}. {t(`gk.area.${a.area}`)}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{a.subAreas.join(' · ')}</p>
                {list.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400 italic">{t('gk.criteria.noneInArea')}</p> : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {list.map((c) => (
                      <li key={c.id} className="py-2.5 flex flex-wrap sm:flex-nowrap items-start gap-x-3 gap-y-2">
                        <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white w-12 shrink-0">{c.code}</span>
                        <div className="min-w-[12rem] flex-1">
                          <p className="text-sm text-gray-900 dark:text-white">{c.title}</p>
                          {c.guidance && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.guidance}</p>}
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            <TypeBadge type={c.type} t={t} />
                            {c.applicability?.typeByEmployees && <span className="badge bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{t('gk.criteria.typeBySize', { n: c.applicability.typeByEmployees.threshold })}</span>}
                            {c.applicability && Object.keys(c.applicability).filter((k) => k !== 'typeByEmployees').map((k) => <span key={k} className="badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 font-mono">{k}</span>)}
                            <span className={`badge ${c.companyId ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                              {c.companyId ? (c.overridesGlobal ? t('gk.criteria.override') : t('gk.criteria.yours')) : t('gk.criteria.starter')}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {c.companyId ? (
                            <>
                              <button className="btn-secondary !px-2 !py-1.5" onClick={() => setModal({ kind: 'form', criterion: c })} aria-label={t('gk.edit')}><Pencil className="w-4 h-4" /></button>
                              <button className="btn-secondary !px-2 !py-1.5 text-red-600" onClick={() => del(c)} aria-label={t('gk.delete')}><Trash2 className="w-4 h-4" /></button>
                            </>
                          ) : (
                            <button className="btn-secondary !px-2 !py-1.5 inline-flex items-center gap-1 text-xs" onClick={() => setModal({ kind: 'form', criterion: { ...c, id: null, companyId: null } })} title={t('gk.criteria.overrideHint')}><Copy className="w-3.5 h-3.5" />{t('gk.criteria.customise')}</button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      {modal?.kind === 'form' && <CriterionForm initial={modal.criterion} areas={areas} t={t} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'import' && <ImportModal t={t} onClose={() => setModal(null)} onDone={(r) => { setModal(null); setMsg(t('gk.criteria.imported', { created: r.created, updated: r.updated })); reload(); }} />}
    </div>
  );
}
