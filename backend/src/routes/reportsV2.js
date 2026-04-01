const router = require('express').Router();
const PDFDocument = require('pdfkit');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const { STANDARDS, validateReportData } = require('../services/standardRegistry');

router.use(authenticate);

// ─── List available standards ───────────────────────────────

router.get('/standards', (_, res) => {
  const list = Object.entries(STANDARDS).map(([key, s]) => ({
    key, name: s.name, framework: s.framework, version: s.version,
    topics: Object.entries(s.topics).map(([tk, t]) => ({ key: tk, code: t.code, name: t.name, pillar: t.pillar })),
  }));
  res.json(list);
});

// ─── Validate data for report ───────────────────────────────

router.post('/validate', async (req, res) => {
  try {
    const { year, standard, topics } = req.body;
    if (!year || !standard) return res.status(400).json({ error: 'Year and standard are required.' });

    const result = await validateReportData(prisma, req.user.companyId, parseInt(year), standard, topics);
    res.json(result);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Generate report v2 ────────────────────────────────────

router.post('/generate', async (req, res) => {
  try {
    const { year, standard, topics, language, format, generateWithoutMissing, companyDescription } = req.body;
    if (!year || !standard) return res.status(400).json({ error: 'Year and standard are required.' });

    const y = parseInt(year);
    const std = STANDARDS[standard];
    if (!std) return res.status(400).json({ error: `Unknown standard: ${standard}` });

    const lang = language || 'en';
    const fmt = format || 'pdf';
    const selectedTopics = topics || Object.keys(std.topics);

    // Validate data
    const validation = await validateReportData(prisma, req.user.companyId, y, standard, selectedTopics);

    // Log if generating without missing data
    if (generateWithoutMissing && validation.missing.length > 0) {
      logActivity(req.user.id, req.user.companyId, 'GENERATE_REPORT',
        `Generated ${standard} report for ${y} WITHOUT ${validation.missing.length} missing disclosures: ${validation.missing.map(m => m.code).join(', ')}`,
        { standard, year: y, missingDisclosures: validation.missing }, req.ip
      );
    }

    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });

    // Fetch all data for selected topics
    const data = {};
    for (const topicKey of selectedTopics) {
      if (topicKey === 'E1') {
        const [activities, targets, s1Comp] = await Promise.all([
          prisma.fE1EmissionActivityData.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.sBTiTarget.findMany({ where: { companyId: req.user.companyId } }),
          prisma.fS1WorkforceComposition.findMany({ where: { companyId: req.user.companyId, year: y } }),
        ]);
        const totalEmissions = activities.reduce((s, r) => s + (r.totalEmissions || 0), 0);
        const byScope = {};
        activities.forEach(r => { byScope[r.scope || 'Scope 3'] = (byScope[r.scope || 'Scope 3'] || 0) + (r.totalEmissions || 0); });
        const employees = s1Comp.reduce((s, r) => s + r.employeeCount, 0);
        data.E1 = { activities, targets, totalEmissions, byScope, employees, intensity: employees > 0 ? totalEmissions / employees : 0 };
      }
      if (topicKey === 'S1') {
        const [comp, div, train, turn, inj] = await Promise.all([
          prisma.fS1WorkforceComposition.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.fS1WorkforceDiversity.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.fS1EmployeeTraining.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.fS1EmployeeTurnover.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.fS1WorkplaceInjuries.findMany({ where: { companyId: req.user.companyId, year: y } }),
        ]);
        const totalEmployees = comp.reduce((s, r) => s + r.employeeCount, 0);
        const byGender = {};
        comp.forEach(r => { byGender[r.gender] = (byGender[r.gender] || 0) + r.employeeCount; });
        data.S1 = { comp, div, train, turn, inj, totalEmployees, byGender };
      }
    }

    // Generate PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${standard}_Report_${y}.pdf"`);
    doc.pipe(res);

    // ═══════════════ COVER PAGE ═══════════════
    doc.moveDown(6);
    doc.fontSize(32).font('Helvetica-Bold').text(company.name, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica').fillColor('#666').text(companyDescription || `${company.industry} | ${company.country}`, { align: 'center' });
    doc.moveDown(3);
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#003700').text('ESG Sustainability Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica').fillColor('#333').text(`Reporting Year: ${y}`, { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(13).fillColor('#666').text(`Prepared in accordance with: ${std.name}`, { align: 'center' });
    doc.text(`(${std.framework} ${std.version})`, { align: 'center' });
    doc.moveDown(5);
    doc.fontSize(10).fillColor('#999').text(`Generated on ${new Date().toLocaleDateString()} by Triple I ESG Portal`, { align: 'center' });

    // ═══════════════ TABLE OF CONTENTS ═══════════════
    doc.addPage();
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#003700').text('Table of Contents');
    doc.moveDown(1);

    let tocPage = 3;
    const tocEntries = [];
    tocEntries.push({ label: '1. About This Report', page: tocPage++ });
    if (std.crossCutting.length > 0) tocEntries.push({ label: '2. General Disclosures', page: tocPage++ });

    let sectionNum = 3;
    for (const topicKey of selectedTopics) {
      const topic = std.topics[topicKey];
      if (topic) {
        tocEntries.push({ label: `${sectionNum}. ${topic.code} — ${topic.name}`, page: tocPage });
        tocPage += 2; // estimate
        sectionNum++;
      }
    }
    tocEntries.push({ label: `${sectionNum}. Standard Index`, page: tocPage });

    doc.fontSize(11).font('Helvetica').fillColor('#333');
    for (const entry of tocEntries) {
      const dots = '.'.repeat(Math.max(3, 70 - entry.label.length));
      doc.text(`${entry.label} ${dots} ${entry.page}`, { indent: 20 });
      doc.moveDown(0.3);
    }

    // ═══════════════ ABOUT THIS REPORT ═══════════════
    doc.addPage();
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#003700').text('1. About This Report');
    doc.moveDown(1);
    doc.fontSize(11).font('Helvetica').fillColor('#333');
    doc.text(`This report has been prepared by ${company.name} in accordance with the ${std.name} (${std.framework} ${std.version}).`);
    doc.moveDown(0.5);
    doc.text(`Reporting period: January 1, ${y} to December 31, ${y}`);
    doc.text(`Company: ${company.name}`);
    doc.text(`Industry: ${company.industry}`);
    doc.text(`Headquarters: ${company.hqLocation || company.country}`);
    doc.text(`Company size: ${company.companySize}`);
    if (company.stockExchange) doc.text(`Stock exchange: ${company.stockExchange} (${company.tickerSymbol || ''})`);
    doc.moveDown(1);

    if (validation.missing.length > 0 && generateWithoutMissing) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#b45309').text('Data Coverage Notice');
      doc.font('Helvetica').fillColor('#333');
      doc.text(`The following ${validation.missing.length} disclosure(s) could not be fully populated due to missing data:`);
      doc.moveDown(0.3);
      for (const m of validation.missing) {
        doc.text(`  • ${m.code} — ${m.name}`, { indent: 10 });
      }
      doc.moveDown(1);
    }

    // ═══════════════ TOPIC SECTIONS ═══════════════
    sectionNum = std.crossCutting.length > 0 ? 3 : 2;

    for (const topicKey of selectedTopics) {
      const topic = std.topics[topicKey];
      if (!topic) continue;

      doc.addPage();
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#003700').text(`${sectionNum}. ${topic.code} — ${topic.name}`);
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#999').text(`Pillar: ${topic.pillar}`);
      doc.moveDown(1);

      // Write each disclosure
      for (const disc of topic.disclosures) {
        if (doc.y > 680) doc.addPage();

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(`${disc.code}: ${disc.name}`);
        doc.moveDown(0.3);

        const discData = validation.topics.find(t => t.key === topicKey)?.disclosures.find(d => d.code === disc.code);

        if (disc.type === 'metric' && discData?.hasData) {
          doc.fontSize(10).font('Helvetica').fillColor('#333');

          // Write metrics based on topic
          if (topicKey === 'E1' && data.E1) {
            if (disc.code.includes('E1-6') || disc.code.includes('305') || disc.code.includes('MT-b') || disc.code.includes('MET-1')) {
              doc.text(`Total GHG Emissions: ${(data.E1.totalEmissions).toFixed(4)} tCO2e`);
              Object.entries(data.E1.byScope).forEach(([scope, val]) => {
                doc.text(`  ${scope}: ${val.toFixed(4)} tCO2e`, { indent: 15 });
              });
              if (data.E1.employees > 0) {
                doc.text(`GHG Intensity: ${data.E1.intensity.toFixed(4)} tCO2e per employee`);
                doc.text(`Employee count: ${data.E1.employees}`);
              }
            } else if (disc.code.includes('E1-4') || disc.code.includes('MT-c') || disc.code.includes('MET-2')) {
              if (data.E1.targets.length > 0) {
                const t = data.E1.targets[0];
                doc.text(`Target: ${t.reductionPct}% reduction by ${t.targetYear} (base year: ${t.baseYear}, method: ${t.method})`);
                doc.text(`Scope: ${t.scope}`);
              } else {
                doc.text('No SBTi targets have been set.');
              }
            } else {
              doc.text(`${discData.count} data records available for this disclosure.`);
            }
          } else if (topicKey === 'S1' && data.S1) {
            if (disc.code.includes('S1-6') || disc.code.includes('405-1')) {
              doc.text(`Total employees: ${data.S1.totalEmployees}`);
              Object.entries(data.S1.byGender).forEach(([g, c]) => { doc.text(`  ${g}: ${c}`, { indent: 15 }); });
            } else if (disc.code.includes('S1-13') || disc.code.includes('404-1')) {
              const hours = data.S1.train.reduce((s, r) => s + r.trainingHours, 0);
              const trained = data.S1.train.reduce((s, r) => s + r.employeeCount, 0);
              doc.text(`Total training hours: ${hours.toLocaleString()}`);
              doc.text(`Employees trained: ${trained}`);
              doc.text(`Average hours per employee: ${trained > 0 ? (hours / trained).toFixed(1) : 'N/A'}`);
            } else if (disc.code.includes('S1-9') || disc.code.includes('S1-12')) {
              const disabled = data.S1.div.filter(r => r.disabilityStatus === 'Yes').reduce((s, r) => s + r.count, 0);
              doc.text(`Employees with disclosed disability: ${disabled}`);
              doc.text(`Disability rate: ${data.S1.totalEmployees > 0 ? ((disabled / data.S1.totalEmployees) * 100).toFixed(1) : 0}%`);
            } else if (disc.code.includes('S1-14') || disc.code.includes('403-9')) {
              const total = data.S1.inj.reduce((s, r) => s + r.count, 0);
              const fatal = data.S1.inj.filter(r => r.injuryStatus === 'Fatal').reduce((s, r) => s + r.count, 0);
              doc.text(`Total workplace incidents: ${total}`);
              doc.text(`Fatalities: ${fatal}`);
            } else if (disc.code.includes('401-1')) {
              const vol = data.S1.turn.filter(r => r.turnoverType === 'Voluntary').reduce((s, r) => s + r.count, 0);
              const invol = data.S1.turn.filter(r => r.turnoverType === 'Involuntary').reduce((s, r) => s + r.count, 0);
              doc.text(`Voluntary turnover: ${vol}`);
              doc.text(`Involuntary turnover: ${invol}`);
              doc.text(`Turnover rate: ${data.S1.totalEmployees > 0 ? (((vol + invol) / data.S1.totalEmployees) * 100).toFixed(1) : 0}%`);
            } else {
              doc.text(`${discData.count} data records available.`);
            }
          }
        } else if (disc.type === 'narrative') {
          doc.fontSize(10).font('Helvetica').fillColor('#666');
          doc.text(`[This section requires narrative disclosure. Please provide qualitative information about ${disc.name.toLowerCase()}.${generateWithoutMissing ? ' Section left for manual completion.' : ''}]`);
        } else {
          doc.fontSize(10).font('Helvetica').fillColor('#999');
          doc.text(`[No data available for this disclosure. ${generateWithoutMissing ? 'Omitted from quantitative reporting.' : ''}]`);
        }

        doc.moveDown(1);
      }

      sectionNum++;
    }

    // ═══════════════ STANDARD INDEX ═══════════════
    doc.addPage();
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#003700').text(`${sectionNum}. ${std.name} Index`);
    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica').fillColor('#333');

    // Header
    doc.font('Helvetica-Bold');
    doc.text('Code', 50, doc.y, { width: 80, continued: false });

    doc.moveDown(0.5);
    doc.font('Helvetica');

    for (const topicKey of selectedTopics) {
      const topic = std.topics[topicKey];
      if (!topic) continue;

      doc.font('Helvetica-Bold').fillColor('#003700').text(`${topic.code} — ${topic.name}`);
      doc.moveDown(0.3);
      doc.font('Helvetica').fillColor('#333');

      for (const disc of topic.disclosures) {
        if (doc.y > 730) doc.addPage();
        const discResult = validation.topics.find(t => t.key === topicKey)?.disclosures.find(d => d.code === disc.code);
        const status = discResult?.hasData ? '✓ Reported' : disc.type === 'narrative' ? '○ Narrative pending' : '✗ No data';
        doc.text(`  ${disc.code}  —  ${disc.name}  —  ${status}`);
      }
      doc.moveDown(0.5);
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#999').text(`This report was generated by Triple I ESG Portal on ${new Date().toISOString().split('T')[0]}.`, { align: 'center' });

    doc.end();

    logActivity(req.user.id, req.user.companyId, 'GENERATE_REPORT',
      `Generated ${standard} report for ${y} with topics: ${selectedTopics.join(', ')}`,
      { standard, year: y, topics: selectedTopics, format: fmt }, req.ip
    );

  } catch (err) {
    console.error('Report generation error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
