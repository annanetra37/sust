import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Download, Loader2, FileSpreadsheet, Scale, Search, Pencil, Trash2 } from 'lucide-react';
import feApi from '../../services/feApi';
import { useT } from '../../i18n';
import { HelpBanner } from '../../components/HelpSystem';
import {
  useFeSelection, PeriodPicker, PageHeader, ErrorBox, Notice, Field, Modal, FrozenNotice, Pager, Spinner, fmt, fmtM, errText,
} from './common';
import LineDrawer from './LineDrawer';

function Reconciliation({ recon, cur, t, uploadOutstanding }) {
  if (!recon) return null;
  const diff = recon.difference;
  const off = recon.differencePct != null && Math.abs(recon.differencePct) > 0.5;
  return (
    <div className="card !p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Scale className="w-4 h-4" />{t('fe.intake.recon')}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
        {uploadOutstanding != null && <div><p className="text-[11px] text-gray-500 dark:text-gray-400">{t('fe.intake.uploadTotal')}</p><p className="font-semibold text-gray-900 dark:text-white">{cur} {fmtM(uploadOutstanding)}</p></div>}
        <div><p className="text-[11px] text-gray-500 dark:text-gray-400">{t('fe.intake.periodTotal', { n: recon.lines })}</p><p className="font-semibold text-gray-900 dark:text-white">{cur} {fmtM(recon.periodOutstanding)}</p></div>
        <div><p className="text-[11px] text-gray-500 dark:text-gray-400">{t('fe.intake.ledger')}</p><p className="font-semibold text-gray-900 dark:text-white">{recon.ledgerTotal == null ? t('fe.intake.noLedger') : `${cur} ${fmtM(recon.ledgerTotal)}`}</p></div>
        <div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('fe.intake.difference')}</p>
          <p className={`font-semibold ${off ? 'text-amber-700 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
            {diff == null ? '—' : `${diff > 0 ? '+' : ''}${fmtM(diff)} (${fmt(recon.differencePct, 2)}%)`}
          </p>
        </div>
      </div>
    </div>
  );
}

function EditLine({ line, onClose, onSaved }) {
  const { t } = useT();
  const keys = ['outstanding', 'undrawn', 'valueAtOrigination', 'floorAreaM2', 'energyKwh', 'propertyType', 'energyLabel'];
  const [form, setForm] = useState(() => Object.fromEntries(keys.map((k) => [k, line[k] ?? ''])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError('');
    try {
      const payload = {};
      for (const k of keys) {
        if (['propertyType', 'energyLabel'].includes(k)) payload[k] = form[k] || null;
        else payload[k] = form[k] === '' ? null : Number(form[k]);
      }
      onSaved(await feApi.updateExposure(line.id, payload));
    } catch (err) { setError(errText(err, t('fe.errors.save'))); } finally { setBusy(false); }
  };
  return (
    <Modal title={t('fe.intake.editLine', { ref: line.facilityRef })} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button className="btn-primary flex items-center gap-2" disabled={busy} onClick={save}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button></>}>
      <div className="space-y-3">
        <ErrorBox message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {keys.map((k) => (
            <Field key={k} label={t(`fe.fields.${k}`)}>
              <input className="input" type={['propertyType', 'energyLabel'].includes(k) ? 'text' : 'number'} min="0" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
            </Field>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default function Intake() {
  const { t } = useT();
  const { period, portfolio } = useFeSelection();
  const classes = portfolio?.assetClasses || [];
  const [assetClass, setAssetClass] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(null);
  const [lines, setLines] = useState(null);
  const [q, setQ] = useState({ assetClass: '', q: '', page: 1 });
  const [drawer, setDrawer] = useState(null);
  const [editing, setEditing] = useState(null);
  const fileRef = useRef(null);
  const frozen = period && period.status !== 'OPEN';
  const cur = portfolio?.baseCurrency || 'AMD';

  useEffect(() => { if (classes.length && !classes.includes(assetClass)) setAssetClass(classes[0]); }, [classes, assetClass]);
  useEffect(() => { setResult(null); setQ({ assetClass: '', q: '', page: 1 }); }, [period?.id]);

  const loadHistory = useCallback(() => {
    if (!period) return;
    feApi.uploads(period.id).then(setHistory).catch((err) => setError(errText(err, t('fe.errors.load'))));
  }, [period, t]);
  const loadLines = useCallback(() => {
    if (!period) return;
    feApi.exposures(period.id, { ...q, pageSize: 25 }).then(setLines).catch((err) => setError(errText(err, t('fe.errors.load'))));
  }, [period, q, t]);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { loadLines(); }, [loadLines]);

  const doUpload = async () => {
    if (!file) { setError(t('fe.intake.chooseFile')); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await feApi.uploadTape(period.id, assetClass, file);
      setResult(r);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      loadHistory(); loadLines();
    } catch (err) { setError(errText(err, t('fe.errors.upload'))); } finally { setBusy(false); }
  };
  const dl = (fn) => fn().catch((err) => setError(errText(err, t('fe.errors.download'))));
  const removeLine = async (l) => {
    if (!window.confirm(t('fe.intake.confirmDelete', { ref: l.facilityRef }))) return;
    try { await feApi.deleteExposure(l.id); loadLines(); loadHistory(); } catch (err) { setError(errText(err, t('fe.errors.save'))); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <PageHeader icon={Upload} title={t('fe.intake.title')} subtitle={t('fe.intake.subtitle')} />
      <HelpBanner id="fe-intake" title={t('fe.intake.helpTitle')}>{t('fe.intake.helpBody')}</HelpBanner>
      <PeriodPicker />
      {period && (
        <>
          <FrozenNotice period={period} />
          <ErrorBox message={error} />

          <div className="card !p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('fe.intake.templates')}</h2>
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => (
                <button key={c} className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-1.5" onClick={() => dl(() => feApi.downloadTemplate(c))}>
                  <Download className="w-4 h-4" />{t(`fe.assetClasses.${c}`)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('fe.intake.templateHint')}</p>
          </div>

          <div className="card !p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('fe.intake.upload')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-3 items-end">
              <Field label={t('fe.fields.assetClass')}>
                <select className="input" value={assetClass} onChange={(e) => setAssetClass(e.target.value)} disabled={frozen}>
                  {classes.map((c) => <option key={c} value={c}>{t(`fe.assetClasses.${c}`)}</option>)}
                </select>
              </Field>
              <Field label={t('fe.intake.file')}>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="input !py-1.5" disabled={frozen} onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </Field>
              <button className="btn-primary flex items-center justify-center gap-2" onClick={doUpload} disabled={busy || frozen || !file}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{t('fe.intake.uploadBtn')}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('fe.intake.policy')}</p>
          </div>

          {result && (
            <div className="card !p-4 space-y-3">
              <Notice tone={result.errorCount ? 'warn' : 'ok'}>
                {t('fe.intake.result', { accepted: result.upload.acceptedRows, rejected: result.upload.rejectedRows, created: result.created, updated: result.updated })}
                {result.unknownColumns?.length > 0 && <span className="block mt-1">{t('fe.intake.unknownColumns', { cols: result.unknownColumns.join(', ') })}</span>}
              </Notice>
              {result.errorCount > 0 && (
                <>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('fe.intake.errors', { n: result.errorCount })}</h3>
                    <button className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-1.5" onClick={() => dl(() => feApi.downloadUploadErrors(result.upload.id))}><Download className="w-4 h-4" />{t('fe.intake.errorsCsv')}</button>
                  </div>
                  <div className="overflow-x-auto max-h-72 overflow-y-auto border border-gray-100 dark:border-gray-800 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-gray-500 dark:text-gray-400 sticky top-0 bg-white dark:bg-gray-900"><tr><th className="text-left p-2">{t('fe.intake.row')}</th><th className="text-left p-2">{t('fe.intake.field')}</th><th className="text-left p-2">{t('fe.intake.message')}</th></tr></thead>
                      <tbody>
                        {result.errors.map((e, i) => (
                          <tr key={i} className="border-t border-gray-50 dark:border-gray-800 text-gray-800 dark:text-gray-200"><td className="p-2">{e.row}</td><td className="p-2 font-mono text-xs">{e.field}</td><td className="p-2">{e.message}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          <Reconciliation recon={result?.reconciliation || history?.reconciliation} uploadOutstanding={result?.reconciliation?.uploadOutstanding} cur={cur} t={t} />

          <div className="card !p-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white p-4 pb-2">{t('fe.intake.history')}</h2>
            {!history ? <Spinner /> : history.uploads.length === 0 ? <p className="text-sm text-gray-500 px-4 pb-4">{t('fe.intake.noUploads')}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <tr><th className="text-left p-3">{t('fe.intake.file')}</th><th className="text-left p-3">{t('fe.fields.assetClass')}</th><th className="text-right p-3">{t('fe.intake.accepted')}</th><th className="text-right p-3">{t('fe.intake.rejected')}</th><th className="text-right p-3">{t('fe.fields.outstanding')}</th><th className="text-left p-3">{t('fe.intake.date')}</th><th /></tr>
                  </thead>
                  <tbody>
                    {history.uploads.map((u) => (
                      <tr key={u.id} className="border-b last:border-b-0 border-gray-50 dark:border-gray-800 text-gray-800 dark:text-gray-200">
                        <td className="p-3 break-all"><FileSpreadsheet className="w-4 h-4 inline mr-1 text-gray-400" />{u.fileName}</td>
                        <td className="p-3">{t(`fe.assetClasses.${u.assetClass}`)}</td>
                        <td className="p-3 text-right">{u.acceptedRows}</td>
                        <td className="p-3 text-right">{u.rejectedRows}</td>
                        <td className="p-3 text-right">{fmtM(u.totalOutstanding)}</td>
                        <td className="p-3 whitespace-nowrap">{new Date(u.createdAt).toLocaleString()}</td>
                        <td className="p-3">{u.rejectedRows > 0 && <button className="text-brand-600 dark:text-brand-400 text-xs hover:underline" onClick={() => dl(() => feApi.downloadUploadErrors(u.id))}>{t('fe.intake.errorsCsv')}</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card !p-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('fe.intake.lines')}</h2>
              <div className="flex gap-2 flex-wrap">
                <select className="input !w-auto !py-1.5 text-sm" value={q.assetClass} onChange={(e) => setQ({ ...q, assetClass: e.target.value, page: 1 })} aria-label={t('fe.fields.assetClass')}>
                  <option value="">{t('fe.common.all')}</option>
                  {classes.map((c) => <option key={c} value={c}>{t(`fe.assetClasses.${c}`)}</option>)}
                </select>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
                  <input className="input !py-1.5 !pl-8 text-sm !w-40" placeholder={t('fe.fields.facilityRef')} value={q.q} onChange={(e) => setQ({ ...q, q: e.target.value, page: 1 })} />
                </div>
              </div>
            </div>
            {!lines ? <Spinner /> : (
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <tr><th className="text-left p-2">{t('fe.fields.facilityRef')}</th><th className="text-left p-2">{t('fe.fields.assetClass')}</th><th className="text-left p-2">{t('fe.fields.counterparty')}</th><th className="text-right p-2">{t('fe.fields.outstanding')}</th><th className="text-right p-2">{t('fe.fields.valueAtOrigination')}</th><th className="text-left p-2">{t('fe.fields.branch')}</th><th /></tr>
                  </thead>
                  <tbody>
                    {lines.rows.map((l) => (
                      <tr key={l.id} className="border-b last:border-b-0 border-gray-50 dark:border-gray-800 text-gray-800 dark:text-gray-200">
                        <td className="p-2"><button className="font-medium text-brand-700 dark:text-brand-300 hover:underline" onClick={() => setDrawer(l.id)}>{l.facilityRef}</button></td>
                        <td className="p-2">{t(`fe.assetClasses.${l.assetClass}`)}</td>
                        <td className="p-2">{l.counterparty ? (l.counterparty.name || <span className="font-mono text-xs">{l.counterparty.stableId.slice(0, 10)}…</span>) : '—'}</td>
                        <td className="p-2 text-right">{l.currency} {fmt(l.outstanding)}</td>
                        <td className="p-2 text-right">{l.valueAtOrigination != null ? fmt(l.valueAtOrigination) : '—'}</td>
                        <td className="p-2">{l.branch || '—'}</td>
                        <td className="p-2 whitespace-nowrap text-right">
                          {!frozen && <>
                            <button className="text-gray-400 hover:text-gray-600 mr-2" onClick={() => setEditing(l)} aria-label={t('common.edit')}><Pencil className="w-4 h-4" /></button>
                            <button className="text-gray-400 hover:text-red-600" onClick={() => removeLine(l)} aria-label={t('common.delete')}><Trash2 className="w-4 h-4" /></button>
                          </>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lines.rows.length === 0 && <p className="text-sm text-gray-500 p-3">{t('fe.intake.noLines')}</p>}
                <Pager page={lines.page} pageSize={lines.pageSize} total={lines.total} onPage={(page) => setQ({ ...q, page })} />
              </div>
            )}
          </div>
        </>
      )}
      {drawer && <LineDrawer exposureId={drawer} onClose={() => setDrawer(null)} />}
      {editing && <EditLine line={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadLines(); loadHistory(); }} />}
    </div>
  );
}
