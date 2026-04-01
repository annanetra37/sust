import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Users, TrendingDown, Clock, Heart, Upload, Download } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { InfoTip } from '../components/HelpSystem';
import OrgYearFilter from '../components/OrgYearFilter';

const COLORS = ['#6366f1', '#ec4899', '#8b5cf6', '#64748b'];

export default function S1Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ year: new Date().getFullYear(), orgUnits: '' });
  const filterKey = `${filters.year}|${filters.orgUnits}`;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.getDataYears().then((years) => {
      if (years.length > 0 && !years.includes(filters.year)) {
        setFilters((f) => ({ ...f, year: years[0] }));
      }
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    api.getS1Dashboard(filters).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [filterKey, ready]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>;
  if (!data) return <div className="text-center text-gray-500 py-12">No data available. Upload workforce data to get started.</div>;

  const { stats, charts } = data;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">S1 — Own Workforce</h1>
          <p className="text-gray-500">Workforce composition, diversity, training, and turnover analytics</p>
        </div>
        <Link to="/platform/S/social-1" className="btn-primary flex items-center gap-2">
          <Upload className="w-4 h-4" /> Connect Data
        </Link>
        <button onClick={() => api.exportS1Dashboard(filters)} className="btn-secondary flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" /> Export Excel
        </button>
      </div>

      <OrgYearFilter filters={filters} onChange={setFilters} />

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <Users className="w-5 h-5 text-indigo-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">Total Employees</span>
            <InfoTip>Total headcount for the selected year and org units.</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.totalEmployees.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <span className="text-lg">{'♀'}</span>
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">Female %</span>
            <InfoTip>Percentage of female employees. Key ESRS S1 gender diversity metric.</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.femalePct}%</span>
        </div>
        <div className="stat-card">
          <Clock className="w-5 h-5 text-purple-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">Avg Training Hours</span>
            <InfoTip>Average training hours per trained employee.</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.avgTrainingHours} <span className="text-sm font-normal text-gray-400">hrs/emp</span></span>
        </div>
        <div className="stat-card">
          <TrendingDown className="w-5 h-5 text-red-500" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">Turnover Rate</span>
            <InfoTip>Percentage of employees who left the company (voluntary + involuntary) divided by total employees.</InfoTip>
          </div>
          <span className="text-2xl font-bold">{stats.turnoverRate}%</span>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide">Permanent</span>
          <span className="text-lg font-bold">{stats.permanentCount?.toLocaleString() || 0}</span>
          <span className="text-[10px] text-gray-400">{stats.permanentPct || 0}% of total</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-orange-500 uppercase tracking-wide">Temporary</span>
          <span className="text-lg font-bold">{stats.temporaryCount?.toLocaleString() || 0}</span>
          <span className="text-[10px] text-gray-400">{100 - (stats.permanentPct || 0)}% of total</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-green-500 uppercase tracking-wide">Voluntary</span>
          <span className="text-lg font-bold">{stats.voluntaryTurnover || 0}</span>
          <span className="text-[10px] text-gray-400">{stats.voluntaryRate || 0}% rate</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">Involuntary</span>
          <span className="text-lg font-bold">{stats.involuntaryTurnover || 0}</span>
          <span className="text-[10px] text-gray-400">{stats.involuntaryRate || 0}% rate</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-pink-500 uppercase tracking-wide">Disability</span>
          <span className="text-lg font-bold">{stats.disabilityCount || 0}</span>
          <span className="text-[10px] text-gray-400">{stats.disabilityRate || 0}% rate</span>
        </div>
        <div className="stat-card py-3 px-4">
          <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">LTIR</span>
          <span className="text-lg font-bold">{stats.ltir || 0}</span>
          <span className="text-[10px] text-gray-400">per 200K hours</span>
        </div>
      </div>

      {/* Injury summary */}
      {(stats.totalInjuries > 0 || stats.fatalInjuries > 0) && (
        <div className={`card py-4 ${stats.fatalInjuries > 0 ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/30' : ''}`}>
          <div className="flex items-center gap-6">
            <div>
              <span className="text-xs text-gray-500">Total Incidents</span>
              <p className="text-xl font-bold">{stats.totalInjuries}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">Fatalities</span>
              <p className={`text-xl font-bold ${stats.fatalInjuries > 0 ? 'text-red-600' : 'text-green-600'}`}>{stats.fatalInjuries}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">Lost-time Injuries</span>
              <p className="text-xl font-bold">{stats.lostTimeInjuries || 0}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">Training Hours</span>
              <p className="text-xl font-bold">{stats.totalTrainingHours?.toLocaleString() || 0}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">Trained Employees</span>
              <p className="text-xl font-bold">{stats.trainedEmployees?.toLocaleString() || 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employees by Gender */}
        <div className="card">
          <h3 className="font-semibold mb-4">Employees by Gender</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts.employeesByGender}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="gender" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gender Distribution Pie */}
        <div className="card">
          <h3 className="font-semibold mb-4">Gender Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={charts.employeesByGender} dataKey="count" nameKey="gender" cx="50%" cy="50%" outerRadius={100} label>
                {charts.employeesByGender.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Training by Gender */}
        <div className="card">
          <h3 className="font-semibold mb-4">Training Hours by Gender</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts.trainingByGender}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="gender" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="hours" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Diversity by Gender */}
        <div className="card">
          <h3 className="font-semibold mb-4">Disability by Gender</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts.diversityByGender}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="gender" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="withDisability" name="With Disability" fill="#ec4899" radius={[4, 4, 0, 0]} />
              <Bar dataKey="without" name="Without" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Contract Type Breakdown */}
        {charts.byContractType?.length > 0 && (
          <div className="card">
            <h3 className="font-semibold mb-4">Employees by Contract Type</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={charts.byContractType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={100}
                  label={({ type, count }) => `${type}: ${count}`}>
                  {charts.byContractType.map((_, i) => (
                    <Cell key={i} fill={['#6366f1', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'][i % 5]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Turnover by Gender */}
        {charts.turnoverByGender?.length > 0 && (
          <div className="card">
            <h3 className="font-semibold mb-4">Turnover by Gender</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={charts.turnoverByGender}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="gender" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="voluntary" name="Voluntary" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="involuntary" name="Involuntary" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
