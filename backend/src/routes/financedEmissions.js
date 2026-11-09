'use strict';

// Placeholder — implemented by the financed_emissions module.
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requireModule } = require('../middleware/module');

router.use(authenticate, requireModule('financed_emissions'));

module.exports = router;
