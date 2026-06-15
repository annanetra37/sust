import { useState, useEffect } from 'react';
import api from '../services/api';
import { Droplets, Upload, TrendingDown, Percent, Users, AlertTriangle } from 'lucide-react';
import { InfoTip } from '../components/HelpSystem';
import CopyableChart from '../components/CopyableChart';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { useT } from '../i18n';
import useFeature from '../hooks/useFeature';
import FeatureLock from '../components/FeatureLock';
import clsx from 'clsx';

const SOURCE_COLORS = {
  surface: '#3b82f6',
  ground: '#8b5cf6',
  thirdParty: '#f59e0b',
  seawater: '#06b6d4',
  produced: '#64748b',
  rainwater: '#10b981',
};

const STRESS_BADGE = {
  Low: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  Medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  High: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  'Extremely High': 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

export default function E3Dashboard() {
  const { t } = useT();
  const feature = useFeature('water_resources');
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
    api.getWaterDashboard(year)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [year, feature.allowed]);

  if (!feature.allowed) {
    return (
      <div className="max-w-4xl mx-auto">
        <FeatureLock feature="water_resources" />
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
  const charts = data?.charts || {};
  const sites = data?.sites || [];
  const hasData = data && (stats.totalWithdrawal > 0 || sites.length > 0);

  // Build source bar data
  const sourceData = [
    { source: t('water.surfaceWater'), value: stats.surfaceWater || 0 },
    { source: t('water.groundWater'), value: stats.groundWater || 0 },
    { source: t('water.thirdParty'), value: stats.thirdParty || 0 },
    { source: t('water.seawater'), value: stats.seawater || 0 },
    { source: t('water.produced'), value: stats.produced || 0 },
    { source: t('water.rainwater'), value: stats.rainwater || 0 },
  ];

  // Build flow comparison data
  const flowData = charts.flowComparison || [
    { name: t('water.totalWithdrawal'), value: stats.totalWithdrawal || 0 },
    { name: t('water.flowComparison').split(' vs ')[1] || 'Discharge', value: stats.totalDischarge || 0 },
    { name: t('water.totalConsumption'), value: stats.totalConsumption || 0 },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('water.title')}</h1>
          <p className="text-gray-500">{t('water.subtitle')}</p>
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
          <button
            onClick={() => {/* open upload modal or navigate */}}
            className="btn-primary flex items-center gap-2"
          >
            <Upload className="w-4 h-4" /> {t('water.connectData')}
          </button>
        </div>
      </div>

      {!hasData ? (
        /* Empty state */
        <div className="card text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center mx-auto mb-4">
            <Droplets className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{t('water.title')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">{t('water.noData')}</p>
        </div>
      ) : (
        <>
          {/* Hero KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card">
              <Droplets className="w-5 h-5 text-blue-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('water.totalWithdrawal')}</span>
                <InfoTip>{t('water.totalWithdrawal')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {(stats.totalWithdrawal || 0).toLocaleString()} <span className="text-sm font-normal text-gray-400">{t('water.m3')}</span>
              </span>
            </div>
            <div className="stat-card">
              <TrendingDown className="w-5 h-5 text-cyan-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('water.totalConsumption')}</span>
                <InfoTip>{t('water.totalConsumption')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {(stats.totalConsumption || 0).toLocaleString()} <span className="text-sm font-normal text-gray-400">{t('water.m3')}</span>
              </span>
            </div>
            <div className="stat-card">
              <Percent className="w-5 h-5 text-green-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('water.recycledReused')}</span>
                <InfoTip>{t('water.recycledReused')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {stats.recycledPct != null ? `${stats.recycledPct.toFixed(1)}%` : '0%'}
              </span>
            </div>
            <div className="stat-card">
              <Users className="w-5 h-5 text-purple-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('water.waterIntensity')}</span>
                <InfoTip>{t('water.waterIntensity')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {(stats.waterIntensity || 0).toFixed(2)} <span className="text-sm font-normal text-gray-400">{t('water.perEmployee')}</span>
              </span>
            </div>
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="stat-card py-3 px-4">
              <span className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">{t('water.surfaceWater')}</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {(stats.surfaceWater || 0).toLocaleString()} <span className="text-[10px] font-normal text-gray-400">{t('water.m3')}</span>
              </span>
            </div>
            <div className="stat-card py-3 px-4">
              <span className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide">{t('water.groundWater')}</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {(stats.groundWater || 0).toLocaleString()} <span className="text-[10px] font-normal text-gray-400">{t('water.m3')}</span>
              </span>
            </div>
            <div className="stat-card py-3 px-4">
              <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">{t('water.thirdParty')}</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {(stats.thirdParty || 0).toLocaleString()} <span className="text-[10px] font-normal text-gray-400">{t('water.m3')}</span>
              </span>
            </div>
            <div className="stat-card py-3 px-4">
              <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">{t('water.stressedSites')}</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {stats.stressedSitesPct != null ? `${stats.stressedSitesPct.toFixed(1)}%` : '0%'}
              </span>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Withdrawal by Source */}
            <CopyableChart title={t('water.withdrawalBySource')}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={sourceData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="source" type="category" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(v) => `${v.toLocaleString()} ${t('water.m3')}`} />
                  <Bar dataKey="value" name={t('water.m3')} fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CopyableChart>

            {/* Withdrawal vs Discharge vs Consumption */}
            <CopyableChart title={t('water.flowComparison')}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={flowData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(v) => `${v.toLocaleString()} ${t('water.m3')}`} />
                  <Bar dataKey="value" name={t('water.m3')} fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CopyableChart>
          </div>

          {/* Water-Stressed Sites */}
          {sites.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                {t('water.siteRisk')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('water.waterStress')}</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">{t('water.totalWithdrawal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((site, idx) => (
                      <tr key={site.id || idx} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{site.name}</td>
                        <td className="py-2 px-3">
                          <span className={clsx('badge text-xs', STRESS_BADGE[site.stressLevel] || 'bg-gray-100 text-gray-500')}>
                            {site.stressLevel || '—'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-gray-600 dark:text-gray-400">
                          {(site.withdrawal || 0).toLocaleString()} {t('water.m3')}
                        </td>
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
