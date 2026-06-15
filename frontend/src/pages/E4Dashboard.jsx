import { useState, useEffect } from 'react';
import api from '../services/api';
import { TreePine, MapPin, Ruler, CheckCircle2, Plus, AlertTriangle } from 'lucide-react';
import { InfoTip } from '../components/HelpSystem';
import { useT } from '../i18n';
import useFeature from '../hooks/useFeature';
import FeatureLock from '../components/FeatureLock';
import clsx from 'clsx';

const LEAP_PHASES = ['locate', 'evaluate', 'assess', 'prepare'];

const STATUS_BADGE = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  complete: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  verified: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
};

const DRIVER_KEYS = ['landUseChange', 'resourceExploitation', 'climateChange', 'pollution', 'invasiveSpecies'];

export default function E4Dashboard() {
  const { t } = useT();
  const feature = useFeature('biodiversity');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [years] = useState(() => {
    const cur = new Date().getFullYear();
    return [cur, cur - 1, cur - 2, cur - 3];
  });

  useEffect(() => {
    if (!feature.allowed) return;
    setLoading(true);
    api.getBiodiversityDashboard(year)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [year, feature.allowed]);

  if (!feature.allowed) {
    return (
      <div className="max-w-4xl mx-auto">
        <FeatureLock feature="biodiversity" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const assessments = data?.assessments || [];
  const sites = data?.sites || [];
  const leapProgress = data?.leapProgress || [];
  const drivers = data?.drivers || {};
  const hasData = data && (assessments.length > 0 || sites.length > 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('biodiversity.title')}</h1>
          <p className="text-gray-500">{t('biodiversity.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input py-2 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {!hasData ? (
        /* Empty state */
        <div className="card text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mx-auto mb-4">
            <TreePine className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{t('biodiversity.title')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto mb-6">
            {t('biodiversity.noAssessments')}
          </p>
          <div className="card max-w-xl mx-auto text-left bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('biodiversity.tnfdLeap')}</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              The TNFD-LEAP framework guides organizations through four phases to assess nature-related dependencies and impacts:
            </p>
            <div className="flex items-center gap-2 mb-4">
              {LEAP_PHASES.map((phase, idx) => (
                <div key={phase} className="flex items-center gap-1">
                  <span className="w-8 h-8 rounded-lg bg-emerald-200 dark:bg-emerald-800 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    {phase[0].toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">{t(`biodiversity.${phase}`)}</span>
                  {idx < LEAP_PHASES.length - 1 && <span className="text-gray-300 dark:text-gray-600 mx-1">&rarr;</span>}
                </div>
              ))}
            </div>
            <button className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> {t('biodiversity.startAssessment')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Hero KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('biodiversity.sitesAssessed')}</span>
                <InfoTip>{t('biodiversity.sitesAssessed')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">{stats.sitesAssessed || 0}</span>
            </div>
            <div className="stat-card">
              <MapPin className="w-5 h-5 text-red-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('biodiversity.protectedAreas')}</span>
                <InfoTip>{t('biodiversity.protectedAreas')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">{stats.protectedAreaSites || 0}</span>
            </div>
            <div className="stat-card">
              <Ruler className="w-5 h-5 text-amber-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('biodiversity.totalLandArea')}</span>
                <InfoTip>{t('biodiversity.totalLandArea')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {(stats.totalLandArea || 0).toLocaleString()} <span className="text-sm font-normal text-gray-400">{t('biodiversity.hectares')}</span>
              </span>
            </div>
            <div className="stat-card">
              <CheckCircle2 className="w-5 h-5 text-blue-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('biodiversity.assessmentCompletion')}</span>
                <InfoTip>{t('biodiversity.assessmentCompletion')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {stats.completionPct != null ? `${stats.completionPct.toFixed(0)}%` : '0%'}
              </span>
            </div>
          </div>

          {/* TNFD-LEAP Progress */}
          {leapProgress.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4">{t('biodiversity.tnfdLeap')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      {LEAP_PHASES.map((phase) => (
                        <th key={phase} className="text-center py-2 px-3 text-gray-500 font-medium">
                          {t(`biodiversity.${phase}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leapProgress.map((site, idx) => (
                      <tr key={site.siteId || idx} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{site.siteName}</td>
                        {LEAP_PHASES.map((phase) => {
                          const status = site[phase]; // 'done', 'in-progress', 'not-started'
                          return (
                            <td key={phase} className="py-2 px-3 text-center">
                              {status === 'done' ? (
                                <span className="inline-flex w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900 items-center justify-center">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                </span>
                              ) : status === 'in-progress' ? (
                                <span className="inline-flex w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900 items-center justify-center">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                </span>
                              ) : (
                                <span className="inline-flex w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center">
                                  <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sensitive Sites */}
          {sites.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-500" />
                {t('biodiversity.sensitiveSites')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('biodiversity.protectedAreas')}</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">{t('biodiversity.totalLandArea')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((site, idx) => (
                      <tr key={site.id || idx} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{site.name}</td>
                        <td className="py-2 px-3">
                          {site.nearProtectedArea ? (
                            <span className="badge bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1 inline" />
                              {site.protectedAreaName || t('biodiversity.protectedAreas')}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-gray-600 dark:text-gray-400">
                          {(site.landArea || 0).toLocaleString()} {t('biodiversity.hectares')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Assessments */}
          {assessments.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4">{t('biodiversity.assessments')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.status')}</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assessments.map((a, idx) => (
                      <tr key={a.id || idx} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{a.siteName || a.name}</td>
                        <td className="py-2 px-3">
                          <span className={clsx('badge text-xs', STATUS_BADGE[a.status] || STATUS_BADGE.draft)}>
                            {t(`biodiversity.${a.status}`) || a.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-500">
                          {a.updatedAt ? new Date(a.updatedAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Direct Drivers Heatmap */}
          {Object.keys(drivers).length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4">{t('biodiversity.directDrivers')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      {DRIVER_KEYS.map((dk) => (
                        <th key={dk} className="text-center py-2 px-3 text-gray-500 font-medium text-xs">
                          {t(`biodiversity.${dk}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(drivers).map(([siteName, driverFlags]) => (
                      <tr key={siteName} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{siteName}</td>
                        {DRIVER_KEYS.map((dk) => (
                          <td key={dk} className="py-2 px-3 text-center">
                            {driverFlags[dk] ? (
                              <span className="inline-block w-4 h-4 rounded bg-red-400 dark:bg-red-600" title={t(`biodiversity.${dk}`)} />
                            ) : (
                              <span className="inline-block w-4 h-4 rounded bg-gray-100 dark:bg-gray-800" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
