'use strict';

// Placeholder — implemented by the green_key module.
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requireModule } = require('../middleware/module');

router.use(authenticate, requireModule('green_key'));

module.exports = router;
