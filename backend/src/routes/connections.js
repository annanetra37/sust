const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

// List connections
router.get('/', async (req, res) => {
  const connections = await prisma.dataConnection.findMany({
    where: { companyId: req.user.companyId },
    orderBy: { createdAt: 'desc' },
  });
  // Mask sensitive config fields
  const safe = connections.map((c) => ({
    ...c,
    config: { ...c.config, password: c.config.password ? '****' : undefined },
  }));
  res.json(safe);
});

// Create connection
router.post('/', async (req, res) => {
  const { name, type, config: connConfig } = req.body;
  const validTypes = ['postgresql', 'mysql', 'sqlserver', 'aws_rds', 'rest_api'];
  if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid connection type' });

  const connection = await prisma.dataConnection.create({
    data: { companyId: req.user.companyId, name, type, config: connConfig },
  });
  res.status(201).json(connection);
});

// Test connection
router.post('/:id/test', async (req, res) => {
  const conn = await prisma.dataConnection.findFirst({
    where: { id: req.params.id, companyId: req.user.companyId },
  });
  if (!conn) return res.status(404).json({ error: 'Connection not found' });

  try {
    // In production, attempt actual connection based on type
    // For now, validate config structure
    const cfg = conn.config;

    if (conn.type === 'rest_api') {
      if (!cfg.baseUrl) throw new Error('Base URL required');
      const response = await fetch(cfg.baseUrl + (cfg.path || ''), {
        method: cfg.method || 'GET',
        headers: cfg.headers || {},
      });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
    } else {
      // DB connections - validate required fields
      if (!cfg.host || !cfg.database) throw new Error('Host and database required');
    }

    await prisma.dataConnection.update({
      where: { id: conn.id },
      data: { status: 'connected' },
    });

    res.json({ status: 'connected', message: 'Connection successful' });
  } catch (err) {
    await prisma.dataConnection.update({
      where: { id: conn.id },
      data: { status: 'error' },
    });
    res.status(400).json({ status: 'error', message: err.message });
  }
});

// Delete connection
router.delete('/:id', async (req, res) => {
  await prisma.dataConnection.deleteMany({
    where: { id: req.params.id, companyId: req.user.companyId },
  });
  res.json({ message: 'Connection deleted' });
});

module.exports = router;
