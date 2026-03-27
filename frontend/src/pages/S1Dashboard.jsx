import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Users, TrendingDown, Clock, Heart, Upload } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import OrgYearFilter from '../components/OrgYearFilter';

const COLORS = ['#6366f1', '#ec4899', '#8b5cf6', '#64748b'];

export default function S1Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ year: new Date().getFullYear(), orgUnits: '' });

  useEffect(() => {
    setLoading(true);
    api.getS1Dashboard(filters).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [filters]);

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
          <Upload className="w-4 h-4" /> Upload Data
        </Link>
      </div>

      <OrgYearFilter filters={filters} onChange={setFilters} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <Users className="w-5 h-5 text-indigo-500" />
          <span className="text-sm text-gray-500">Total Employees</span>
          <span className="text-2xl font-bold">{stats.totalEmployees.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <Heart className="w-5 h-5 text-pink-500" />
          <span className="text-sm text-gray-500">Disability Count</span>
          <span className="text-2xl font-bold">{stats.disabilityCount}</span>
        </div>
        <div className="stat-card">
          <Clock className="w-5 h-5 text-purple-500" />
          <span className="text-sm text-gray-500">Training Hours</span>
          <span className="text-2xl font-bold">{stats.totalTrainingHours.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <TrendingDown className="w-5 h-5 text-red-500" />
          <span className="text-sm text-gray-500">Turnover Rate</span>
          <span className="text-2xl font-bold">{stats.turnoverRate}%</span>
        </div>
      </div>

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
      </div>
    </div>
  );
}
