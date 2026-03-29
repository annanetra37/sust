import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Factory, TrendingUp, Users, Target, Upload } from 'lucide-react';
import { InfoTip } from '../components/HelpSystem';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import OrgYearFilter from '../components/OrgYearFilter';

const SCOPE_COLORS = { 'Scope 1': '#ef4444', 'Scope 2': '#f59e0b', 'Scope 3': '#3b82f6' };
const TREE_COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

export default function E1Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ year: new Date().getFullYear(), orgUnits: '' });

  useEffect(() => {
    setLoading(true);
    api.getE1Dashboard(filters).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [filters]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>;
  if (!data) return <div className="text-center text-gray-500 py-12">No data available. Upload emissions data to get started.</div>;

  const { stats, charts } = data;
  const sbti = stats.sbtiProgress;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">E1 — Climate Change</h1>
          <p className="text-gray-500">GHG emissions, carbon footprint analysis, and SBTi targets</p>
        </div>
        <Link to="/platform/E/environmental-1" className="btn-primary flex items-center gap-2">
          <Upload className="w-4 h-4" /> Upload Data
        </Link>
      </div>

      <OrgYearFilter filters={filters} onChange={setFilters} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <Factory className="w-5 h-5 text-emerald-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">Total GHG Emissions</span>
            <InfoTip title="GHG Emissions">Total greenhouse gas emissions in tonnes of CO2 equivalent (tCO2e) across all scopes (1, 2, 3) for the selected year.</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.totalEmissions < 0.1 ? stats.totalEmissions.toFixed(4) : stats.totalEmissions.toFixed(2)} <span className="text-sm font-normal text-gray-400">tCO2e</span></span>
        </div>
        <div className="stat-card">
          <TrendingUp className="w-5 h-5 text-amber-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">GHG Intensity</span>
            <InfoTip title="Emissions Intensity">Emissions per employee (tCO2e / headcount). Lower is better. Used to benchmark against industry peers and track decoupling of growth from emissions.</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.intensity} <span className="text-sm font-normal text-gray-400">tCO2e/emp</span></span>
        </div>
        <div className="stat-card">
          <Users className="w-5 h-5 text-blue-500" />
          <span className="text-sm text-gray-500">Employees</span>
          <span className="text-2xl font-bold">{stats.totalEmployees.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <Target className="w-5 h-5 text-purple-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">SBTi Progress</span>
            <InfoTip title="Science Based Targets">Progress toward your SBTi decarbonization target. Set targets in the SBTi section below. "On Track" means you're meeting the required reduction pace.</InfoTip>
          </div>
          {sbti ? (
            <div>
              <span className="text-2xl font-bold">{sbti.progress}%</span>
              <span className={`ml-2 badge ${sbti.onTrack ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {sbti.onTrack ? 'On Track' : 'Off Track'}
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-400">No target set</span>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Emissions by Scope - Doughnut */}
        <div className="card">
          <h3 className="font-semibold mb-4">Emissions by Scope</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={charts.byScope} dataKey="value" nameKey="scope" cx="50%" cy="50%" innerRadius={60} outerRadius={100} label>
                {charts.byScope.map((entry) => (
                  <Cell key={entry.scope} fill={SCOPE_COLORS[entry.scope] || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `${v.toFixed(1)} tCO2e`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Emissions by Activity - Treemap */}
        <div className="card">
          <h3 className="font-semibold mb-4">Emissions by Activity</h3>
          <ResponsiveContainer width="100%" height={280}>
            <Treemap
              data={charts.byActivity.map((a, i) => ({ name: a.activity, size: a.value, fill: TREE_COLORS[i % TREE_COLORS.length] }))}
              dataKey="size"
              aspectRatio={4 / 3}
              stroke="#fff"
              content={({ x, y, width, height, name, fill }) => (
                width > 40 && height > 30 ? (
                  <g>
                    <rect x={x} y={y} width={width} height={height} fill={fill} rx={4} />
                    <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="#fff" fontSize={11}>{name}</text>
                  </g>
                ) : <rect x={x} y={y} width={width} height={height} fill={fill} rx={4} />
              )}
            />
          </ResponsiveContainer>
        </div>

        {/* Emissions Trend */}
        <div className="card">
          <h3 className="font-semibold mb-4">Emissions Trend (Year-over-Year)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={charts.emissionsTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis />
              <Tooltip formatter={(v) => `${v.toFixed(1)} tCO2e`} />
              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* SBTi Gauge */}
        {sbti && (
          <div className="card">
            <h3 className="font-semibold mb-4">SBTi Target Progress</h3>
            <div className="flex flex-col items-center justify-center h-[250px]">
              <div className="relative w-48 h-48">
                <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                  <circle cx="100" cy="100" r="80" fill="none" stroke="#e5e7eb" strokeWidth="16" />
                  <circle cx="100" cy="100" r="80" fill="none" stroke={sbti.onTrack ? '#10b981' : '#ef4444'} strokeWidth="16"
                    strokeDasharray={`${sbti.progress * 5.03} 503`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold">{sbti.progress}%</span>
                  <span className="text-xs text-gray-500">of target</span>
                </div>
              </div>
              <div className="mt-4 text-center text-sm text-gray-500">
                <p>{sbti.method} reduction: {sbti.reductionPct}% by {sbti.targetYear}</p>
                <p>Base year: {sbti.baseYear} | Current: {sbti.currentEmissions.toFixed(1)} tCO2e</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
