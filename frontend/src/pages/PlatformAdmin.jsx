import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowLeft, Check, AlertCircle, Landmark, Hotel, Database } from 'lucide-react';
import api from '../services/api';
import { useModules } from '../context/ModuleContext';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

// One click: synthetic bank and hotel data into the admin's own organisation,
// so the same login sees all three modules with data.
function MineDemo({ t, onDone }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError(''); setDone(false);
    try { await api.loadModuleDemo('all', { target: 'mine' }); setDone(true); onDone(); } catch (err) { setError(err.error || t('platformAdmin.saveFailed')); } finally { setBusy(false); }
  };
  return (
    <div className="card space-y-3 border-brand-300 dark:border-brand-800">
      <p className="font-semibold text-gray-900 dark:text-white">{t('platformAdmin.mineTitle')}</p>
      <p className="text-sm text-gray-600 dark:text-gray-300">{t('platformAdmin.mineBody')}</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>}
      {done && (
        <p className="text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 flex-wrap"><Check className="w-4 h-4 shrink-0" />{t('platformAdmin.mineDone')}
          <Link to="/fe" className="underline">{t('launcher.modules.financed_emissions.name')}</Link> · <Link to="/gk" className="underline">{t('launcher.modules.green_key.name')}</Link>
        </p>
      )}
      <button className="btn-primary flex items-center gap-2" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
        {busy ? t('platformAdmin.demoLoading') : t('platformAdmin.mineButton')}
      </button>
    </div>
  );
}

// One demo card: creates/refreshes a synthetic demo organisation via the API.
function DemoCard({ kind, icon: Icon, title, body, defaultEmail, t }) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');

  const run = async () => {
    setError(''); setDone(null);
    if (password.length < 8) { setError(t('platformAdmin.demoPassword')); return; }
    setBusy(true);
    try {
      const res = await api.loadModuleDemo(kind, { email, password });
      setDone(res);
      setPassword('');
    } catch (err) { setError(err.error || t('platformAdmin.saveFailed')); } finally { setBusy(false); }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-gray-600 dark:text-gray-300" /></div>
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">{title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{body}</p>
        </div>
      </div>
      <label className="block text-xs text-gray-600 dark:text-gray-400">{t('platformAdmin.demoEmail')}
        <input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block text-xs text-gray-600 dark:text-gray-400">{t('platformAdmin.demoPassword')}
        <input className="input mt-1" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>}
      {done && <p className="text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5"><Check className="w-4 h-4 shrink-0" />{t('platformAdmin.demoDone', { email: done.email })}</p>}
      <button className="btn-primary flex items-center gap-2" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
        {busy ? t('platformAdmin.demoLoading') : t('platformAdmin.demoLoad')}
      </button>
    </div>
  );
}

// Triple i platform admins switch modules on/off per tenant (P-02).
export default function PlatformAdmin() {
  const { user } = useAuth();
  const { t } = useT();
  const { isPlatformAdmin, loading: modLoading, refresh } = useModules();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!isPlatformAdmin) return;
    api.getModuleAdminCompanies().then(setData).catch((err) => setError(err.error || t('platformAdmin.loadFailed')));
  }, [isPlatformAdmin, t]);

  if (modLoading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;
  if (!isPlatformAdmin) return <div className="max-w-lg mx-auto card text-center py-10">{t('platformAdmin.notAllowed')}</div>;

  const rowFor = (c, key) => c.modules.find((m) => m.module === key);
  const isOn = (c, key) => {
    const r = rowFor(c, key);
    if (key === 'general') return !r || r.enabled;
    return !!r && r.enabled;
  };

  const save = async (company, key, patch) => {
    setError('');
    const current = rowFor(company, key);
    const next = { enabled: isOn(company, key), trialEndsAt: current?.trialEndsAt || null, ...patch };
    try {
      await api.updateCompanyModules(company.id, { [key]: next });
      const fresh = await api.getModuleAdminCompanies();
      setData(fresh);
      setSavedId(`${company.id}-${key}`);
      refresh();
    } catch (err) { setError(err.error || t('platformAdmin.saveFailed')); }
  };

  const companies = (data?.companies || []).filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Link to="/launcher" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" />{t('launcher.backToLauncher')}</Link>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('platformAdmin.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('platformAdmin.subtitle')}</p>
      </div>
      {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{error}</p>}
      <input className="input max-w-xs" placeholder={t('platformAdmin.search')} value={filter} onChange={(e) => setFilter(e.target.value)} />
      {!data ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                <th className="py-2 px-3 font-medium">{t('platformAdmin.company')}</th>
                {data.moduleKeys.map((k) => <th key={k} className="py-2 px-3 font-medium">{t(`launcher.modules.${k}.name`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 dark:border-gray-800 align-top">
                  <td className="py-2 px-3">
                    <p className="font-medium text-gray-900 dark:text-white">{c.name}{c.id === user?.company?.id && <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 ml-2 text-[10px]">{t('platformAdmin.yourOrg')}</span>}</p>
                    {c.id === user?.company?.id && <p className="text-[11px] text-gray-500 mt-0.5">{t('platformAdmin.youHaveAll')}</p>}
                    <p className="text-xs text-gray-500">{c.country} · {c.tier}</p>
                  </td>
                  {data.moduleKeys.map((k) => {
                    const row = rowFor(c, k);
                    return (
                      <td key={k} className="py-2 px-3">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" className="w-4 h-4" checked={isOn(c, k)} onChange={(e) => save(c, k, { enabled: e.target.checked })} />
                          <span className="text-xs text-gray-600 dark:text-gray-300">{isOn(c, k) ? t('platformAdmin.on') : t('platformAdmin.off')}</span>
                          {savedId === `${c.id}-${k}` && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                        </label>
                        {k !== 'general' && isOn(c, k) && (
                          <label className="block mt-1 text-[11px] text-gray-500">
                            {t('platformAdmin.trialEnds')}
                            <input
                              type="date"
                              className="input !py-1 !text-xs mt-0.5"
                              value={row?.trialEndsAt ? String(row.trialEndsAt).slice(0, 10) : ''}
                              onChange={(e) => save(c, k, { trialEndsAt: e.target.value || null })}
                            />
                          </label>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pt-4 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('platformAdmin.demoTitle')}</h2>
        <MineDemo t={t} onDone={refresh} />
        <details className="card">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200">{t('platformAdmin.demoAdvanced')}</summary>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('platformAdmin.demoIntro')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <DemoCard kind="bank" icon={Landmark} title={t('platformAdmin.demoBank')} body={t('platformAdmin.demoBankBody')} defaultEmail="bank-demo@triplei.local" t={t} />
            <DemoCard kind="hotels" icon={Hotel} title={t('platformAdmin.demoHotels')} body={t('platformAdmin.demoHotelsBody')} defaultEmail="hotel-demo@triplei.local" t={t} />
          </div>
        </details>
      </div>
    </div>
  );
}
