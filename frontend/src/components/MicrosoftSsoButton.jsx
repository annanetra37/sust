import { useEffect, useState } from 'react';
import api from '../services/api';

// ─────────────────────────────────────────────────────────────────────
// MicrosoftSsoButton
// Renders under the login form.  Auto-shows once the user types an email
// whose domain is configured for Microsoft SSO (500 ms debounce).  The
// button is a plain <a> — navigating to the backend /login endpoint
// starts the OIDC flow; no XHR, no CORS preflight.
// ─────────────────────────────────────────────────────────────────────

export default function MicrosoftSsoButton({ email }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      const trimmed = (email || '').trim().toLowerCase();
      if (!trimmed || !/^[^@]+@[^@]+\.[^@]+$/.test(trimmed)) {
        if (!cancelled) setVisible(false);
        return;
      }
      try {
        const res = await api.ssoConfig(trimmed);
        if (!cancelled) setVisible(!!(res && res.ssoEnabled && res.serverConfigured));
      } catch {
        if (!cancelled) setVisible(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [email]);

  if (!visible) return null;

  const base = api.getApiBase();
  const href = `${base}/auth/microsoft/login?email=${encodeURIComponent(email || '')}`;

  return (
    <a
      href={href}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      {/* Microsoft logo — 4 solid colored squares per MS brand guidelines */}
      <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
        <rect x="1"  y="1"  width="10" height="10" fill="#F25022" />
        <rect x="12" y="1"  width="10" height="10" fill="#7FBA00" />
        <rect x="1"  y="12" width="10" height="10" fill="#00A4EF" />
        <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
      </svg>
      Sign in with Microsoft
    </a>
  );
}
