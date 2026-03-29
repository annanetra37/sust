const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } = require('docx');

router.use(authenticate);

// ─── Data Lineage ───────────────────────────────────────────
// Returns: Topic → Org Unit → User → Uploads → Records

router.get('/', async (req, res) => {
  try {
    const { companyId } = req.user;
    const { topic, orgUnitId, userId, year } = req.query;

    // Get all uploads with related data counts
    const where = { companyId };
    if (topic) where.fileType = topic; // E1, S1
    if (orgUnitId) where.orgUnitId = orgUnitId;
    if (userId) where.userId = userId;

    const uploads = await prisma.uploadHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Get org units for display
    const orgUnits = await prisma.orgUnit.findMany({
      where: { companyId },
      select: { id: true, name: true, country: true },
    });

    const orgUnitMap = {};
    orgUnits.forEach((u) => { orgUnitMap[u.id] = u; });

    // Get all users who uploaded data
    const users = await prisma.user.findMany({
      where: { companyId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    // Build lineage tree: Topic → OrgUnit → User → Uploads
    const lineage = {};

    for (const upload of uploads) {
      const t = upload.fileType === 'E1' ? 'Environmental' : upload.fileType === 'S1' ? 'Social' : 'Governance';
      const topicKey = upload.fileType || 'Other';

      if (!lineage[topicKey]) {
        lineage[topicKey] = { label: t, key: topicKey, orgUnits: {} };
      }

      const ouId = upload.orgUnitId || upload.orgUnit || 'unknown';
      const ouName = orgUnitMap[ouId]?.name || upload.orgUnit || ouId;
      const ouCountry = orgUnitMap[ouId]?.country || '';

      if (!lineage[topicKey].orgUnits[ouId]) {
        lineage[topicKey].orgUnits[ouId] = { id: ouId, name: ouName, country: ouCountry, users: {} };
      }

      const uId = upload.userId;
      const uName = `${upload.user?.firstName || ''} ${upload.user?.lastName || ''}`.trim();

      if (!lineage[topicKey].orgUnits[ouId].users[uId]) {
        lineage[topicKey].orgUnits[ouId].users[uId] = {
          id: uId, name: uName, email: upload.user?.email || '',
          uploads: [],
        };
      }

      // Get record count for this upload
      let recordCount = 0;
      if (upload.fileType === 'E1') {
        recordCount = await prisma.fE1EmissionActivityData.count({
          where: {
            companyId,
            createdAt: { gte: upload.createdAt, lte: upload.completedAt || new Date() },
            ...(year ? { year: parseInt(year) } : {}),
          },
        });
      } else if (upload.fileType === 'S1') {
        recordCount = await prisma.fS1WorkforceComposition.count({
          where: {
            companyId,
            createdAt: { gte: upload.createdAt, lte: upload.completedAt || new Date() },
            ...(year ? { year: parseInt(year) } : {}),
          },
        });
      }

      lineage[topicKey].orgUnits[ouId].users[uId].uploads.push({
        id: upload.id,
        fileName: upload.fileName,
        fileType: upload.fileType,
        status: upload.status,
        auditStatus: upload.auditStatus || 'pending',
        totalRows: upload.totalRows,
        processedRows: upload.processedRows,
        recordCount,
        hasSourceFile: !!upload.storedFilePath,
        createdAt: upload.createdAt,
        completedAt: upload.completedAt,
      });
    }

    // Convert nested objects to arrays for frontend
    const tree = Object.values(lineage).map((topic) => ({
      ...topic,
      orgUnits: Object.values(topic.orgUnits).map((ou) => ({
        ...ou,
        users: Object.values(ou.users),
      })),
    }));

    res.json({ tree, filters: { orgUnits, users } });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Export Audit Report ────────────────────────────────────

router.post('/export', async (req, res) => {
  try {
    const { companyId } = req.user;
    const { format, topic, orgUnitId, userId, year } = req.body;
    const fmt = format || 'pdf';

    const company = await prisma.company.findUnique({ where: { id: companyId } });

    // Get filtered uploads
    const where = { companyId };
    if (topic) where.fileType = topic;
    if (orgUnitId) where.orgUnitId = orgUnitId;
    if (userId) where.userId = userId;

    const uploads = await prisma.uploadHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    const orgUnits = await prisma.orgUnit.findMany({ where: { companyId } });
    const orgUnitMap = {};
    orgUnits.forEach((u) => { orgUnitMap[u.id] = u; });

    // Get credit transactions
    const creditTxns = await prisma.creditTransaction.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    if (fmt === 'pdf') {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ESG_Audit_Trail_${new Date().toISOString().split('T')[0]}.pdf"`);
      doc.pipe(res);

      // Title
      doc.fontSize(20).font('Helvetica-Bold').text('ESG Data Lineage & Audit Trail', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').text(`${company.name} | Generated: ${new Date().toLocaleDateString()} | Standard: ${company.esgStandard}`, { align: 'center' });
      doc.moveDown(1);

      // Summary
      doc.fontSize(14).font('Helvetica-Bold').text('Summary');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Total uploads: ${uploads.length}`);
      doc.text(`Completed: ${uploads.filter((u) => u.status === 'COMPLETED').length}`);
      doc.text(`Failed: ${uploads.filter((u) => u.status === 'FAILED').length}`);
      doc.text(`Verified by auditor: ${uploads.filter((u) => u.auditStatus === 'verified').length}`);
      doc.text(`Flagged: ${uploads.filter((u) => u.auditStatus === 'flagged').length}`);
      doc.moveDown(1);

      // Data lineage table
      doc.fontSize(14).font('Helvetica-Bold').text('Data Lineage');
      doc.moveDown(0.5);

      for (const upload of uploads) {
        const ouName = orgUnitMap[upload.orgUnitId]?.name || upload.orgUnit || '—';
        const userName = `${upload.user?.firstName || ''} ${upload.user?.lastName || ''}`.trim();

        doc.fontSize(10).font('Helvetica-Bold').text(`${upload.fileName}`, { continued: false });
        doc.fontSize(9).font('Helvetica');
        doc.text(`  Type: ${upload.fileType === 'E1' ? 'Environmental' : 'Social'} | Org Unit: ${ouName} | By: ${userName} (${upload.user?.email || ''})`);
        doc.text(`  Status: ${upload.status} | Audit: ${upload.auditStatus || 'pending'} | Rows: ${upload.processedRows || 0}/${upload.totalRows || 0}`);
        doc.text(`  Uploaded: ${new Date(upload.createdAt).toLocaleString()} | Completed: ${upload.completedAt ? new Date(upload.completedAt).toLocaleString() : '—'}`);

        if (upload.storedFilePath) {
          doc.fillColor('#1560f5').text(`  Source file: ${baseUrl}/api/history/${upload.id}/download/0`, { link: `${baseUrl}/api/history/${upload.id}/download/0`, underline: true });
          doc.fillColor('#000');
        }

        if (upload.auditNote) {
          doc.text(`  Audit note: ${upload.auditNote}`);
        }

        doc.moveDown(0.5);

        if (doc.y > 700) { doc.addPage(); }
      }

      // Credit usage
      doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').text('Credit Usage Log');
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica');
      for (const txn of creditTxns.slice(0, 50)) {
        doc.text(`${new Date(txn.createdAt).toLocaleDateString()} | -${txn.creditsUsed} credits | ${txn.transactionType} | ${txn.description || ''} | By: ${txn.user?.firstName} ${txn.user?.lastName}`);
      }

      doc.moveDown(2);
      doc.fontSize(8).fillColor('#999').text(`This report was generated automatically by Triple I ESG Portal. All source files are accessible via the embedded links above.`, { align: 'center' });

      doc.end();
    } else {
      // DOCX export
      const rows = uploads.map((upload) => {
        const ouName = orgUnitMap[upload.orgUnitId]?.name || upload.orgUnit || '—';
        const userName = `${upload.user?.firstName || ''} ${upload.user?.lastName || ''}`.trim();
        const sourceLink = upload.storedFilePath ? `${baseUrl}/api/history/${upload.id}/download/0` : '';

        return new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: upload.fileType || '', size: 18 })] })], width: { size: 8, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ouName, size: 18 })] })], width: { size: 12, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: userName, size: 18 })] })], width: { size: 12, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: upload.fileName, size: 18 })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: upload.status, size: 18 })] })], width: { size: 10, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: upload.auditStatus || 'pending', size: 18 })] })], width: { size: 10, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${upload.processedRows || 0}`, size: 18 })] })], width: { size: 8, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: new Date(upload.createdAt).toLocaleDateString(), size: 18 })] })], width: { size: 10, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: sourceLink ? [new TextRun({ text: 'Download', size: 18, color: '1560f5', underline: {} })] : [new TextRun({ text: '—', size: 18 })] })], width: { size: 10, type: WidthType.PERCENTAGE } }),
          ],
        });
      });

      const headerRow = new TableRow({
        children: ['Type', 'Org Unit', 'User', 'File', 'Status', 'Audit', 'Rows', 'Date', 'Source'].map((h) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })],
            shading: { fill: 'f3f4f6' },
          })
        ),
      });

      const docx = new Document({
        sections: [{
          children: [
            new Paragraph({ children: [new TextRun({ text: 'ESG Data Lineage & Audit Trail', bold: true, size: 40 })], heading: HeadingLevel.TITLE }),
            new Paragraph({ children: [new TextRun({ text: `${company.name} | ${new Date().toLocaleDateString()} | ${company.esgStandard}`, size: 22 })] }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: `Total uploads: ${uploads.length} | Verified: ${uploads.filter((u) => u.auditStatus === 'verified').length} | Flagged: ${uploads.filter((u) => u.auditStatus === 'flagged').length}`, size: 20 })] }),
            new Paragraph({ text: '' }),
            new Table({ rows: [headerRow, ...rows] }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: 'Note: Source file links are clickable. Open them in a browser while logged into the ESG Portal to download original uploaded documents.', size: 16, color: '666666', italics: true })] }),
          ],
        }],
      });

      const buffer = await Packer.toBuffer(docx);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="ESG_Audit_Trail_${new Date().toISOString().split('T')[0]}.docx"`);
      res.send(buffer);
    }
  } catch (err) {
    console.error('Export error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
