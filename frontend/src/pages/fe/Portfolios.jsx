import { useState } from 'react';
import { Briefcase, Plus, Pencil, Trash2, Loader2, CalendarPlus } from 'lucide-react';
import feApi from '../../services/feApi';
import { useT } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { HelpBanner } from '../../components/HelpSystem';
import { useFeSelection, PageHeader, ErrorBox, Spinner, Modal, Field, StatusBadge, ASSET_CLASSES, fmt, errText } from './common';

const MVP = ['business_loans', 'commercial_re', 'mortgages'];

function PortfolioForm({ initial, onClose, onSaved }) {
  const { t } = useT();
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    legalEntity: initial?.legalEntity || '',
    baseCurrency: initial?.baseCurrency || 'AMD',
    fxSource: initial?.fxSource || '',
    assetClasses: initial?.assetClasses || MVP,
    inflationAdjust: !!initial?.inflationAdjust,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (c) => setForm((f) => ({ ...f, assetClasses: f.assetClasses.includes(c) ? f.assetClasses.filter((x) => x !== c) : [...f.assetClasses, c] }));

  const save = async () => {
    setError('');
    if (!form.name.trim()) { setError(t('fe.errors.required')); return; }
    if (!/^[A-Za-z]{3}$/.test(form.baseCurrency)) { setError(t('fe.errors.currency')); return; }
    if (!form.assetClasses.length) { setError(t('fe.portfolios.needClass')); return; }
    setBusy(true);
    try {
      const payload = { ...form, baseCurrency: form.baseCurrency.toUpperCase() };
      const saved = initial ? await feApi.updatePortfolio(initial.id, payload) : await feApi.createPortfolio(payload);
      onSaved(saved);
    } catch (err) { setError(errText(err, t('fe.errors.save'))); } finally { setBusy(false); }
  };

  return (
    <Modal
      title={initial ? t('fe.portfolios.edit') : t('fe.portfolios.add')}
      onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary flex items-center gap-2" onClick={save} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button></>}
    >
      <div className="space-y-4">
        <ErrorBox message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={`${t('fe.fields.portfolioName')} *`}><input className="input" value={form.name} onChange={set('name')} /></Field>
          <Field label={t('fe.fields.legalEntity')}><input className="input" value={form.legalEntity} onChange={set('legalEntity')} /></Field>
          <Field label={t('fe.fields.baseCurrency')} hint={t('fe.portfolios.currencyHint')}><input className="input uppercase" maxLength={3} value={form.baseCurrency} onChange={set('baseCurrency')} /></Field>
          <Field label={t('fe.fields.fxSource')}><input className="input" value={form.fxSource} onChange={set('fxSource')} placeholder={t('fe.portfolios.fxPlaceholder')} /></Field>
        </div>
        <fieldset>
          <legend className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('fe.fields.assetClasses')}</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {ASSET_CLASSES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={form.assetClasses.includes(c)} onChange={() => toggle(c)} />
                {t(`fe.assetClasses.${c}`)}{!MVP.includes(c) && <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-[10px]">{t('fe.portfolios.basic')}</span>}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" className="mt-1" checked={form.inflationAdjust} onChange={(e) => setForm((f) => ({ ...f, inflationAdjust: e.target.checked }))} />
          <span>{t('fe.fields.inflationAdjust')}<span className="block text-[11px] text-gray-500">{t('fe.portfolios.inflationHint')}</span></span>
        </label>
      </div>
    </Modal>
  );
}

function PeriodForm({ portfolio, initial, onClose, onSaved }) {
  const { t } = useT();
  const [form, setForm] = useState(() => ({
    name: initial?.name || `FY${new Date().getFullYear() - 1}`,
    reportingDate: initial ? String(initial.reportingDate).slice(0, 10) : `${new Date().getFullYear() - 1}-12-31`,
    ledgerTotal: initial?.ledgerTotal ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setError('');
    if (!form.name.trim() || !form.reportingDate) { setError(t('fe.errors.required')); return; }
    if (form.ledgerTotal !== '' && !(Number(form.ledgerTotal) >= 0)) { setError(t('fe.errors.nonNegative')); return; }
    setBusy(true);
    try {
      const payload = { ...form, ledgerTotal: form.ledgerTotal === '' ? null : Number(form.ledgerTotal) };
      const saved = initial ? await feApi.updatePeriod(initial.id, payload) : await feApi.createPeriod(portfolio.id, payload);
      onSaved(saved);
    } catch (err) { setError(errText(err, t('fe.errors.save'))); } finally { setBusy(false); }
  };
  return (
    <Modal
      title={initial ? t('fe.portfolios.editPeriod') : t('fe.portfolios.addPeriod', { name: portfolio.name })}
      onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary flex items-center gap-2" onClick={save} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button></>}
    >
      <div className="space-y-3">
        <ErrorBox message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={`${t('fe.fields.periodName')} *`}><input className="input" value={form.name} onChange={set('name')} /></Field>
          <Field label={`${t('fe.fields.reportingDate')} *`}><input className="input" type="date" value={form.reportingDate} onChange={set('reportingDate')} /></Field>
          <div className="sm:col-span-2">
            <Field label={t('fe.fields.ledgerTotal', { cur: portfolio.baseCurrency })} hint={t('fe.portfolios.ledgerHint')}>
              <input className="input" type="number" min="0" value={form.ledgerTotal} onChange={set('ledgerTotal')} />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function Portfolios() {
  const { t } = useT();
  const { user } = useAuth();
  const { portfolios, reload, select, error: loadError } = useFeSelection();
  const [editing, setEditing] = useState(null); // portfolio | 'new'
  const [periodForm, setPeriodForm] = useState(null); // { portfolio, initial }
  const [error, setError] = useState('');
  const admin = user?.role === 'ADMIN';

  const remove = async (fn, msg) => {
    if (!window.confirm(msg)) return;
    setError('');
    try { await fn(); await reload(); } catch (err) { setError(errText(err, t('fe.errors.save'))); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <PageHeader icon={Briefcase} title={t('fe.portfolios.title')} subtitle={t('fe.portfolios.subtitle')}>
        <button className="btn-primary flex items-center gap-2" onClick={() => setEditing('new')}><Plus className="w-4 h-4" />{t('fe.portfolios.add')}</button>
      </PageHeader>
      <HelpBanner id="fe-portfolios" title={t('fe.portfolios.helpTitle')}>{t('fe.portfolios.helpBody')}</HelpBanner>
      <ErrorBox message={error || loadError} />
      {!portfolios ? <Spinner /> : portfolios.length === 0 ? (
        <div className="card text-center py-12 px-4">
          <Briefcase className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-700 dark:text-gray-300">{t('fe.portfolios.empty')}</p>
          <button className="btn-primary mt-4 inline-flex items-center gap-2" onClick={() => setEditing('new')}><Plus className="w-4 h-4" />{t('fe.portfolios.add')}</button>
        </div>
      ) : portfolios.map((p) => (
        <div key={p.id} className="card !p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 dark:text-white break-words">{p.name}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {[p.legalEntity, p.baseCurrency, p.fxSource && `${t('fe.fields.fxSource')}: ${p.fxSource}`].filter(Boolean).join(' · ')}
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {p.assetClasses.map((c) => <span key={c} className="badge bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{t(`fe.assetClasses.${c}`)}</span>)}
                {p.inflationAdjust && <span className="badge bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{t('fe.portfolios.inflationOn')}</span>}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button className="btn-secondary !px-3 flex items-center gap-1.5 text-sm" onClick={() => setPeriodForm({ portfolio: p })}><CalendarPlus className="w-4 h-4" />{t('fe.portfolios.newPeriod')}</button>
              <button className="btn-secondary !px-3" onClick={() => setEditing(p)} aria-label={t('fe.portfolios.edit')}><Pencil className="w-4 h-4" /></button>
              {admin && <button className="btn-secondary !px-3 text-red-600" onClick={() => remove(() => feApi.deletePortfolio(p.id), t('fe.portfolios.confirmDelete', { name: p.name }))} aria-label={t('common.delete')}><Trash2 className="w-4 h-4" /></button>}
            </div>
          </div>
          {p.periods.length === 0 ? <p className="text-sm text-gray-500">{t('fe.portfolios.noPeriods')}</p> : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
              {p.periods.map((per) => (
                <div key={per.id} className="flex items-center justify-between gap-2 py-2 flex-wrap">
                  <button className="text-left min-w-0" onClick={() => select({ portfolioId: p.id, periodId: per.id })}>
                    <span className="font-medium text-gray-900 dark:text-white">{per.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{String(per.reportingDate).slice(0, 10)}</span>
                    {per.ledgerTotal != null && <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{t('fe.portfolios.ledger')}: {p.baseCurrency} {fmt(per.ledgerTotal)}</span>}
                  </button>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={per.status} />
                    {per.status === 'OPEN' && <button className="text-gray-400 hover:text-gray-600" onClick={() => setPeriodForm({ portfolio: p, initial: per })} aria-label={t('fe.portfolios.editPeriod')}><Pencil className="w-4 h-4" /></button>}
                    {admin && per.status === 'OPEN' && <button className="text-gray-400 hover:text-red-600" onClick={() => remove(() => feApi.deletePeriod(per.id), t('fe.portfolios.confirmDeletePeriod', { name: per.name }))} aria-label={t('common.delete')}><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {editing && <PortfolioForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async (saved) => { setEditing(null); await reload(); select({ portfolioId: saved.id, periodId: null }); }} />}
      {periodForm && <PeriodForm {...periodForm} onClose={() => setPeriodForm(null)} onSaved={async (saved) => { const pf = periodForm.portfolio; setPeriodForm(null); await reload(); select({ portfolioId: pf.id, periodId: saved.id }); }} />}
    </div>
  );
}
