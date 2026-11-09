import { useCallback, useEffect, useState } from 'react';
import { Building2, Search, Loader2, Trash2, Plus, Lock, CheckCircle2 } from 'lucide-react';
import feApi from '../../services/feApi';
import { useT } from '../../i18n';
import { HelpBanner } from '../../components/HelpSystem';
import { PageHeader, ErrorBox, Notice, Field, Modal, Spinner, Pager, DqBadge, StatusBadge, fmt, fmtT, errText } from './common';

const SOURCES = ['reported', 'energy', 'production'];

function CounterpartyModal({ id, onClose, onChanged }) {
  const { t } = useT();
  const [c, setC] = useState(null);
  const [form, setForm] = useState(null);
  const [em, setEm] = useState({ year: new Date().getFullYear() - 1, source: 'reported', verified: false, scope1: '', scope2: '', notes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => feApi.counterparty(id).then((x) => {
    setC(x);
    setForm({ name: x.name || '', naceCode: x.naceCode || '', localSectorCode: x.localSectorCode || '', country: x.country || '', revenue: x.revenue ?? '', revenueCurrency: x.revenueCurrency || '', equityPlusDebt: x.equityPlusDebt ?? '' });
  }).catch((err) => setError(errText(err, t('fe.errors.load')))), [id, t]);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true); setError(''); setSaved(false);
    try {
      await feApi.updateCounterparty(id, {
        ...form,
        revenue: form.revenue === '' ? null : Number(form.revenue),
        equityPlusDebt: form.equityPlusDebt === '' ? null : Number(form.equityPlusDebt),
      });
      setSaved(true); await load(); onChanged();
    } catch (err) { setError(errText(err, t('fe.errors.save'))); } finally { setBusy(false); }
  };
  const addEm = async () => {
    setBusy(true); setError('');
    try {
      await feApi.addEmissions(id, { ...em, scope1: em.scope1 === '' ? null : Number(em.scope1), scope2: em.scope2 === '' ? null : Number(em.scope2) });
      setEm((x) => ({ ...x, scope1: '', scope2: '', notes: '' }));
      await load(); onChanged();
    } catch (err) { setError(errText(err, t('fe.errors.save'))); } finally { setBusy(false); }
  };
  const delEm = async (eid) => {
    try { await feApi.deleteEmissions(id, eid); await load(); onChanged(); } catch (err) { setError(errText(err, t('fe.errors.save'))); }
  };
  const score = (r) => (r.source === 'reported' ? (r.verified ? 1 : 2) : r.source === 'energy' ? 2 : 3);

  return (
    <Modal title={c ? (c.name || `${c.stableId.slice(0, 16)}…`) : t('fe.lineage.loading')} onClose={onClose} wide
      footer={c && !c.frozen && <><button className="btn-secondary" onClick={onClose}>{t('common.close')}</button><button className="btn-primary flex items-center gap-2" onClick={save} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button></>}>
      {!c ? <Spinner /> : (
        <div className="space-y-4">
          <ErrorBox message={error} />
          {saved && <Notice tone="ok"><CheckCircle2 className="w-4 h-4 inline mr-1" />{t('fe.counterparties.saved')}</Notice>}
          {c.frozen && <Notice tone="warn"><Lock className="w-4 h-4 inline mr-1" />{t('fe.counterparties.frozen')}</Notice>}
          <p className="text-[11px] text-gray-500 dark:text-gray-400 break-all">{t('fe.fields.stableId')}: <span className="font-mono">{c.stableId}</span></p>
          <fieldset disabled={c.frozen} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('fe.fields.name')} hint={t('fe.counterparties.nameHint')}><input className="input" value={form.name} onChange={set('name')} /></Field>
            <Field label={t('fe.fields.country')}><input className="input uppercase" maxLength={2} value={form.country} onChange={set('country')} /></Field>
            <Field label={t('fe.fields.naceCode')} hint={t('fe.counterparties.naceHint')}><input className="input uppercase" value={form.naceCode} onChange={set('naceCode')} /></Field>
            <Field label={t('fe.fields.localSectorCode')}><input className="input" value={form.localSectorCode} onChange={set('localSectorCode')} /></Field>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <Field label={t('fe.fields.revenue')}><input className="input" type="number" min="0" value={form.revenue} onChange={set('revenue')} /></Field>
              <Field label={t('fe.fields.currency')}><input className="input uppercase" maxLength={3} value={form.revenueCurrency} onChange={set('revenueCurrency')} /></Field>
            </div>
            <Field label={t('fe.fields.equityPlusDebt')}><input className="input" type="number" min="0" value={form.equityPlusDebt} onChange={set('equityPlusDebt')} /></Field>
          </fieldset>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('fe.counterparties.emissions')}</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('fe.counterparties.emissionsHint')}</p>
            {c.emissions.length > 0 && (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="text-xs text-gray-500 dark:text-gray-400"><tr><th className="text-left p-2">{t('fe.counterparties.year')}</th><th className="text-left p-2">{t('fe.counterparties.source')}</th><th className="text-right p-2">{t('fe.lineage.scope1')}</th><th className="text-right p-2">{t('fe.lineage.scope2')}</th><th className="text-center p-2">{t('fe.counterparties.ladder')}</th><th /></tr></thead>
                  <tbody>
                    {c.emissions.map((r) => (
                      <tr key={r.id} className="border-t border-gray-50 dark:border-gray-800 text-gray-800 dark:text-gray-200">
                        <td className="p-2">{r.year}</td>
                        <td className="p-2">{t(`fe.sources.${r.source}`)}{r.verified && <span className="badge ml-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{t('fe.counterparties.verified')}</span>}</td>
                        <td className="p-2 text-right">{fmtT(r.scope1)}</td>
                        <td className="p-2 text-right">{fmtT(r.scope2)}</td>
                        <td className="p-2 text-center"><DqBadge score={score(r)} /></td>
                        <td className="p-2 text-right">{!c.frozen && <button className="text-gray-400 hover:text-red-600" onClick={() => delEm(r.id)} aria-label={t('common.delete')}><Trash2 className="w-4 h-4" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!c.frozen && (
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mt-3 items-end">
                <Field label={t('fe.counterparties.year')}><input className="input" type="number" value={em.year} onChange={(e) => setEm({ ...em, year: e.target.value })} /></Field>
                <div className="col-span-1 sm:col-span-2">
                  <Field label={t('fe.counterparties.source')}>
                    <select className="input" value={em.source} onChange={(e) => setEm({ ...em, source: e.target.value })}>
                      {SOURCES.map((s) => <option key={s} value={s}>{t(`fe.sources.${s}`)}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label={`${t('fe.lineage.scope1')} (t)`}><input className="input" type="number" min="0" value={em.scope1} onChange={(e) => setEm({ ...em, scope1: e.target.value })} /></Field>
                <Field label={`${t('fe.lineage.scope2')} (t)`}><input className="input" type="number" min="0" value={em.scope2} onChange={(e) => setEm({ ...em, scope2: e.target.value })} /></Field>
                <button className="btn-secondary flex items-center justify-center gap-1" onClick={addEm} disabled={busy}><Plus className="w-4 h-4" />{t('fe.counterparties.add')}</button>
                {em.source === 'reported' && (
                  <label className="col-span-2 sm:col-span-6 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={em.verified} onChange={(e) => setEm({ ...em, verified: e.target.checked })} />{t('fe.counterparties.verifiedLabel')}
                  </label>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('fe.counterparties.lines')}</h3>
            {c.exposures.map((e) => (
              <p key={e.id} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2 flex-wrap">
                <span className="font-medium">{e.facilityRef}</span> · {t(`fe.assetClasses.${e.assetClass}`)} · {e.currency} {fmt(e.outstanding)} · {e.period.name} <StatusBadge status={e.period.status} />
              </p>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Counterparties() {
  const { t } = useT();
  const [q, setQ] = useState({ q: '', unmapped: '', page: 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    feApi.counterparties({ ...q, pageSize: 50 }).then(setData).catch((err) => { setError(errText(err, t('fe.errors.load'))); setData({ rows: [], total: 0, page: 1, pageSize: 50 }); });
  }, [q, t]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <PageHeader icon={Building2} title={t('fe.counterparties.title')} subtitle={t('fe.counterparties.subtitle')} />
      <HelpBanner id="fe-counterparties" title={t('fe.counterparties.helpTitle')}>{t('fe.counterparties.helpBody')}</HelpBanner>
      <ErrorBox message={error} />
      <div className="card !p-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute left-2.5 top-3 text-gray-400" />
          <input className="input !pl-8" placeholder={t('fe.counterparties.search')} value={q.q} onChange={(e) => setQ({ ...q, q: e.target.value, page: 1 })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={q.unmapped === '1'} onChange={(e) => setQ({ ...q, unmapped: e.target.checked ? '1' : '', page: 1 })} />{t('fe.counterparties.onlyUnmapped')}
        </label>
      </div>
      {!data ? <Spinner /> : (
        <div className="card !p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="text-left p-3">{t('fe.fields.stableId')}</th>
                <th className="text-left p-3">{t('fe.fields.name')}</th>
                <th className="text-left p-3">{t('fe.fields.naceCode')}</th>
                <th className="text-left p-3">{t('fe.fields.country')}</th>
                <th className="text-right p-3">{t('fe.fields.revenue')}</th>
                <th className="text-right p-3">{t('fe.fields.equityPlusDebt')}</th>
                <th className="text-center p-3">{t('fe.counterparties.latestDq')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((c) => (
                <tr key={c.id} onClick={() => setOpen(c.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 border-b last:border-b-0 border-gray-50 dark:border-gray-800 text-gray-800 dark:text-gray-200">
                  <td className="p-3 font-mono text-xs">{c.stableId.slice(0, 12)}…</td>
                  <td className="p-3">{c.name || <span className="text-gray-400">{t('fe.counterparties.noName')}</span>}</td>
                  <td className="p-3">
                    {c.naceCode || c.localSectorCode || '—'}
                    {!c.mapped && <span className="badge ml-1 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">{t('fe.counterparties.unmapped')}</span>}
                  </td>
                  <td className="p-3">{c.country || '—'}</td>
                  <td className="p-3 text-right">{c.revenue != null ? `${c.revenueCurrency || ''} ${fmt(c.revenue / 1e6, 1)}M` : '—'}</td>
                  <td className="p-3 text-right">{c.equityPlusDebt != null ? `${fmt(c.equityPlusDebt / 1e6, 1)}M` : <span className="text-amber-700 dark:text-amber-400">{t('fe.counterparties.missing')}</span>}</td>
                  <td className="p-3 text-center"><DqBadge score={c.latestDq} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length === 0 && <p className="text-sm text-gray-500 p-4">{t('fe.counterparties.empty')}</p>}
          <div className="px-3 pb-3"><Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setQ({ ...q, page })} /></div>
        </div>
      )}
      {open && <CounterpartyModal id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
