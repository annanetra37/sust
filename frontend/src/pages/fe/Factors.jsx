import { useCallback, useEffect, useState } from 'react';
import { Library, Plus, Upload, Download, Trash2, Loader2, ChevronDown, ChevronRight, Save } from 'lucide-react';
import feApi from '../../services/feApi';
import { useT } from '../../i18n';
import { HelpBanner } from '../../components/HelpSystem';
import { useFeSelection, PageHeader, ErrorBox, Notice, Field, Modal, Spinner, FrozenNotice, fmt, fmtM, errText } from './common';

function NewSet({ onClose, onSaved }) {
  const { t } = useT();
  const [form, setForm] = useState({ name: '', version: '1', source: '', illustrative: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true); setError('');
    try { onSaved(await feApi.createFactorSet(form)); } catch (err) { setError(errText(err, t('fe.errors.save'))); } finally { setBusy(false); }
  };
  return (
    <Modal title={t('fe.factors.newSet')} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button className="btn-primary flex items-center gap-2" onClick={save} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button></>}>
      <div className="space-y-3">
        <ErrorBox message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
          <Field label={`${t('fe.factors.name')} *`}><input className="input" value={form.name} onChange={set('name')} /></Field>
          <Field label={`${t('fe.factors.version')} *`}><input className="input" value={form.version} onChange={set('version')} /></Field>
        </div>
        <Field label={`${t('fe.factors.source')} *`} hint={t('fe.factors.sourceHint')}><input className="input" value={form.source} onChange={set('source')} /></Field>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={form.illustrative} onChange={(e) => setForm((f) => ({ ...f, illustrative: e.target.checked }))} />{t('fe.factors.markIllustrative')}
        </label>
      </div>
    </Modal>
  );
}

function SetRow({ s, onChanged, setError }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rowErrors, setRowErrors] = useState(null);
  const load = useCallback(() => feApi.factorSet(s.id).then(setDetail).catch((err) => setError(errText(err, t('fe.errors.load')))), [s.id, setError, t]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setRowErrors(null); setError('');
    try { await feApi.uploadFactors(s.id, file); await load(); onChanged(); } catch (err) {
      setError(errText(err, t('fe.errors.upload')));
      if (err.rowErrors) setRowErrors(err.rowErrors);
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(t('fe.factors.confirmDelete', { name: s.name }))) return;
    try { await feApi.deleteFactorSet(s.id); onChanged(); } catch (err) { setError(errText(err, t('fe.errors.save'))); }
  };
  const locked = detail ? detail.usedByRuns > 0 || detail.global : s.global;

  return (
    <div className="border-b last:border-b-0 border-gray-100 dark:border-gray-800 py-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <button className="text-left flex items-start gap-1 min-w-0" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? <ChevronDown className="w-4 h-4 mt-0.5 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />}
          <span className="min-w-0">
            <span className="font-medium text-gray-900 dark:text-white break-words">{s.name}</span> <span className="text-gray-500">v{s.version}</span>
            {s.illustrative && <span className="badge ml-1 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">{t('fe.factors.illustrativeTag')}</span>}
            {s.global && <span className="badge ml-1 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{t('fe.factors.global')}</span>}
            <span className="block text-xs text-gray-500 dark:text-gray-400 break-words">{s.source} · {t('fe.factors.count', { n: s._count?.factors ?? 0 })}</span>
          </span>
        </button>
        {!s.global && (
          <div className="flex gap-2">
            <label className={`btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-1.5 cursor-pointer ${busy ? 'opacity-50' : ''}`}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{t('fe.factors.upload')}
              <input type="file" accept=".csv,.xlsx" className="hidden" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <button className="btn-secondary !px-3 text-red-600" onClick={remove} aria-label={t('common.delete')}><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>
      {rowErrors && (
        <ul className="mt-2 text-xs text-red-700 dark:text-red-300 list-disc pl-5 max-h-40 overflow-y-auto">
          {rowErrors.map((e, i) => <li key={i}>{t('fe.intake.row')} {e.row} · {e.field}: {e.message}</li>)}
        </ul>
      )}
      {open && (
        !detail ? <Spinner /> : (
          <div className="mt-2">
            {locked && !detail.global && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('fe.factors.inUse', { n: detail.usedByRuns })}</p>}
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead className="text-gray-500 dark:text-gray-400 sticky top-0 bg-white dark:bg-gray-900"><tr><th className="text-left p-1.5">kind</th><th className="text-left p-1.5">key</th><th className="text-left p-1.5">region</th><th className="text-left p-1.5">currency</th><th className="text-right p-1.5">value</th><th className="text-left p-1.5">unit</th><th className="text-left p-1.5">notes</th></tr></thead>
                <tbody>
                  {detail.factors.map((f) => (
                    <tr key={f.id} className="border-t border-gray-50 dark:border-gray-800 text-gray-800 dark:text-gray-200">
                      <td className="p-1.5">{f.kind}</td><td className="p-1.5 font-mono">{f.key}</td><td className="p-1.5">{f.region || '—'}</td><td className="p-1.5">{f.currency || '—'}</td>
                      <td className="p-1.5 text-right">{fmt(f.value, 4)}</td><td className="p-1.5">{f.unit}</td><td className="p-1.5">{f.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detail.factors.length === 0 && <p className="text-sm text-gray-500 p-2">{t('fe.factors.noFactors')}</p>}
            </div>
          </div>
        )
      )}
    </div>
  );
}

function SectorMapping() {
  const { t } = useT();
  const { period } = useFeSelection();
  const [maps, setMaps] = useState(null);
  const [queue, setQueue] = useState(null);
  const [draft, setDraft] = useState({});
  const [manual, setManual] = useState({ code: '', factorKey: '' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const frozen = period && period.status !== 'OPEN';

  const load = useCallback(() => {
    feApi.sectorMap().then(setMaps).catch((err) => setError(errText(err, t('fe.errors.load'))));
    if (period) feApi.unmapped(period.id).then(setQueue).catch(() => setQueue([]));
  }, [period, t]);
  useEffect(() => { load(); }, [load]);

  const save = async (mappings) => {
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await feApi.saveSectorMap(mappings, period?.id);
      setMsg(t('fe.factors.mapSaved', { n: r.saved }));
      setDraft({}); setManual({ code: '', factorKey: '' }); load();
    } catch (err) { setError(errText(err, t('fe.errors.save'))); } finally { setBusy(false); }
  };
  const bulk = Object.entries(draft).filter(([, v]) => v.trim()).map(([code, factorKey]) => ({ code, factorKey: factorKey.trim() }));

  return (
    <div className="card !p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('fe.factors.mapping')}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('fe.factors.mappingHint')}</p>
      </div>
      <FrozenNotice period={period} />
      <ErrorBox message={error} />
      {msg && <Notice tone="ok">{msg}</Notice>}

      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t('fe.factors.queue', { period: period?.name || '—' })}</h3>
        {!queue ? <Spinner /> : queue.length === 0 ? <p className="text-sm text-gray-500 mt-1">{t('fe.factors.queueEmpty')}</p> : (
          <>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="text-xs text-gray-500 dark:text-gray-400"><tr><th className="text-left p-2">{t('fe.factors.code')}</th><th className="text-right p-2">{t('feNav.counterparties')}</th><th className="text-right p-2">{t('fe.fields.outstanding')}</th><th className="text-left p-2">{t('fe.factors.mapTo')}</th></tr></thead>
                <tbody>
                  {queue.map((g) => (
                    <tr key={g.code || 'blank'} className="border-t border-gray-50 dark:border-gray-800 text-gray-800 dark:text-gray-200">
                      <td className="p-2 font-mono">{g.code || <span className="text-gray-400 font-sans">{t('fe.factors.blank')}</span>}</td>
                      <td className="p-2 text-right">{g.counterparties}</td>
                      <td className="p-2 text-right">{fmtM(g.outstanding)}</td>
                      <td className="p-2">
                        {g.code
                          ? <input className="input !py-1 !w-32 uppercase" placeholder="55.10" value={draft[g.code] || ''} disabled={frozen} onChange={(e) => setDraft((d) => ({ ...d, [g.code]: e.target.value }))} />
                          : <span className="text-xs text-gray-500">{t('fe.factors.blankHint')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn-primary mt-2 flex items-center gap-2" disabled={busy || frozen || !bulk.length} onClick={() => save(bulk)}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{t('fe.factors.saveBulk', { n: bulk.length })}
            </button>
          </>
        )}
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t('fe.factors.rules')}</h3>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end mt-2 max-w-lg">
          <Field label={t('fe.factors.code')}><input className="input" value={manual.code} onChange={(e) => setManual({ ...manual, code: e.target.value })} /></Field>
          <Field label={t('fe.factors.mapTo')}><input className="input uppercase" placeholder="C" value={manual.factorKey} onChange={(e) => setManual({ ...manual, factorKey: e.target.value })} /></Field>
          <button className="btn-secondary flex items-center gap-1" disabled={busy || !manual.code || !manual.factorKey} onClick={() => save([manual])}><Plus className="w-4 h-4" /></button>
        </div>
        {maps && maps.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800 text-sm">
            {maps.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-1.5 text-gray-800 dark:text-gray-200">
                <span><span className="font-mono">{m.code}</span> → <span className="font-mono">{m.factorKey}</span></span>
                <button className="text-gray-400 hover:text-red-600" onClick={() => feApi.deleteSectorMap(m.id).then(load).catch((err) => setError(errText(err, t('fe.errors.save'))))} aria-label={t('common.delete')}><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function Factors() {
  const { t } = useT();
  const [sets, setSets] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => feApi.factorSets().then(setSets).catch((err) => { setError(errText(err, t('fe.errors.load'))); setSets([]); }), [t]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <PageHeader icon={Library} title={t('fe.factors.title')} subtitle={t('fe.factors.subtitle')}>
        <button className="btn-secondary flex items-center gap-2" onClick={() => feApi.downloadFactorTemplate().catch((err) => setError(errText(err, t('fe.errors.download'))))}><Download className="w-4 h-4" />{t('fe.factors.template')}</button>
        <button className="btn-primary flex items-center gap-2" onClick={() => setCreating(true)}><Plus className="w-4 h-4" />{t('fe.factors.newSet')}</button>
      </PageHeader>
      <HelpBanner id="fe-factors" title={t('fe.factors.helpTitle')}>{t('fe.factors.helpBody')}</HelpBanner>
      <ErrorBox message={error} />
      <div className="card !p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('fe.factors.sets')}</h2>
        {!sets ? <Spinner /> : sets.length === 0 ? <p className="text-sm text-gray-500 mt-2">{t('fe.factors.noSets')}</p> : sets.map((s) => <SetRow key={s.id} s={s} onChanged={load} setError={setError} />)}
      </div>
      <SectorMapping />
      {creating && <NewSet onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
}
