import { useState, useEffect, useRef } from 'react';
import { useParams, Link, NavLink } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, Loader2, MapPin } from 'lucide-react';
import gkApi, { saveBlob } from '../../services/gkApi';
import { useT } from '../../i18n';
import { Loading, ErrorBox, errText, useLoad } from './ui';
import OverviewTab from './EstOverview';
import CriteriaTab from './EstCriteria';
import EvidenceTab from './EstEvidence';
import ResourcesTab from './EstResources';
import KpisTab from './EstKpis';
import PlanTab from './EstPlan';
import PeopleTab from './EstPeople';
import AuditTab from './EstAudit';
import ProfileTab from './EstProfile';

export const TABS = [
  ['overview', OverviewTab],
  ['criteria', CriteriaTab],
  ['evidence', EvidenceTab],
  ['data', ResourcesTab],
  ['kpis', KpisTab],
  ['plan', PlanTab],
  ['people', PeopleTab],
  ['audit', AuditTab],
  ['profile', ProfileTab],
];

export default function Establishment() {
  const { id, tab = 'overview' } = useParams();
  const { t } = useT();
  const { data: est, loading, error, reload } = useLoad(() => gkApi.establishment(id), [id]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const navRef = useRef(null);
  useEffect(() => {
    const el = navRef.current?.querySelector('[aria-current="page"]');
    if (el && navRef.current) navRef.current.scrollLeft = el.offsetLeft - navRef.current.clientWidth / 2 + el.clientWidth / 2;
  }, [tab, est]);

  if (loading && !est) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const Tab = (TABS.find(([k]) => k === tab) || TABS[0])[1];

  const exportPack = async () => {
    setBusy(true); setErr('');
    try {
      const blob = await gkApi.auditPack(id);
      saveBlob(blob, `GreenKeyReadiness_AuditPack_${est.name.replace(/[^A-Za-z0-9]+/g, '_')}.xlsx`);
    } catch (ex) { setErr(errText(ex)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <Link to="/gk" className="text-xs text-gray-500 dark:text-gray-400 hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" />{t('gk.portfolio.title')}</Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-1">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white break-words">{est.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-1">
              <span>{est.client.name}{est.brand ? ` · ${est.brand.name}` : ''}</span>
              <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{est.city ? `${est.city}, ` : ''}{est.country}</span>
              <span>· {t('gk.criteriaVersionShort', { v: est.criteriaVersion })}</span>
            </p>
          </div>
          <button className="btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={exportPack} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}{t('gk.auditPack')}
          </button>
        </div>
      </div>
      <ErrorBox message={err} />
      <nav ref={navRef} className="flex gap-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-gray-200 dark:border-gray-800" aria-label={t('gk.tabs.label')}>
        {TABS.map(([k]) => (
          <NavLink
            key={k}
            to={`/gk/establishments/${id}${k === 'overview' ? '' : `/${k}`}`}
            end
            aria-current={tab === k ? 'page' : undefined}
            className={() => `whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k
              ? 'border-brand-600 text-brand-700 dark:text-brand-300'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
          >
            {t(`gk.tabs.${k}`)}
          </NavLink>
        ))}
      </nav>
      <Tab est={est} reloadEst={reload} t={t} />
    </div>
  );
}
