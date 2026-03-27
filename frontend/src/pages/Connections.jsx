import { useState, useEffect } from 'react';
import api from '../services/api';
import { Database, Plus, Trash2, Wifi, WifiOff, Loader2 } from 'lucide-react';

const TYPES = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL / MariaDB' },
  { value: 'sqlserver', label: 'SQL Server' },
  { value: 'aws_rds', label: 'AWS RDS' },
  { value: 'rest_api', label: 'REST API' },
];

export default function Connections() {
  const [connections, setConnections] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [testing, setTesting] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'postgresql', config: { host: '', port: 5432, database: '', username: '', password: '', ssl: false } });

  const load = () => api.getConnections().then(setConnections);
  useEffect(load, []);

  const isApi = form.type === 'rest_api';

  const handleCreate = async (e) => {
    e.preventDefault();
    await api.createConnection(form);
    setShowCreate(false);
    setForm({ name: '', type: 'postgresql', config: { host: '', port: 5432, database: '', username: '', password: '', ssl: false } });
    load();
  };

  const handleTest = async (id) => {
    setTesting(id);
    try {
      await api.testConnection(id);
      load();
    } catch {} finally {
      setTesting(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this connection?')) return;
    await api.deleteConnection(id);
    load();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Connections</h1>
          <p className="text-gray-500">Connect external data sources for direct data ingestion</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> New Connection
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold">New Connection</h2>
            <input className="input" placeholder="Connection name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, config: e.target.value === 'rest_api' ? { baseUrl: '', path: '', method: 'GET', authType: 'none' } : { host: '', port: 5432, database: '', username: '', password: '', ssl: false } })}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>

            {isApi ? (
              <>
                <input className="input" placeholder="Base URL" required value={form.config.baseUrl || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, baseUrl: e.target.value } })} />
                <input className="input" placeholder="Path (e.g., /api/data)" value={form.config.path || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, path: e.target.value } })} />
                <select className="input" value={form.config.method || 'GET'} onChange={(e) => setForm({ ...form, config: { ...form.config, method: e.target.value } })}>
                  <option>GET</option><option>POST</option>
                </select>
                <select className="input" value={form.config.authType || 'none'} onChange={(e) => setForm({ ...form, config: { ...form.config, authType: e.target.value } })}>
                  <option value="none">No Auth</option>
                  <option value="api_key">API Key</option>
                  <option value="basic">Basic Auth</option>
                  <option value="oauth2">OAuth2</option>
                </select>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <input className="input col-span-2" placeholder="Host" required value={form.config.host || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, host: e.target.value } })} />
                  <input type="number" className="input" placeholder="Port" value={form.config.port || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, port: parseInt(e.target.value) } })} />
                </div>
                <input className="input" placeholder="Database" required value={form.config.database || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, database: e.target.value } })} />
                <input className="input" placeholder="Username" value={form.config.username || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, username: e.target.value } })} />
                <input type="password" className="input" placeholder="Password" value={form.config.password || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, password: e.target.value } })} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.config.ssl || false} onChange={(e) => setForm({ ...form, config: { ...form.config, ssl: e.target.checked } })} />
                  Use SSL
                </label>
              </>
            )}

            <div className="flex gap-3">
              <button type="button" className="btn-secondary flex-1" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn-primary flex-1">Create</button>
            </div>
          </form>
        </div>
      )}

      {/* Connections list */}
      <div className="grid gap-4">
        {connections.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No connections yet. Create one to start syncing data.</p>
          </div>
        ) : connections.map((c) => (
          <div key={c.id} className="card flex items-center gap-4">
            <Database className="w-8 h-8 text-gray-400" />
            <div className="flex-1">
              <p className="font-medium">{c.name}</p>
              <p className="text-sm text-gray-400">{TYPES.find((t) => t.value === c.type)?.label || c.type}</p>
            </div>
            <span className={`badge ${c.status === 'connected' ? 'bg-green-100 text-green-700' : c.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
              {c.status === 'connected' ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
              {c.status}
            </span>
            <button className="btn-secondary text-sm" onClick={() => handleTest(c.id)} disabled={testing === c.id}>
              {testing === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
            </button>
            <button className="text-gray-400 hover:text-red-600" onClick={() => handleDelete(c.id)}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
