import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Leaf, Landmark, Hotel, ArrowRight, Loader2, Settings2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useModules, rememberModule, lastModule } from '../context/ModuleContext';
import { LogoFull } from '../components/Logo';
import { useT } from '../i18n';

const ICONS = { general: Leaf, financed_emissions: Landmark, green_key: Hotel };
const ACCENTS = {
  general: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  financed_emissions: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  green_key: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
};

function fmtDate(d, lang) {
  try { return new Date(d).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return String(d).slice(0, 10); }
}

// Live status line per card (P-01).
export function statusLine(card, t, lang) {
  const s = card.status;
  if (!s) return t('launcher.statusUnavailable');
  if (card.key === 'general') return t('launcher.status.general', { units: s.units, activities: s.activities });
  if (card.key === 'financed_emissions') {
    if (!s.period) return t('launcher.status.feEmpty');
    return s.coveragePct == null
      ? t('launcher.status.feNotCalculated', { period: s.period, exposures: s.exposures })
      : t('launcher.status.fe', { period: s.period, pct: Math.round(s.coveragePct) });
  }
  if (card.key === 'green_key') {
    if (!s.establishments) return t('launcher.status.gkEmpty');
    return s.nextExpiry
      ? t('launcher.status.gk', { n: s.establishments, date: fmtDate(s.nextExpiry, lang) })
      : t('launcher.status.gkNoCert', { n: s.establishments });
  }
  return '';
}

export default function Launcher() {
  const { user } = useAuth();
  const { modules, loading, isPlatformAdmin } = useModules();
  const { t, lang } = useT();
  const navigate = useNavigate();
  const last = lastModule();

  // Single-module users skip the launcher.
  useEffect(() => {
    if (!loading && modules.length === 1 && !isPlatformAdmin) {
      rememberModule(modules[0].key);
      navigate(modules[0].home, { replace: true });
    }
  }, [loading, modules, isPlatformAdmin, navigate]);

  const enter = (card) => { rememberModule(card.key); navigate(card.home); };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-8">
          <LogoFull />
          {isPlatformAdmin && (
            <Link to="/platform-admin" className="btn-secondary text-sm flex items-center gap-1.5"><Settings2 className="w-4 h-4" />{t('launcher.platformAdmin')}</Link>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('launcher.welcome', { name: user?.firstName || '' })}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('launcher.subtitle')}</p>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            {modules.map((card) => {
              const Icon = ICONS[card.key] || Leaf;
              const isLast = card.key === last;
              return (
                <button
                  key={card.key}
                  onClick={() => enter(card)}
                  className={`card text-left hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 transition-all flex flex-col ${isLast ? 'ring-2 ring-brand-500' : ''}`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${ACCENTS[card.key]}`}><Icon className="w-6 h-6" /></div>
                  <p className="mt-4 font-semibold text-gray-900 dark:text-white">{t(`launcher.modules.${card.key}.name`)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex-1">{t(`launcher.modules.${card.key}.description`)}</p>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-4 min-h-[2rem]">{statusLine(card, t, lang)}</p>
                  <span className="mt-3 text-sm font-semibold text-brand-600 dark:text-brand-400 inline-flex items-center gap-1">
                    {isLast ? t('launcher.continue') : t('launcher.open')}<ArrowRight className="w-4 h-4" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
