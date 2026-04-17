import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LogoFull } from '../components/Logo';

// ─────────────────────────────────────────────────────────────────────
// MicrosoftAuthComplete
// Landing page after the backend /api/auth/microsoft/callback redirects
// the browser here with tokens in the URL fragment:
//     /auth/microsoft/complete#access_token=...&refresh_token=...
// Errors arrive as a normal query string so they're easy to surface:
//     /auth/microsoft/complete?error=sso_tenant_not_configured
// ─────────────────────────────────────────────────────────────────────

const ERROR_MESSAGES = {
  sso_init_failed:
    "We couldn't start the Microsoft sign-in flow. Please try again or use password login.",
  sso_tenant_not_configured:
    'Your Microsoft account is valid, but this workspace has not enabled Single Sign-On for your organization. Ask your administrator to configure SSO in Settings, or sign in with email and password.',
  sso_tenant_mismatch:
    'Your Microsoft account belongs to a different Azure AD tenant than the one configured for your workspace. Please contact your administrator.',
  incomplete_identity:
    "Microsoft didn't return a complete profile (email, given name, family name). Please grant the requested permissions and try again.",
  invalid_or_expired_state:
    'Your sign-in link has expired. Please start over from the login page.',
  missing_code_or_state:
    'The response from Microsoft was incomplete. Please try signing in again.',
  sso_callback_failed:
    'Something went wrong while completing your Microsoft sign-in. Please try again.',
};

export default function MicrosoftAuthComplete() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { updateUser } = useAuth();
  const [status, setStatus] = useState('loading'); // loading | error
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    // Errors come back as query params.
    const err = params.get('error');
    if (err) {
      setStatus('error');
      setErrorText(ERROR_MESSAGES[err] || `Sign-in failed: ${err}`);
      return;
    }

    // Tokens come back in the URL fragment so they never appear in
    // server logs, Referer headers, or browser history.
    const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const access = frag.get('access_token');
    const refresh = frag.get('refresh_token');

    if (!access || !refresh) {
      setStatus('error');
      setErrorText('Incomplete SSO response. Please try signing in again.');
      return;
    }

    api.setTokens(access, refresh);
    // Clear the fragment so a refresh doesn't re-run this page.
    window.history.replaceState({}, document.title, '/auth/microsoft/complete');

    // Fetch the user profile so AuthContext has the company + role.
    api
      .getMe()
      .then((u) => {
        localStorage.setItem('user', JSON.stringify(u));
        updateUser(u);
        navigate('/', { replace: true });
      })
      .catch((e) => {
        setStatus('error');
        setErrorText(e?.error || 'Could not load your profile after SSO.');
        api.clearTokens();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-gray-50 dark:from-gray-950 dark:to-gray-900 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <LogoFull className="mb-3" size="large" />
        </div>

        {status === 'loading' && (
          <div className="card text-center space-y-3">
            <div className="flex justify-center">
              <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" />
            </div>
            <p className="text-gray-600 dark:text-gray-300">
              Finishing your Microsoft sign-in…
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="card space-y-4">
            <div className="p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {errorText}
            </div>
            <button className="btn-primary w-full" onClick={() => navigate('/login')}>
              Back to login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
