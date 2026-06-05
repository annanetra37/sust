/**
 * ISO → GRI Bridge Routes
 *
 * Mounted at /api/iso-gri in server.js
 *
 * GET  /rules          — list mapping rules (filter by isoStandard, griCode)
 * GET  /rules/summary  — aggregate coverage by GRI topic family
 * POST /upload         — upload ISO data (Excel/CSV)
 * POST /classify       — run classification + gap analysis
 * GET  /gaps           — gap analysis results
 * GET  /gaps/readiness — readiness score
 * GET  /gaps/export    — export gap report as PDF
 */

const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const {
  classifyIngestion,
  computeGapAnalysis,
  getReadinessScore,
  GRI_TOPIC_FAMILIES,
} = require('../services/isoGriEngine');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticate);

// ─── GET /rules — list all mapping rules ────────────────────────

router.get('/rules', async (req, res) => {
  try {
    const { isoStandard, griCode } = req.query;
    const where = {};
    if (isoStandard) where.isoStandard = isoStandard;
    if (griCode) where.griCode = { contains: griCode };

    const rules = await prisma.isoGriMappingRule.findMany({
      where,
      orderBy: [{ isoStandard: 'asc' }, { isoClause: 'asc' }],
    });

    res.json({ count: rules.length, rules });
  } catch (err) {
    console.error('[isoGri] GET /rules error:', err);
    res.status(500).json({ error: 'Failed to fetch mapping rules' });
  }
});

// ─── GET /rules/summary — aggregate by GRI topic family ────────

router.get('/rules/summary', async (req, res) => {
  try {
    const rules = await prisma.isoGriMappingRule.findMany();

    const summary = GRI_TOPIC_FAMILIES.map((family) => {
      const matching = rules.filter((r) => family.pattern.test(r.griCode));
      const full = matching.filter((r) => r.coverageLevel === 'FULL').length;
      const partial = matching.filter((r) => r.coverageLevel === 'PARTIAL').length;
      const supporting = matching.filter((r) => r.coverageLevel === 'SUPPORTING').length;

      // Unique ISO standards contributing
      const isoSources = [...new Set(matching.map((r) => r.isoStandard))];

      return {
        family: family.family,
        label: family.label,
        totalRules: matching.length,
        full,
        partial,
        supporting,
        isoSources,
        disclosureCount: family.disclosures.length,
      };
    });

    res.json({ summary });
  } catch (err) {
    console.error('[isoGri] GET /rules/summary error:', err);
    res.status(500).json({ error: 'Failed to compute rules summary' });
  }
});

// ─── POST /upload — upload ISO data (Excel/CSV) ────────────────

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { companyId } = req.user;
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (data.length === 0) {
      return res.status(400).json({ error: 'No data found in file' });
    }

    // Expected columns: isoStandard, isoClause, dataDescription, dataValue, year
    const requiredCols = ['isoStandard', 'isoClause'];
    const cols = Object.keys(data[0]).map((c) => c.toLowerCase().replace(/[\s_-]/g, ''));
    const colMap = {};

    // Flexible column name matching
    for (const key of Object.keys(data[0])) {
      const norm = key.toLowerCase().replace(/[\s_-]/g, '');
      if (norm.includes('isostandard') || norm.includes('standard')) colMap.isoStandard = key;
      else if (norm.includes('isoclause') || norm.includes('clause')) colMap.isoClause = key;
      else if (norm.includes('description') || norm.includes('datacaptured')) colMap.dataDescription = key;
      else if (norm.includes('datavalue') || norm.includes('value')) colMap.dataValue = key;
      else if (norm === 'year') colMap.year = key;
    }

    if (!colMap.isoStandard || !colMap.isoClause) {
      return res.status(400).json({
        error: 'Missing required columns. Expected: isoStandard, isoClause (+ optional: dataDescription, dataValue, year)',
        foundColumns: Object.keys(data[0]),
      });
    }

    let created = 0;
    let skipped = 0;
    const defaultYear = new Date().getFullYear();

    for (const row of data) {
      const isoStandard = String(row[colMap.isoStandard] || '').trim();
      const isoClause = String(row[colMap.isoClause] || '').trim();

      if (!isoStandard || !isoClause) { skipped++; continue; }

      // Normalise ISO standard name: "ISO 14001" → "ISO_14001"
      const normStandard = isoStandard.replace(/\s+/g, '_').toUpperCase();

      await prisma.isoDataIngestion.create({
        data: {
          companyId,
          isoStandard: normStandard,
          isoClause,
          dataDescription: colMap.dataDescription ? String(row[colMap.dataDescription] || '') : null,
          dataValue: colMap.dataValue ? String(row[colMap.dataValue] || '') : null,
          sourceFile: req.file.originalname,
          year: colMap.year ? (parseInt(row[colMap.year]) || defaultYear) : defaultYear,
        },
      });
      created++;
    }

    logActivity(
      req.user.id, companyId, 'ISO_DATA_UPLOAD',
      `Uploaded ${req.file.originalname}: ${created} records ingested, ${skipped} skipped`,
      { fileName: req.file.originalname, created, skipped },
      req.ip
    );

    res.json({
      message: 'ISO data uploaded successfully',
      records: created,
      skipped,
      fileName: req.file.originalname,
    });
  } catch (err) {
    console.error('[isoGri] POST /upload error:', err);
    res.status(500).json({ error: 'Failed to process ISO data upload' });
  }
});

// ─── POST /classify — run classification + gap analysis ────────

router.post('/classify', async (req, res) => {
  try {
    const { companyId } = req.user;
    const year = parseInt(req.body.year) || new Date().getFullYear();

    // Step 1: Classify ingested data against mapping rules
    const classification = await classifyIngestion(companyId, year);

    // Step 2: Compute gap analysis
    const gaps = await computeGapAnalysis(companyId, year);

    // Step 3: Get readiness score
    const readiness = await getReadinessScore(companyId, year);

    logActivity(
      req.user.id, companyId, 'ISO_GRI_CLASSIFY',
      `Classification complete: ${classification.classified}/${classification.total} records classified, readiness ${readiness.overall}%`,
      { year, ...classification, readiness: readiness.overall },
      req.ip
    );

    res.json({
      classification,
      gapCount: gaps.length,
      readiness,
    });
  } catch (err) {
    console.error('[isoGri] POST /classify error:', err);
    res.status(500).json({ error: 'Classification failed' });
  }
});

// ─── GET /gaps — gap analysis results ───────────────────────────

router.get('/gaps', async (req, res) => {
  try {
    const { companyId } = req.user;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const { status, family } = req.query;

    const where = { companyId, year };
    if (status) where.status = status;
    if (family) where.griTopicFamily = family;

    const gaps = await prisma.griGapAnalysis.findMany({
      where,
      orderBy: [{ griTopicFamily: 'asc' }, { griCode: 'asc' }],
    });

    res.json({ year, count: gaps.length, gaps });
  } catch (err) {
    console.error('[isoGri] GET /gaps error:', err);
    res.status(500).json({ error: 'Failed to fetch gap analysis' });
  }
});

// ─── GET /gaps/readiness — readiness score ──────────────────────

router.get('/gaps/readiness', async (req, res) => {
  try {
    const { companyId } = req.user;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const readiness = await getReadinessScore(companyId, year);
    res.json({ year, ...readiness });
  } catch (err) {
    console.error('[isoGri] GET /gaps/readiness error:', err);
    res.status(500).json({ error: 'Failed to compute readiness score' });
  }
});

// ─── GET /gaps/export — export gap report as PDF ────────────────

router.get('/gaps/export', async (req, res) => {
  try {
    const { companyId } = req.user;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const [company, gaps, readiness] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.griGapAnalysis.findMany({
        where: { companyId, year },
        orderBy: [{ griTopicFamily: 'asc' }, { griCode: 'asc' }],
      }),
      getReadinessScore(companyId, year),
    ]);

    if (gaps.length === 0) {
      return res.status(404).json({
        error: 'No gap analysis data found. Run /classify first.',
      });
    }

    // ── Generate PDF ────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ISO_GRI_Readiness_${company.name.replace(/\s/g, '_')}_${year}.pdf"`
    );
    doc.pipe(res);

    // ── Cover page ──────────────────────────────────────────────
    doc.moveDown(6);
    doc.fontSize(28).font('Helvetica-Bold').text('ISO → GRI', { align: 'center' });
    doc.fontSize(22).text('Readiness Assessment', { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(16).font('Helvetica').text(company.name, { align: 'center' });
    doc.fontSize(12).text(`Reporting Year: ${year}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toISOString().split('T')[0]}`, { align: 'center' });
    doc.moveDown(4);

    // Overall readiness — big number
    doc.fontSize(60).font('Helvetica-Bold').text(`${readiness.overall}%`, { align: 'center' });
    doc.fontSize(14).font('Helvetica').text('Overall GRI Readiness', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(11).text(
      `${readiness.covered} Covered | ${readiness.partial} Partial | ${readiness.gap} Gaps  (${readiness.totalDisclosures} total disclosures)`,
      { align: 'center' }
    );

    // ── Per-topic-family heatmap table ──────────────────────────
    doc.addPage();
    doc.fontSize(18).font('Helvetica-Bold').text('Coverage by GRI Topic Family', { underline: true });
    doc.moveDown(1);

    // Table header
    const tableTop = doc.y;
    const colX = { family: 50, status: 200, iso: 320, gaps: 430 };

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('GRI Topic', colX.family, tableTop);
    doc.text('Readiness', colX.status, tableTop);
    doc.text('ISO Sources', colX.iso, tableTop);
    doc.text('Gaps', colX.gaps, tableTop);
    doc.moveDown(0.5);

    let rowY = doc.y;
    doc.moveTo(50, rowY).lineTo(545, rowY).stroke();
    rowY += 5;

    doc.font('Helvetica').fontSize(9);
    for (const f of readiness.byFamily) {
      if (rowY > 750) {
        doc.addPage();
        rowY = 50;
      }

      // Find ISO sources from the gaps data
      const familyGaps = gaps.filter((g) => g.griTopicFamily === f.family);
      const isoSources = new Set();
      familyGaps.forEach((g) => {
        if (g.coveringSources) {
          const sources = Array.isArray(g.coveringSources) ? g.coveringSources : [];
          sources.forEach((s) => isoSources.add(s.isoStandard));
        }
      });
      const gapCount = familyGaps.filter((g) => g.status === 'GAP').length;

      // Color-code readiness
      const readinessColor = f.readiness >= 70 ? '#2E7D32' : f.readiness >= 40 ? '#F57F17' : '#C62828';

      doc.fillColor('#000000').text(`${f.family} (${f.label})`, colX.family, rowY, { width: 145 });
      doc.fillColor(readinessColor).text(`${f.readiness}%`, colX.status, rowY, { width: 50 });
      doc.fillColor('#000000');
      doc.text(
        [...isoSources].map((s) => s.replace('ISO_', 'ISO ')).join(', ') || 'None',
        colX.iso, rowY, { width: 105 }
      );
      doc.text(`${gapCount}/${f.total}`, colX.gaps, rowY);

      rowY += 20;
    }

    // ── Detailed gap list by family ─────────────────────────────
    doc.addPage();
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000').text('Detailed Gap Analysis', { underline: true });
    doc.moveDown(1);

    // Group gaps by family
    const groupedGaps = {};
    for (const g of gaps) {
      if (!groupedGaps[g.griTopicFamily]) groupedGaps[g.griTopicFamily] = [];
      groupedGaps[g.griTopicFamily].push(g);
    }

    for (const [familyKey, familyGaps] of Object.entries(groupedGaps)) {
      const familyDef = GRI_TOPIC_FAMILIES.find((f) => f.family === familyKey);

      if (doc.y > 680) doc.addPage();

      doc.fontSize(13).font('Helvetica-Bold').text(`${familyKey} — ${familyDef ? familyDef.label : ''}`);
      doc.moveDown(0.3);

      doc.fontSize(8).font('Helvetica');
      for (const g of familyGaps) {
        if (doc.y > 740) doc.addPage();

        const statusIcon = g.status === 'COVERED' ? '[OK]' : g.status === 'PARTIAL' ? '[!!]' : '[--]';
        const statusColor = g.status === 'COVERED' ? '#2E7D32' : g.status === 'PARTIAL' ? '#F57F17' : '#C62828';

        doc.fillColor(statusColor).text(
          `  ${statusIcon} ${g.griCode} — ${g.griName}  (${g.status})`,
          { continued: false }
        );

        if (g.status !== 'COVERED' && g.recommendedAction) {
          doc.fillColor('#555555').text(`       Action: ${g.recommendedAction}`);
        }
      }
      doc.moveDown(0.5);
      doc.fillColor('#000000');
    }

    // ── Recommended actions section ─────────────────────────────
    const gapItems = gaps.filter((g) => g.status === 'GAP' && g.recommendedAction);
    if (gapItems.length > 0) {
      doc.addPage();
      doc.fontSize(18).font('Helvetica-Bold').text('Recommended Actions', { underline: true });
      doc.moveDown(1);

      doc.fontSize(10).font('Helvetica');
      // Deduplicate actions
      const seen = new Set();
      let actionNum = 1;
      for (const g of gapItems) {
        if (seen.has(g.recommendedAction)) continue;
        seen.add(g.recommendedAction);

        if (doc.y > 740) doc.addPage();
        doc.text(`${actionNum}. ${g.recommendedAction}`);
        doc.moveDown(0.3);
        actionNum++;
      }
    }

    // ── Footer ──────────────────────────────────────────────────
    doc.addPage();
    doc.moveDown(10);
    doc.fontSize(10).font('Helvetica').fillColor('#888888').text(
      'This report was generated by Triple I ESG Portal. ' +
      'The ISO → GRI mapping is based on the ISO-to-GRI Mapping Matrix v1.0. ' +
      'Coverage assessments are indicative and should be reviewed by a qualified sustainability professional.',
      { align: 'center' }
    );

    doc.end();

    logActivity(
      req.user.id, companyId, 'ISO_GRI_EXPORT',
      `Exported ISO → GRI readiness report (PDF) for ${year}`,
      { year, readiness: readiness.overall },
      req.ip
    );
  } catch (err) {
    console.error('[isoGri] GET /gaps/export error:', err);
    res.status(500).json({ error: 'Failed to generate gap report' });
  }
});

module.exports = router;
