'use strict';

const { hasModule, MODULES } = require('../services/modules');

// Gate a router by module entitlement (P-02): a disabled module answers 403
// for every API call, whatever the UI shows.
function requireModule(moduleKey) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.companyId) return res.status(401).json({ error: 'Authentication required.' });
      if (await hasModule(req.user.companyId, moduleKey, req.user.email)) return next();
      return res.status(403).json({
        error: 'MODULE_NOT_ENABLED',
        module: moduleKey,
        message: `${MODULES[moduleKey]?.name || moduleKey} is not enabled for your organisation.`,
      });
    } catch (err) {
      console.error('[module] requireModule error:', err);
      res.status(500).json({ error: 'Module check failed.' });
    }
  };
}

module.exports = { requireModule };
