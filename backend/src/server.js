const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { globalErrorHandler } = require('./utils/errors');

const app = express();

// Security & performance
app.use(helmet());
app.use(compression());
app.use(cors({ origin: config.frontend.url, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 50, message: { error: 'Too many requests' } }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/s1', require('./routes/s1'));
app.use('/api/e1', require('./routes/e1'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/history', require('./routes/history'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/connections', require('./routes/connections'));
app.use('/api/assistant', require('./routes/assistant'));
app.use('/api/lineage', require('./routes/lineage'));

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Global error handler — returns meaningful messages
app.use(globalErrorHandler);

app.listen(config.port, () => {
  console.log(`Triple I ESG API running on port ${config.port}`);
});

module.exports = app;
