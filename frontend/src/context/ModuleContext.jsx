import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/api';

// Entitled modules for the signed-in tenant (Module Launcher, P-01).
// `current` follows the URL: /fe → Financed Emissions, /gk → Green Key,
// anything else → General ESG.
const ModuleContext = createContext({ modules: [], loading: true, isPlatformAdmin: false, refresh: () => {} });

export const LAST_MODULE_KEY = 'triplei_last_module';

export function moduleForPath(pathname) {
  if (pathname === '/fe' || pathname.startsWith('/fe/')) return 'financed_emissions';
  if (pathname === '/gk' || pathname.startsWith('/gk/')) return 'green_key';
  return 'general';
}

export function rememberModule(key) {
  try { localStorage.setItem(LAST_MODULE_KEY, key); } catch { /* storage unavailable */ }
}

export function lastModule() {
  try { return localStorage.getItem(LAST_MODULE_KEY); } catch { return null; }
}

export function ModuleProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ modules: [], loading: true, isPlatformAdmin: false });

  const refresh = useCallback(async () => {
    if (!user) { setState({ modules: [], loading: false, isPlatformAdmin: false }); return; }
    try {
      const res = await api.getModules();
      setState({ modules: res.modules || [], isPlatformAdmin: !!res.isPlatformAdmin, loading: false });
    } catch {
      // Fall back to General ESG so the portal stays usable.
      setState({ modules: [{ key: 'general', name: 'General ESG', home: '/' }], isPlatformAdmin: false, loading: false });
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return <ModuleContext.Provider value={{ ...state, refresh }}>{children}</ModuleContext.Provider>;
}

export function useModules() {
  return useContext(ModuleContext);
}
