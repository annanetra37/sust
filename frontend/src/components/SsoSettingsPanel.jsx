import { useEffect, useState } from 'react';
import api from '../services/api';
import { ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────
// SsoSettingsPanel
// Admin-only.  Renders in SettingsPage for Enterprise-tier companies.
// Lets the admin paste their Azure Entra tenant ID, save, and flip
// SSO on/off.  Gated server-side by requireFeature('sso_saml'), so the
// PUT will 403 on non-Enterprise tiers even if this panel is forced open.
// ─────────────────────────────────────────────────────────────────────

export default function SsoSettingsPanel() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [ok, setOk]             = useState('');
  const [tenantId, setTenantId] = useState('');
  const [enabled, setEnabled]   = useState(false);
  const [serverConfigured, setServerConfigured] = useState(false);

  useEffect(() => {
    api
      .getSsoSettings()
      .then((d) => {
        setTenantId(d.msEntraTenantId || '');
        setEnabled(!!d.ssoEnabled);
        setServerConfigured(!!d.serverConfigured);
      })
      .catch((e) => setError(e?.error || 'Failed to load SSO settings.'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    setOk('');
    try {
      const res = await api.updateSsoSettings({
        msEntraTenantId: tenantId.trim() || null,
        ssoEnabled: enabled,
      });
      setTenantId(res.msEntraTenantId || '');
      setEnabled(!!res.ssoEnabled);
      setOk('SSO settings saved.');
    } catch (e) {
      setError(e?.error || 'Failed to save SSO settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading SSO settings…
      </div>
    );
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" />
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Microsoft Entra ID Single Sign-On
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Let users in your Azure AD tenant sign in with their Microsoft account.
          </p>
        </div>
      </div>

      {!serverConfigured && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-lg text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Microsoft SSO has not been configured on the server yet. Contact Triple I
            support to enable it for your workspace.
          </span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Azure Tenant ID
        </label>
        <input
          className="input font-mono"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
        />
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Find this in Azure Portal &rarr; Microsoft Entra ID &rarr; Overview.
        </p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={!serverConfigured}
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Enable &quot;Sign in with Microsoft&quot; for users in this tenant
        </span>
      </label>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}
      {ok && (
        <div className="p-3 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 rounded-lg text-sm">
          {ok}
        </div>
      )}

      <div className="flex justify-end">
        <button className="btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save SSO settings'}
        </button>
      </div>
    </div>
  );
}
