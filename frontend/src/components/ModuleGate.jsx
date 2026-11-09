import { Link } from 'react-router-dom';
import { Lock, Loader2 } from 'lucide-react';
import { useModules } from '../context/ModuleContext';
import { useT } from '../i18n';

// Hides a module's pages when the tenant is not entitled to it (P-02).
// The API also answers 403, so this is the friendly face of that check.
export default function ModuleGate({ module, children }) {
  const { modules, loading } = useModules();
  const { t } = useT();
  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;
  if (modules.some((m) => m.key === module)) return children;
  return (
    <div className="max-w-lg mx-auto card text-center py-12 px-6">
      <Lock className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white mt-3">{t('launcher.notEnabledTitle', { module: t(`launcher.modules.${module}.name`) })}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('launcher.notEnabledBody')}</p>
      <Link to="/launcher" className="btn-secondary inline-block mt-5">{t('launcher.backToLauncher')}</Link>
    </div>
  );
}
