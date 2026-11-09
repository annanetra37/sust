import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { useModules } from '../context/ModuleContext';
import { useT } from '../i18n';

// Triple i platform admins switch modules on/off per tenant (P-02).
export default function PlatformAdmin() {
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
                    <p className="font-medium text-gray-900 dark:text-white">{c.name}</p>
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
    </div>
  );
}
