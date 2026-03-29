import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { InfoTip } from '../components/HelpSystem';

const STANDARDS = ['ESRS', 'TCFD', 'GRI', 'SASB', 'CDP', 'IFRS_S1', 'IFRS_S2'];

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [tab, setTab] = useState('org-units');
  const [orgUnits, setOrgUnits] = useState([]);
  const [standard, setStandard] = useState('ESRS');
  const [credits, setCredits] = useState({ transactions: [], balance: 0 });
  const [newUnit, setNewUnit] = useState({ name: '', country: '' });
  const [resetForm, setResetForm] = useState({ year: new Date().getFullYear(), quarter: '', orgUnitId: '', type: 's1' });
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    api.getOrgUnits().then(setOrgUnits);
    api.getEsgStandard().then((d) => setStandard(d.standard));
    api.getCredits(dateRange).then(setCredits);
  }, []);

  const addUnit = async (e) => {
    e.preventDefault();
    await api.createOrgUnit(newUnit);
    setNewUnit({ name: '', country: '' });
    api.getOrgUnits().then(setOrgUnits);
  };

  const deleteUnit = async (id) => {
    if (!confirm('Delete this org unit? Related data will also be removed.')) return;
    await api.deleteOrgUnit(id);
    api.getOrgUnits().then(setOrgUnits);
  };

  const handleReset = async () => {
    try {
      if (resetForm.type === 's1') {
        await api.resetS1({ year: parseInt(resetForm.year), quarter: resetForm.quarter || undefined, orgUnitId: resetForm.orgUnitId || undefined });
      } else {
        await api.resetE1({ year: parseInt(resetForm.year) });
      }
      setShowResetConfirm(false);
      alert('Data reset successfully');
    } catch (err) {
      alert(err.error || 'Reset failed');
    }
  };

  const loadCredits = () => api.getCredits(dateRange).then(setCredits);

  const tabs = [
    { key: 'org-units', label: 'Organizational Units', tip: 'Business units, offices, or subsidiaries that data is tracked under' },
    { key: 'standards', label: 'ESG Standards', tip: 'The reporting framework used for compliance reports' },
    { key: 'reset', label: 'Data Reset', tip: 'Permanently delete uploaded data by year' },
    { key: 'credits', label: 'Credit Transactions', tip: 'View credit usage history and remaining balance' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((t) => (
          <button key={t.key} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${tab === t.key ? 'bg-white shadow-sm' : 'text-gray-500'}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.tip && <InfoTip>{t.tip}</InfoTip>}
          </button>
        ))}
      </div>

      {tab === 'org-units' && (
        <div className="card space-y-4">
          {isAdmin && (
            <form onSubmit={addUnit} className="flex gap-3">
              <input className="input flex-1" placeholder="Unit name" required value={newUnit.name} onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })} />
              <input className="input w-40" placeholder="Country" required value={newUnit.country} onChange={(e) => setNewUnit({ ...newUnit, country: e.target.value })} />
              <button type="submit" className="btn-primary flex items-center gap-1"><Plus className="w-4 h-4" /> Add</button>
            </form>
          )}
          <div className="divide-y">
            {orgUnits.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-sm">{u.name}</p>
                  <p className="text-xs text-gray-400">{u.country}</p>
                </div>
                {isAdmin && (
                  <button className="text-gray-400 hover:text-red-600" onClick={() => deleteUnit(u.id)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'standards' && (
        <div className="card space-y-4">
          <p className="text-sm text-gray-500">Select the reporting standard for your ESG disclosures.</p>
          <div className="grid grid-cols-2 gap-3">
            {STANDARDS.map((s) => (
              <button
                key={s}
                className={`p-3 rounded-lg border text-left transition-colors ${standard === s ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}
                onClick={async () => { if (isAdmin) { await api.setEsgStandard(s); setStandard(s); } }}
              >
                <p className="font-medium">{s}</p>
                <p className="text-xs text-gray-400">
                  {s === 'ESRS' ? 'European Sustainability Reporting Standards' :
                   s === 'TCFD' ? 'Task Force on Climate-related Financial Disclosures' :
                   s === 'GRI' ? 'Global Reporting Initiative' :
                   s === 'SASB' ? 'Sustainability Accounting Standards Board' :
                   s === 'CDP' ? 'Carbon Disclosure Project' : 'IFRS Sustainability Disclosure Standards'}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'reset' && isAdmin && (
        <div className="card space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">Data reset is permanent and cannot be undone. Please proceed with caution.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Type</label>
              <select className="input" value={resetForm.type} onChange={(e) => setResetForm({ ...resetForm, type: e.target.value })}>
                <option value="s1">S1 — Own Workforce</option>
                <option value="e1">E1 — Climate Change</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year *</label>
              <input type="number" className="input" required value={resetForm.year} onChange={(e) => setResetForm({ ...resetForm, year: e.target.value })} />
            </div>
          </div>

          {resetForm.type === 's1' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quarter (optional)</label>
                <select className="input" value={resetForm.quarter} onChange={(e) => setResetForm({ ...resetForm, quarter: e.target.value })}>
                  <option value="">All</option>
                  <option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Org Unit (optional)</label>
                <select className="input" value={resetForm.orgUnitId} onChange={(e) => setResetForm({ ...resetForm, orgUnitId: e.target.value })}>
                  <option value="">All</option>
                  {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <button className="btn-danger" onClick={() => setShowResetConfirm(true)}>Reset Data</button>

          {showResetConfirm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-4">
                <h3 className="font-bold text-red-600">Confirm Data Reset</h3>
                <p className="text-sm text-gray-600">This will permanently delete all {resetForm.type.toUpperCase()} data for year {resetForm.year}. This action cannot be undone.</p>
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={() => setShowResetConfirm(false)}>Cancel</button>
                  <button className="btn-danger flex-1" onClick={handleReset}>Confirm Reset</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'credits' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold">Balance: <span className="text-brand-600">{credits.balance} credits</span></p>
            <div className="flex gap-2">
              <input type="date" className="input w-auto" value={dateRange.from} onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })} />
              <input type="date" className="input w-auto" value={dateRange.to} onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })} />
              <button className="btn-secondary" onClick={loadCredits}>Filter</button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">Credits</th>
                <th className="text-left py-2">User</th>
                <th className="text-left py-2">Description</th>
                <th className="text-left py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {credits.transactions?.map((t) => (
                <tr key={t.id}>
                  <td className="py-2"><span className="badge bg-gray-100">{t.transactionType}</span></td>
                  <td className="py-2 font-medium text-red-600">-{t.creditsUsed}</td>
                  <td className="py-2 text-gray-500">{t.user?.firstName} {t.user?.lastName}</td>
                  <td className="py-2 text-gray-500">{t.description}</td>
                  <td className="py-2 text-gray-400">{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
