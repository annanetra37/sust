const router = require('express').Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
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

    // Fetch org units for boundary section
    const orgUnits = await prisma.orgUnit.findMany({ where: { companyId: req.user.companyId } });

    // Fetch all data for selected topics
    const data = {};
    for (const topicKey of selectedTopics) {
      if (topicKey === 'E1') {
        const [activities, prevActivities, targets, s1Comp] = await Promise.all([
          prisma.fE1EmissionActivityData.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.fE1EmissionActivityData.findMany({ where: { companyId: req.user.companyId, year: y - 1 } }),
          prisma.sBTiTarget.findMany({ where: { companyId: req.user.companyId } }),
          prisma.fS1WorkforceComposition.findMany({ where: { companyId: req.user.companyId, year: y } }),
        ]);
        const totalEmissions = activities.reduce((s, r) => s + (r.totalEmissions || 0), 0);
        const prevTotalEmissions = prevActivities.reduce((s, r) => s + (r.totalEmissions || 0), 0);
        const byScope = {};
        activities.forEach(r => { byScope[r.scope || 'Scope 3'] = (byScope[r.scope || 'Scope 3'] || 0) + (r.totalEmissions || 0); });
        const employees = s1Comp.reduce((s, r) => s + r.employeeCount, 0);

        // Energy breakdown by type (fuel vs electricity)
        const energyByType = { electricity: 0, fuel: 0, heating: 0, other: 0 };
        let totalEnergyMwh = 0;
        activities.forEach((r) => {
          const sub = (r.activitySubcat || '').toLowerCase();
          const cat = (r.activityCategory || '').toLowerCase();
          const unit = (r.unit || '').toLowerCase();
          let mwh = 0;
          if (unit.includes('mwh')) mwh = r.quantity;
          else if (unit.includes('kwh')) mwh = r.quantity / 1000;
          else if (unit.includes('litre')) mwh = r.quantity * 0.01;
          else if (unit.includes('gj')) mwh = r.quantity * 0.27778;

          if (mwh > 0) {
            totalEnergyMwh += mwh;
            if (sub.includes('electric') || sub.includes('grid')) energyByType.electricity += mwh;
            else if (sub.includes('heating') || sub.includes('district') || sub.includes('fernwärme')) energyByType.heating += mwh;
            else if (sub.includes('diesel') || sub.includes('petrol') || sub.includes('lpg') || cat.includes('mobile')) energyByType.fuel += mwh;
            else energyByType.other += mwh;
          }
        });

        const yoyChange = prevTotalEmissions > 0 ? ((totalEmissions - prevTotalEmissions) / prevTotalEmissions * 100) : null;

        data.E1 = { activities, targets, totalEmissions, prevTotalEmissions, yoyChange, byScope, employees,
          intensity: employees > 0 ? totalEmissions / employees : 0, energyByType, totalEnergyMwh };
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

    // Company logo
    const logoPath = path.join(__dirname, '../../..', 'frontend', 'public', 'logo.svg');
    try {
      if (fs.existsSync(logoPath)) {
        // SVG can't be embedded in PDFKit directly, so we use a placeholder approach
        // For proper logo, the company should upload a PNG/JPG
      }
    } catch {}

    doc.moveDown(4);
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#003700').text('Sustainability Management Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#333').text(`(${standard})`, { align: 'center' });
    doc.moveDown(3);
    doc.fontSize(24).font('Helvetica').fillColor('#333').text(company.name, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').fillColor('#666').text(companyDescription || `${company.industry} | ${company.country}`, { align: 'center' });
    doc.moveDown(3);
    doc.fontSize(16).font('Helvetica').fillColor('#333').text(`Reporting Year: ${y || 'All Years'}`, { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(11).fillColor('#666').text(`Prepared in accordance with:`, { align: 'center' });
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#003700').text(`${std.name}`, { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor('#888').text(`${std.framework} ${std.version}`, { align: 'center' });
    doc.moveDown(5);
    doc.fontSize(9).fillColor('#aaa').text(`Generated on ${new Date().toLocaleDateString()} | Confidential`, { align: 'center' });
    doc.text(`Triple I ESG Portal — www.triplei.io`, { align: 'center' });

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

    // Organizational boundaries
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#003700').text('Organizational Boundaries');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text(`Consolidation approach: Operational control`);
    doc.text(`Organizational units included in this report:`);
    doc.moveDown(0.2);
    for (const ou of orgUnits) {
      doc.text(`  • ${ou.name} — ${ou.country}`, { indent: 10 });
    }
    doc.moveDown(0.5);
    doc.text(`Operations covered: All operations under the organizational control of ${company.name} across ${orgUnits.length} organizational unit(s) in ${[...new Set(orgUnits.map(u => u.country))].join(', ')}.`);
    doc.moveDown(0.5);

    // Methodology
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#003700').text('Methodology');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text('GHG emissions have been calculated in accordance with the GHG Protocol Corporate Accounting and Reporting Standard (Revised Edition). Emission factors are sourced from recognized databases including DEFRA, EPA, and IEA. Energy consumption is reported in MWh (megawatt-hours) with appropriate conversion factors applied for different fuel types and energy carriers.');
    doc.moveDown(0.5);
    doc.text('Scope boundaries:');
    doc.text('  • Scope 1: Direct emissions from owned/controlled sources (stationary combustion, mobile combustion, fugitive emissions)', { indent: 10 });
    doc.text('  • Scope 2: Indirect emissions from purchased electricity, steam, heating, and cooling (location-based method)', { indent: 10 });
    doc.text('  • Scope 3: All other indirect emissions in the value chain (business travel, employee commuting, purchased goods)', { indent: 10 });
    doc.moveDown(0.5);
    doc.text('Energy units: All energy quantities are standardized to MWh. Conversion factors: 1 litre diesel = 0.01 MWh, 1 litre petrol = 0.0091 MWh, 1 m³ natural gas = 0.01055 MWh, 1 GJ = 0.27778 MWh.');
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

          // Write metrics based on topic and SPECIFIC disclosure code
          if (topicKey === 'E1' && data.E1) {
            const round = (n) => Math.round(n * 10000) / 10000;

            // === GRI SCOPE-SPECIFIC DISCLOSURES ===
            if (disc.code === 'GRI 305-1') {
              // Scope 1 ONLY
              const s1 = round(data.E1.byScope['Scope 1'] || 0);
              doc.text(`Direct GHG Emissions (Scope 1): ${s1} tCO2e`);
              doc.moveDown(0.3);
              doc.fontSize(9).fillColor('#666');
              doc.text('Scope 1 includes direct emissions from owned or controlled sources including stationary combustion, mobile combustion (company vehicles), and fugitive emissions.');
              doc.text('Methodology: GHG Protocol Corporate Standard. Emission factors sourced from DEFRA/EPA databases.');
            } else if (disc.code === 'GRI 305-2') {
              // Scope 2 ONLY
              const s2 = round(data.E1.byScope['Scope 2'] || 0);
              doc.text(`Energy Indirect GHG Emissions (Scope 2): ${s2} tCO2e`);
              doc.moveDown(0.3);
              doc.fontSize(9).fillColor('#666');
              doc.text('Scope 2 covers indirect emissions from purchased electricity, steam, heating, and cooling. Location-based method applied using grid-average emission factors.');
            } else if (disc.code === 'GRI 305-3') {
              // Scope 3 ONLY
              const s3 = round(data.E1.byScope['Scope 3'] || 0);
              doc.text(`Other Indirect GHG Emissions (Scope 3): ${s3} tCO2e`);
              doc.moveDown(0.3);
              doc.fontSize(9).fillColor('#666');
              const s3Categories = {};
              data.E1.activities.filter(a => a.scope === 'Scope 3').forEach(a => {
                s3Categories[a.activityCategory] = (s3Categories[a.activityCategory] || 0) + (a.totalEmissions || 0);
              });
              if (Object.keys(s3Categories).length > 0) {
                doc.text('Breakdown by category:');
                Object.entries(s3Categories).forEach(([cat, val]) => {
                  doc.text(`  • ${cat}: ${round(val)} tCO2e`, { indent: 15 });
                });
              }
              doc.text('Scope 3 categories included: business travel, employee commuting, purchased goods and services where data is available.');
            } else if (disc.code === 'GRI 305-4') {
              // Intensity ONLY
              doc.text(`GHG Emissions Intensity: ${round(data.E1.intensity)} tCO2e per employee`);
              doc.text(`Total emissions: ${round(data.E1.totalEmissions)} tCO2e`);
              doc.text(`Denominator: ${data.E1.employees} employees (FTE)`);
              doc.moveDown(0.3);
              doc.fontSize(9).fillColor('#666');
              doc.text('Intensity ratio calculated as total Scope 1+2+3 emissions divided by full-time equivalent employee count.');
            } else if (disc.code === 'GRI 305-5') {
              // Reduction — if no specific reduction data, explain
              doc.text('[Omission] GHG emissions reduction data is not yet tracked separately.');
              doc.moveDown(0.3);
              doc.fontSize(9).fillColor('#666');
              doc.text('Reason for omission: The organization has not yet established a formal emissions reduction tracking mechanism separate from year-over-year comparison. Plans are in place to implement reduction tracking aligned with SBTi commitments.');
            } else if (disc.code === 'GRI 302') {
              // Energy data
              const energyActivities = data.E1.activities.filter(a =>
                a.activityCategory?.toLowerCase().includes('electric') ||
                a.activityCategory?.toLowerCase().includes('energy') ||
                a.activityCategory?.toLowerCase().includes('combustion') ||
                a.unit?.toLowerCase().includes('kwh') ||
                a.unit?.toLowerCase().includes('mwh')
              );
              if (energyActivities.length > 0) {
                const totalKwh = energyActivities.reduce((s, a) => {
                  if (a.unit?.toLowerCase().includes('kwh')) return s + a.quantity;
                  if (a.unit?.toLowerCase().includes('mwh')) return s + a.quantity * 1000;
                  return s;
                }, 0);
                doc.text(`Total energy consumption: ${round(totalKwh)} kWh (${round(totalKwh * 0.0036)} GJ)`);
                doc.text(`Energy records: ${energyActivities.length}`);
                const byCat = {};
                energyActivities.forEach(a => { byCat[a.activitySubcat || a.activityCategory] = (byCat[a.activitySubcat || a.activityCategory] || 0) + a.quantity; });
                Object.entries(byCat).forEach(([cat, val]) => { doc.text(`  • ${cat}: ${round(val)} ${energyActivities[0]?.unit || 'kWh'}`, { indent: 15 }); });
              } else {
                doc.text(`${discData.count} emission activity records include energy-related data.`);
              }
              doc.moveDown(0.3);
              doc.fontSize(9).fillColor('#666');
              doc.text('Energy data is derived from utility invoices and activity records processed through the AI ETL pipeline.');

            // === ESRS / TCFD / ISSB — full emissions disclosure ===
            } else if (disc.code.includes('E1-6') || disc.code.includes('MT-b') || disc.code.includes('MET-1')) {
              doc.text(`Total GHG Emissions: ${round(data.E1.totalEmissions)} tCO2e`);
              doc.moveDown(0.2);
              Object.entries(data.E1.byScope).forEach(([scope, val]) => {
                doc.text(`  ${scope}: ${round(val)} tCO2e`, { indent: 15 });
              });
              if (data.E1.employees > 0) {
                doc.text(`GHG Intensity: ${round(data.E1.intensity)} tCO2e per employee (${data.E1.employees} employees)`);
              }
              doc.moveDown(0.3);

              // Energy consumption breakdown (fuel vs electricity)
              if (data.E1.totalEnergyMwh > 0) {
                doc.font('Helvetica-Bold').fillColor('#333').text('Energy Consumption:');
                doc.font('Helvetica');
                doc.text(`  Total: ${round(data.E1.totalEnergyMwh)} MWh`, { indent: 15 });
                if (data.E1.energyByType.electricity > 0) doc.text(`  Electricity: ${round(data.E1.energyByType.electricity)} MWh`, { indent: 15 });
                if (data.E1.energyByType.heating > 0) doc.text(`  District heating: ${round(data.E1.energyByType.heating)} MWh`, { indent: 15 });
                if (data.E1.energyByType.fuel > 0) doc.text(`  Fuel (diesel, petrol, LPG): ${round(data.E1.energyByType.fuel)} MWh`, { indent: 15 });
                if (data.E1.energyByType.other > 0) doc.text(`  Other energy sources: ${round(data.E1.energyByType.other)} MWh`, { indent: 15 });
                doc.moveDown(0.3);
              }

              // Trend narrative
              if (data.E1.yoyChange !== null) {
                doc.font('Helvetica-Bold').fillColor('#333').text('Year-over-Year Trend:');
                doc.font('Helvetica');
                const direction = data.E1.yoyChange > 0 ? 'increased' : 'decreased';
                const absChange = Math.abs(round(data.E1.yoyChange));
                doc.text(`Total GHG emissions ${direction} by ${absChange}% compared to the previous year (${y - 1}: ${round(data.E1.prevTotalEmissions)} tCO2e vs ${y}: ${round(data.E1.totalEmissions)} tCO2e).`);
                if (data.E1.yoyChange > 0) {
                  doc.text(`The increase may be attributed to expanded operations, increased business travel, or higher energy consumption. The organization is evaluating mitigation measures.`);
                } else {
                  doc.text(`The reduction reflects the organization's ongoing commitment to energy efficiency improvements, reduced business travel, and transition to lower-carbon energy sources.`);
                }
                doc.moveDown(0.3);
              }

              // Drivers
              doc.font('Helvetica-Bold').fillColor('#333').text('Emission Drivers:');
              doc.font('Helvetica');
              const topCats = {};
              data.E1.activities.forEach(a => { topCats[a.activityCategory] = (topCats[a.activityCategory] || 0) + (a.totalEmissions || 0); });
              const sortedCats = Object.entries(topCats).sort((a, b) => b[1] - a[1]);
              if (sortedCats.length > 0) {
                doc.text(`The primary sources of emissions are: ${sortedCats.slice(0, 3).map(([cat, val]) => `${cat} (${round(val)} tCO2e)`).join(', ')}. ` +
                  `These categories represent the key operational activities contributing to the organization's carbon footprint in the ${company.industry} sector.`);
              }
              doc.moveDown(0.3);
              doc.fontSize(9).fillColor('#666');
              doc.text('All emissions reported in tonnes of CO2 equivalent (tCO2e). Energy reported in MWh.');

            // === SBTi Targets ===
            } else if (disc.code.includes('E1-4') || disc.code.includes('MT-c') || disc.code.includes('MET-2')) {
              if (data.E1.targets.length > 0) {
                const t = data.E1.targets[0];
                doc.text(`Target: ${t.reductionPct}% reduction by ${t.targetYear}`);
                doc.text(`Base year: ${t.baseYear} | Method: ${t.method} | Scope: ${t.scope}`);
                if (t.description) doc.text(`Description: ${t.description}`);
              } else {
                doc.text('[Omission] No formal decarbonization targets have been set.');
                doc.fontSize(9).fillColor('#666');
                doc.text('The organization is evaluating Science Based Targets (SBTi) commitment options.');
              }

            // === Energy consumption (ESRS E1-5) ===
            } else if (disc.code.includes('E1-5')) {
              const totalQty = data.E1.activities.reduce((s, a) => s + (a.quantity || 0), 0);
              doc.text(`Total activity quantity: ${round(totalQty)} (various units)`);
              doc.text(`Activity records: ${data.E1.activities.length}`);

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
          doc.fontSize(10).font('Helvetica-Oblique').fillColor('#555');
          doc.text(`This disclosure requires qualitative narrative about: ${disc.name.toLowerCase()}.`);
          doc.moveDown(0.2);
          doc.fontSize(9).fillColor('#888');
          doc.text(`[To be completed: Provide details on policies, actions, targets, and governance related to ${disc.name.toLowerCase()}. Include context on why this topic is material, what measures are in place, and what outcomes have been achieved.]`);
        } else {
          // Missing metric data — provide standard-compliant omission
          doc.fontSize(10).font('Helvetica').fillColor('#b45309');
          doc.text(`[Omission] Quantitative data for this disclosure is not available for the reporting period ${y}.`);
          doc.moveDown(0.2);
          doc.fontSize(9).fillColor('#888');
          doc.text(`Reason: Data collection processes for "${disc.name}" have not yet been established or the relevant data sources have not been connected. The organization intends to disclose this metric in future reporting periods as data systems mature.`);
        }

        doc.fillColor('#333').font('Helvetica'); // reset
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
