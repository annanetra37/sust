const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const estimator = require('../utils/estimator');
const { STANDARDS, validateReportData } = require('../services/standardRegistry');
const { formatError } = require('../utils/errors');

router.use(authenticate);

// ─── Current balance ────────────────────────────────────────
router.get('/balance', async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.user.companyId },
    select: { creditBalance: true },
  });
  res.json({
    balance: company?.creditBalance ?? 0,
    multiplier: estimator.CREDIT_MULTIPLIER,
  });
});

// ─── Preview estimate for any supported action ──────────────
// Body: { action: 'doc-extract'|'excel-e1'|'excel-s1'|'report-gen', params: {...} }
// Returns: { credits, estimatedCostUSD, breakdown, balance, sufficient }
router.post('/estimate', async (req, res) => {
  try {
    const { action, params = {} } = req.body || {};
    if (!action) return res.status(400).json({ error: 'action is required' });

    let estimate;
    switch (action) {
      case 'doc-extract':
        estimate = estimator.estimateDocExtract(params);
        break;

      case 'excel-e1':
      case 'excel-s1':
        estimate = estimator.estimateExcelETL(params);
        break;

      case 'report-gen': {
        const { year, standard, topics } = params;
        if (!year || !standard) {
          return res.status(400).json({ error: 'year and standard are required for report-gen' });
        }
        const std = STANDARDS[standard];
        if (!std) return res.status(400).json({ error: `Unknown standard: ${standard}` });
        const selectedTopics = topics && topics.length ? topics : Object.keys(std.topics);
        const validation = await validateReportData(
          prisma, req.user.companyId, parseInt(year), standard, selectedTopics,
        );
        estimate = estimator.estimateReport({ validation });
        estimate.breakdown.year = parseInt(year);
        estimate.breakdown.standard = standard;
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { creditBalance: true },
    });
    const balance = company?.creditBalance ?? 0;

    res.json({
      action,
      ...estimate,
      multiplier: estimator.CREDIT_MULTIPLIER,
      balance,
      sufficient: balance >= estimate.credits,
      remainingAfter: Math.max(0, balance - estimate.credits),
    });
  } catch (err) {
    console.error('Credits estimate error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
