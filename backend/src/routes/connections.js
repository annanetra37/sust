const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { formatError } = require('../utils/errors');

router.use(authenticate, requireAdmin);

router.get('/', async (req, res) => {
  try {
    const connections = await prisma.dataConnection.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { createdAt: 'desc' },
    });
    const safe = connections.map((c) => ({
      ...c,
      config: { ...c.config, password: c.config.password ? '****' : undefined },
    }));
    res.json(safe);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, type, config: connConfig } = req.body;
    if (!name) return res.status(400).json({ error: 'Connection name is required.' });

    const validTypes = ['postgresql', 'mysql', 'sqlserver', 'aws_rds', 'rest_api'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid connection type "${type}". Supported: ${validTypes.join(', ')}` });
    }

    const connection = await prisma.dataConnection.create({
      data: { companyId: req.user.companyId, name, type, config: connConfig || {} },
    });
    res.status(201).json(connection);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.post('/:id/test', async (req, res) => {
  try {
    const conn = await prisma.dataConnection.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!conn) return res.status(404).json({ error: 'Connection not found.' });

    const cfg = conn.config;

    if (conn.type === 'rest_api') {
      if (!cfg.baseUrl) return res.status(400).json({ error: 'Base URL is required for REST API connections.' });
      const response = await fetch(cfg.baseUrl + (cfg.path || ''), {
        method: cfg.method || 'GET',
        headers: cfg.headers || {},
      });
      if (!response.ok) throw new Error(`API returned status ${response.status}: ${response.statusText}`);
    } else {
      if (!cfg.host) return res.status(400).json({ error: 'Host is required for database connections.' });
      if (!cfg.database) return res.status(400).json({ error: 'Database name is required for database connections.' });
    }

    await prisma.dataConnection.update({
      where: { id: conn.id },
      data: { status: 'connected' },
    });

    res.json({ status: 'connected', message: 'Connection test successful.' });
  } catch (err) {
    const connId = req.params.id;
    try {
      await prisma.dataConnection.update({ where: { id: connId }, data: { status: 'error' } });
    } catch {}
    res.status(400).json({ status: 'error', error: err.message || 'Connection test failed.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await prisma.dataConnection.deleteMany({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (result.count === 0) return res.status(404).json({ error: 'Connection not found.' });
    res.json({ message: 'Connection deleted successfully.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
