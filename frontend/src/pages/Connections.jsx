import { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Database, Trash2, Wifi, WifiOff, Loader2, Plus, ArrowLeft, CheckCircle, XCircle,
  Server, Cloud, Globe, FileSpreadsheet, Warehouse, HardDrive, Cable, ArrowRight, Shield
} from 'lucide-react';
import { HelpBanner, InfoTip, FieldLabel } from '../components/HelpSystem';
import FeatureLock from '../components/FeatureLock';
import useFeature from '../hooks/useFeature';

const CONNECTORS = [
  {
    category: 'Databases',
    items: [
      {
        value: 'postgresql', label: 'PostgreSQL', icon: Server, color: 'text-blue-600', bg: 'bg-blue-50',
        desc: 'Connect to PostgreSQL databases to pull sustainability data directly.',
        fields: 'host, port, database, schema, SSL',
      },
      {
        value: 'mysql', label: 'MySQL / MariaDB', icon: Database, color: 'text-orange-600', bg: 'bg-orange-50',
        desc: 'Connect to MySQL or MariaDB databases for direct data import.',
        fields: 'host, port, database, SSL',
      },
      {
        value: 'sqlserver', label: 'Microsoft SQL Server', icon: HardDrive, color: 'text-red-600', bg: 'bg-red-50',
        desc: 'Connect to SQL Server databases including Azure SQL.',
        fields: 'host, port, database, Windows auth or SQL auth',
      },
      {
        value: 'aws_rds', label: 'Amazon RDS', icon: Cloud, color: 'text-amber-600', bg: 'bg-amber-50',
        desc: 'Connect to Amazon RDS instances (PostgreSQL, MySQL, Aurora).',
        fields: 'endpoint, port, database, IAM or password auth',
      },
    ],
  },
  {
    category: 'Cloud & APIs',
    items: [
      {
        value: 'rest_api', label: 'REST API', icon: Globe, color: 'text-emerald-600', bg: 'bg-emerald-50',
        desc: 'Connect to any REST API endpoint to pull data programmatically.',
        fields: 'base URL, path, method, auth (None/API-Key/Basic/OAuth2)',
      },
      {
        value: 'google_sheets', label: 'Google Sheets', icon: FileSpreadsheet, color: 'text-green-600', bg: 'bg-green-50',
        desc: 'Import data directly from Google Sheets spreadsheets.',
        fields: 'spreadsheet URL or ID, sheet name', coming: true,
      },
      {
        value: 'sharepoint', label: 'SharePoint / OneDrive', icon: Cloud, color: 'text-blue-500', bg: 'bg-blue-50',
        desc: 'Connect to Microsoft SharePoint or OneDrive for Business.',
        fields: 'tenant, site URL, folder path', coming: true,
      },
    ],
  },
  {
    category: 'Data Warehouses',
    items: [
      {
        value: 'snowflake', label: 'Snowflake', icon: Warehouse, color: 'text-cyan-600', bg: 'bg-cyan-50',
        desc: 'Connect to Snowflake data warehouse for enterprise-scale data.',
        fields: 'account, warehouse, database, schema', coming: true,
      },
      {
        value: 'bigquery', label: 'Google BigQuery', icon: Warehouse, color: 'text-blue-600', bg: 'bg-blue-50',
        desc: 'Connect to BigQuery for large-scale data analytics.',
        fields: 'project ID, dataset, service account key', coming: true,
      },
    ],
  },
  {
    category: 'Sustainability Platforms',
    items: [
      {
        value: 'sap', label: 'SAP ERP / S4HANA', icon: Cable, color: 'text-blue-700', bg: 'bg-blue-50',
        desc: 'Pull operational, energy, and supply chain data from SAP systems.',
        fields: 'host, system ID, client, user', coming: true,
      },
      {
        value: 'oracle', label: 'Oracle EBS / Cloud', icon: Server, color: 'text-red-700', bg: 'bg-red-50',
        desc: 'Connect to Oracle E-Business Suite or Oracle Cloud.',
        fields: 'host, SID/service, user', coming: true,
      },
    ],
  },
];

const ALL_CONNECTOR_MAP = {};
CONNECTORS.forEach((cat) => cat.items.forEach((c) => { ALL_CONNECTOR_MAP[c.value] = c; }));

export default function Connections() {
  const connectionsFeature = useFeature('db_connections');
  const [connections, setConnections] = useState([]);
  const [setupType, setSetupType] = useState(null);
  const [testing, setTesting] = useState(null);
  const [form, setForm] = useState({ name: '', type: '', config: {} });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Short-circuit the entire page for tiers that don't have this feature —
  // saves a round-trip to an endpoint that would return 403 anyway.
  if (!connectionsFeature.allowed) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Data Connections</h1>
          <p className="text-gray-500 dark:text-gray-400">Pipe data directly from your warehouses and SaaS tools.</p>
        </div>
        <FeatureLock
          feature="db_connections"
          description="Connect PostgreSQL, MySQL, SQL Server, Snowflake, BigQuery, and more. AI auto-maps your tables to the correct ESG schemas — no manual mapping. Upgrade to Professional to enable data connections."
        />
      </div>
    );
  }

  const load = () => {
    api.getConnections()
      .then(setConnections)
      .catch(() => setConnections([]))
      .finally(() => setLoaded(true));
  };
  useEffect(load, []);

  const startSetup = (type) => {
    const connector = ALL_CONNECTOR_MAP[type];
    if (connector?.coming) return;

    const defaultConfig = type === 'rest_api'
      ? { baseUrl: '', path: '', method: 'GET', authType: 'none', apiKey: '', headers: '' }
      : { host: '', port: type === 'mysql' ? 3306 : type === 'sqlserver' ? 1433 : 5432, database: '', schema: 'public', username: '', password: '', ssl: false };

    setForm({ name: '', type, config: defaultConfig });
    setSetupType(type);
    setError('');
    setSuccess('');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createConnection(form);
      setSuccess('Connection created successfully!');
      load();
      setTimeout(() => { setSetupType(null); setSuccess(''); }, 1500);
    } catch (err) {
      setError(err.error || 'Failed to create connection.');
    }
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
    if (!confirm('Delete this connection? This cannot be undone.')) return;
    await api.deleteConnection(id);
    load();
  };

  const connector = setupType ? ALL_CONNECTOR_MAP[setupType] : null;
  const isApi = setupType === 'rest_api';

  // ─── Setup Form ─────────────────────────────────
  if (setupType && connector) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <button onClick={() => setSetupType(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-600">
          <ArrowLeft className="w-4 h-4" /> Back to Connectors
        </button>

        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl ${connector.bg} flex items-center justify-center`}>
            <connector.icon className={`w-6 h-6 ${connector.color}`} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Connect to {connector.label}</h1>
            <p className="text-sm text-gray-500">{connector.desc}</p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="card space-y-4">
          <FieldLabel label="Connection Name" required info="A friendly name to identify this connection (e.g., 'Production HR Database')." />
          <input className="input" placeholder="e.g., Production Database" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

          {isApi ? (
            <>
              <FieldLabel label="Base URL" required info="The root URL of the API (e.g., https://api.example.com)" />
              <input className="input" placeholder="https://api.example.com" required value={form.config.baseUrl || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, baseUrl: e.target.value } })} />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel label="Path" info="API path appended to base URL (e.g., /v1/emissions)" />
                  <input className="input" placeholder="/v1/data" value={form.config.path || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, path: e.target.value } })} />
                </div>
                <div>
                  <FieldLabel label="Method" />
                  <select className="input" value={form.config.method || 'GET'} onChange={(e) => setForm({ ...form, config: { ...form.config, method: e.target.value } })}>
                    <option>GET</option><option>POST</option><option>PUT</option>
                  </select>
                </div>
              </div>

              <FieldLabel label="Authentication" info="How the API authenticates requests." />
              <select className="input" value={form.config.authType || 'none'} onChange={(e) => setForm({ ...form, config: { ...form.config, authType: e.target.value } })}>
                <option value="none">No Authentication</option>
                <option value="api_key">API Key</option>
                <option value="basic">Basic Auth (username/password)</option>
                <option value="bearer">Bearer Token</option>
                <option value="oauth2">OAuth 2.0</option>
              </select>

              {form.config.authType === 'api_key' && (
                <>
                  <FieldLabel label="API Key" required />
                  <input className="input" type="password" placeholder="Your API key" value={form.config.apiKey || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, apiKey: e.target.value } })} />
                </>
              )}
              {form.config.authType === 'basic' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel label="Username" required />
                    <input className="input" value={form.config.username || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, username: e.target.value } })} />
                  </div>
                  <div>
                    <FieldLabel label="Password" required />
                    <input className="input" type="password" value={form.config.password || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, password: e.target.value } })} />
                  </div>
                </div>
              )}
              {form.config.authType === 'bearer' && (
                <>
                  <FieldLabel label="Bearer Token" required />
                  <input className="input" type="password" placeholder="Token" value={form.config.apiKey || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, apiKey: e.target.value } })} />
                </>
              )}

              <FieldLabel label="Custom Headers" info='JSON format: {"X-Custom": "value"}' />
              <input className="input" placeholder='{"Content-Type": "application/json"}' value={form.config.headers || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, headers: e.target.value } })} />
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <FieldLabel label="Host / Endpoint" required info="Server hostname or IP address." />
                  <input className="input" placeholder="db.example.com" required value={form.config.host || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, host: e.target.value } })} />
                </div>
                <div>
                  <FieldLabel label="Port" />
                  <input type="number" className="input" value={form.config.port || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, port: parseInt(e.target.value) || 5432 } })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel label="Database" required info="The database name to connect to." />
                  <input className="input" placeholder="sustainability_db" required value={form.config.database || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, database: e.target.value } })} />
                </div>
                <div>
                  <FieldLabel label="Schema" info="Database schema (PostgreSQL). Default: public" />
                  <input className="input" placeholder="public" value={form.config.schema || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, schema: e.target.value } })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel label="Username" required />
                  <input className="input" placeholder="db_user" value={form.config.username || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, username: e.target.value } })} />
                </div>
                <div>
                  <FieldLabel label="Password" required />
                  <input className="input" type="password" placeholder="********" value={form.config.password || ''} onChange={(e) => setForm({ ...form, config: { ...form.config, password: e.target.value } })} />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="w-4 h-4 rounded" checked={form.config.ssl || false} onChange={(e) => setForm({ ...form, config: { ...form.config, ssl: e.target.checked } })} />
                  Require SSL/TLS
                </label>
                <InfoTip>Enable SSL for encrypted connections. Required for most cloud-hosted databases.</InfoTip>
              </div>
            </>
          )}

          {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
          {success && <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" />{success}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setSetupType(null)}>Cancel</button>
            <button type="submit" className="btn-primary flex-1">Create Connection</button>
          </div>
        </form>

        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-start gap-2">
            <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-medium text-blue-900">Security Note</p>
              <p className="mt-1">Credentials are stored encrypted. We recommend using read-only database users dedicated to ESG data extraction. Never share your root/admin database credentials.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Catalog View ──────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Data Connections</h1>
        <p className="text-gray-500">Connect your source systems to automatically pull sustainability data</p>
      </div>

      <HelpBanner id="connections-guide" title="How Data Connections Work" variant="info">
        Connect your databases, APIs, or cloud platforms to pull sustainability data directly into the ESG Portal.
        Our AI ETL pipeline will automatically clean, structure, and ingest the data — no matter the format.
        Once connected, you can set up recurring syncs to keep your data current.
      </HelpBanner>

      {/* Active connections */}
      {connections.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Active Connections</h2>
          <div className="grid gap-3">
            {connections.map((c) => {
              const connInfo = ALL_CONNECTOR_MAP[c.type];
              const ConnIcon = connInfo?.icon || Database;
              return (
                <div key={c.id} className="card flex items-center gap-4 py-4">
                  <div className={`w-10 h-10 rounded-lg ${connInfo?.bg || 'bg-gray-100'} flex items-center justify-center`}>
                    <ConnIcon className={`w-5 h-5 ${connInfo?.color || 'text-gray-500'}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-400">{connInfo?.label || c.type} {c.lastSyncAt ? `· Last sync: ${new Date(c.lastSyncAt).toLocaleDateString()}` : ''}</p>
                  </div>
                  <span className={`badge flex items-center gap-1 ${c.status === 'connected' ? 'bg-green-100 text-green-700' : c.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.status === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {c.status === 'connected' ? 'Connected' : c.status === 'error' ? 'Error' : 'Disconnected'}
                  </span>
                  <button className="btn-secondary text-xs py-1.5" onClick={() => handleTest(c.id)} disabled={testing === c.id}>
                    {testing === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Test'}
                  </button>
                  <button className="text-gray-400 hover:text-red-600" onClick={() => handleDelete(c.id)} title="Delete connection">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Connector catalog */}
      {CONNECTORS.map((category) => (
        <div key={category.category}>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">{category.category}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {category.items.map((connector) => (
              <button
                key={connector.value}
                onClick={() => startSetup(connector.value)}
                disabled={connector.coming}
                className={`card text-left p-4 transition-all group ${
                  connector.coming
                    ? 'opacity-60 cursor-not-allowed'
                    : 'hover:border-brand-300 hover:shadow-md cursor-pointer'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg ${connector.bg} flex items-center justify-center shrink-0`}>
                    <connector.icon className={`w-5 h-5 ${connector.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{connector.label}</p>
                      {connector.coming && <span className="badge bg-gray-100 text-gray-500">Coming Soon</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{connector.desc}</p>
                    <p className="text-[10px] text-gray-300 mt-1.5">{connector.fields}</p>
                  </div>
                  {!connector.coming && (
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500 shrink-0 mt-1" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
