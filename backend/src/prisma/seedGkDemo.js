'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// seedGkDemo.js — Green Key Readiness demo workspace with SYNTHETIC data
//
//   npm run db:seed:gk      (node src/prisma/seedGkDemo.js)
//
// Creates a consultant company (tier PROFESSIONAL, modules green_key + general)
// and two synthetic clients (spec §10.3): one single-site hotel and one group
// with three branches in Armenian cities. 14 months of monthly energy, water,
// waste and occupancy, readiness statuses, placeholder evidence PDFs, targets
// and actions (some rules fail on purpose), team, trainings, a certificate
// expiring soon and a few non-conformities. Every name is marked "(synthetic)".
//
// Idempotent: re-running replaces the demo company's Green Key data.
// Refuses to run when NODE_ENV=production.
//
// Env: GK_DEMO_EMAIL (default hotel-demo@triplei.local)
//      GK_DEMO_PASSWORD (required when the demo user is first created)
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');


const prisma = require('../config/prisma');
const { saveFile, getFilePath } = require('../utils/fileStore');
const { loadCriteria } = require('../services/gk/library');
const fs = require('fs');

const DEMO_COMPANY = 'Green Key Readiness Demo (synthetic)';
const DEFAULT_EMAIL = process.env.GK_DEMO_EMAIL || 'hotel-demo@triplei.local';

const now = new Date();
const addMonths = (d, n) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);

// Deterministic pseudo-random so re-runs produce the same numbers.
let seed = 42;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const jitter = (v, pct = 0.08) => Math.round(v * (1 + (rnd() * 2 - 1) * pct));

function last14Months() {
  const out = [];
  let y = now.getUTCFullYear(); let m = now.getUTCMonth(); // previous month (1-based = getUTCMonth())
  if (m === 0) { m = 12; y--; }
  for (let i = 0; i < 14; i++) { out.unshift({ year: y, month: m }); m--; if (m === 0) { m = 12; y--; } }
  return out;
}

function pdfBuffer(title, lines) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(16).text(title);
    doc.moveDown().fontSize(10).fillColor('#b45309').text('SYNTHETIC DEMO DOCUMENT — not a real record.');
    doc.moveDown().fillColor('#111111');
    for (const l of lines) doc.text(l);
    doc.end();
  });
}

/**
 * Create or refresh the demo workspace.  Used by the CLI below and by the
 * platform admin "Demo data" action (routes/modules.js).
 * @returns {{ company, email, created }}
 */
async function seedGkDemo({ email = DEFAULT_EMAIL, password = process.env.GK_DEMO_PASSWORD, log = console.log } = {}) {
  const DEMO_EMAIL = email;
  seed = 42; // same synthetic numbers on every run
  // ── Company, modules, user ────────────────────────────────────────────────
  let company = await prisma.company.findFirst({ where: { name: DEMO_COMPANY } });
  if (!company) {
    company = await prisma.company.create({ data: { name: DEMO_COMPANY, country: 'AM', industry: 'Hospitality consulting', companySize: '1-50', tier: 'PROFESSIONAL' } });
  } else if (company.tier !== 'PROFESSIONAL') {
    company = await prisma.company.update({ where: { id: company.id }, data: { tier: 'PROFESSIONAL' } });
  }
  for (const module of ['green_key', 'general']) {
    await prisma.companyModule.upsert({
      where: { companyId_module: { companyId: company.id, module } },
      update: { enabled: true, trialEndsAt: null },
      create: { companyId: company.id, module, enabled: true },
    });
  }
  let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    if (!password) throw new Error('A password is required to create the demo user.');
    user = await prisma.user.create({
      data: {
        email: DEMO_EMAIL, passwordHash: await bcrypt.hash(password, 12),
        firstName: 'Demo', lastName: 'Consultant', role: 'ADMIN', isActive: true, emailVerified: true, companyId: company.id,
      },
    });
  } else if (user.companyId !== company.id) {
    throw new Error(`${DEMO_EMAIL} belongs to another company; choose another email.`);
  } else if (password) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12), isActive: true } });
  }

  // ── Reset previous demo data (cascades) and stored evidence files ─────────
  const oldFiles = await prisma.gkEvidence.findMany({ where: { establishment: { client: { companyId: company.id } } }, select: { storedFilePath: true } });
  for (const f of oldFiles) { try { fs.unlinkSync(getFilePath(f.storedFilePath)); } catch { /* gone */ } }
  await prisma.gkClient.deleteMany({ where: { companyId: company.id } });

  const criteria = await loadCriteria(prisma, company.id, { version: '2026-2031' });
  const C = Object.fromEntries(criteria.map((c) => [c.code, c]));

  // ── Clients and establishments (spec §10.3) ───────────────────────────────
  const single = await prisma.gkClient.create({ data: { companyId: company.id, name: 'Sevan Lakeside Hotel (synthetic)', clientType: 'owner', country: 'AM' } });
  const group = await prisma.gkClient.create({ data: { companyId: company.id, name: 'Caucasus Stay Group (synthetic)', clientType: 'group', country: 'AM' } });
  const brand = await prisma.gkBrand.create({ data: { clientId: group.id, name: 'Caucasus Stay (synthetic)' } });

  const mk = (clientId, data) => prisma.gkEstablishment.create({ data: { clientId, country: 'AM', category: 'hotels_hostels', criteriaVersion: '2026-2031', ...data } });
  const sevan = await mk(single.id, { name: 'Sevan Lakeside Hotel (synthetic)', city: 'Sevan', rooms: 48, beds: 96, employees: 35, seasonal: false, facilities: { restaurant: true, animals: false, outsourcedHousekeeping: false, pool: true, meetingSpaceM2: 120 }, priorPeriods: 0 });
  const yerevan = await mk(group.id, { brandId: brand.id, name: 'Caucasus Stay Yerevan (synthetic)', city: 'Yerevan', rooms: 140, beds: 260, employees: 85, facilities: { restaurant: true, animals: false, outsourcedHousekeeping: true, pool: false, meetingSpaceM2: 450 }, priorPeriods: 2, transition: true });
  const gyumri = await mk(group.id, { brandId: brand.id, name: 'Caucasus Stay Gyumri (synthetic)', city: 'Gyumri', rooms: 60, beds: 110, employees: 28, facilities: { restaurant: true, meetingSpaceM2: 80 }, priorPeriods: 0 });
  const dilijan = await mk(group.id, { brandId: brand.id, name: 'Caucasus Stay Dilijan (synthetic)', city: 'Dilijan', rooms: 24, beds: 50, employees: 9, seasonal: true, facilities: { restaurant: false, animals: true, meetingSpaceM2: 0 }, priorPeriods: 0 });

  // ── 14 months of resource data and occupancy ──────────────────────────────
  const profiles = [
    { est: sevan, rooms: 48, elec: 22000, gas: 2600, water: 950, waste: 2400, recycle: 0.32, season: [0.35, 0.35, 0.45, 0.6, 0.8, 1, 1, 1, 0.85, 0.6, 0.4, 0.45] },
    { est: yerevan, rooms: 140, elec: 78000, gas: 7200, water: 2900, waste: 7600, recycle: 0.41, season: [0.6, 0.62, 0.7, 0.8, 0.88, 0.92, 0.95, 0.97, 0.9, 0.85, 0.7, 0.75] },
    { est: gyumri, rooms: 60, elec: 26000, gas: 3400, water: 1100, waste: 2500, recycle: 0.18, season: [0.4, 0.42, 0.5, 0.6, 0.7, 0.8, 0.85, 0.85, 0.75, 0.6, 0.45, 0.5] },
    { est: dilijan, rooms: 24, elec: 8500, gas: 0, water: 420, waste: 800, recycle: 0.5, season: [0.25, 0.25, 0.3, 0.45, 0.7, 0.95, 1, 1, 0.8, 0.5, 0.3, 0.35] },
  ];
  const months = last14Months();
  for (const p of profiles) {
    const res = []; const occ = [];
    for (const [i, { year, month }] of months.entries()) {
      const s = p.season[month - 1];
      const occupied = Math.round(p.rooms * 30 * s * 0.92);
      const guests = Math.round(occupied * 1.7);
      occ.push({ establishmentId: p.est.id, year, month, guestNights: guests, occupiedRooms: occupied });
      const heating = [1.6, 1.5, 1.2, 0.8, 0.4, 0.2, 0.1, 0.1, 0.3, 0.7, 1.2, 1.5][month - 1];
      res.push({ kind: 'energy', source: 'electricity', unit: 'kWh', quantity: jitter(p.elec * (0.6 + 0.4 * s)) });
      if (p.gas) res.push({ kind: 'energy', source: 'natural_gas', unit: 'm3', quantity: jitter(p.gas * heating + 300 * s) });
      else res.push({ kind: 'energy', source: 'biomass', unit: 'kg', quantity: jitter(1800 * heating) });
      const estimated = p.est === dilijan || (p.est === gyumri && i === 4);
      res.push({
        kind: 'water', source: p.est === dilijan ? 'well' : 'municipal', unit: 'm3', quantity: jitter(p.water * (0.4 + 0.6 * s)),
        estimated, estimationMethod: estimated ? (p.est === dilijan ? 'tank_refills' : 'occupancy_allocation') : null,
      });
      const waste = jitter(p.waste * (0.4 + 0.6 * s));
      res.push({ kind: 'waste', source: 'mixed', unit: 'kg', quantity: Math.round(waste * (1 - p.recycle)), disposal: 'landfill' });
      res.push({ kind: 'waste', source: 'paper', unit: 'kg', quantity: Math.round(waste * p.recycle * 0.4), disposal: 'recycled' });
      res.push({ kind: 'waste', source: 'plastic', unit: 'kg', quantity: Math.round(waste * p.recycle * 0.25), disposal: 'recycled' });
      res.push({ kind: 'waste', source: 'organic', unit: 'kg', quantity: Math.round(waste * p.recycle * 0.35), disposal: 'composted' });
      for (const r of res.splice(0)) await prisma.gkResourceRecord.create({ data: { ...r, establishmentId: p.est.id, year, month, notes: 'Synthetic demo value' } });
    }
    // Gyumri: one month of water missing on purpose (3.1 data gap).
    await prisma.gkOccupancy.createMany({ data: occ });
  }
  const gap = months[6];
  await prisma.gkResourceRecord.deleteMany({ where: { establishmentId: gyumri.id, kind: 'water', year: gap.year, month: gap.month } });

  // ── Readiness statuses ────────────────────────────────────────────────────
  const setStatus = (est, code, status, extra = {}) => C[code] && prisma.gkCriterionStatus.create({
    data: {
      establishmentId: est.id, criterionId: C[code].id, status, ...extra,
      comments: [{ kind: 'status', by: 'Demo Consultant', at: now.toISOString(), from: 'not_started', to: status, text: extra.naJustification ? `N/A: ${extra.naJustification}` : null }],
    },
  });
  const naIp = 'Synthetic assessment: no Indigenous Peoples identified within a 100 km radius.';
  await setStatus(yerevan, '1.1', 'conforms', { ownerName: 'Ani (synthetic)' });
  await setStatus(yerevan, '1.2', 'evidence_uploaded', { ownerName: 'General manager', dueDate: addDays(now, 14) });
  await setStatus(yerevan, '1.3', 'in_progress', { ownerName: 'General manager', dueDate: addDays(now, -10) });
  await setStatus(yerevan, '1.9', 'na', { naJustification: naIp });
  await setStatus(yerevan, '1.20', 'approved', { ownerName: 'HR' });
  await setStatus(yerevan, '3.1', 'conforms', { ownerName: 'Engineering' });
  await setStatus(yerevan, '2.5', 'conforms', { ownerName: 'Front office' });
  await setStatus(sevan, '1.1', 'in_progress', { ownerName: 'Owner', dueDate: addDays(now, 20) });
  await setStatus(sevan, '3.1', 'evidence_uploaded', { ownerName: 'Maintenance' });
  await setStatus(gyumri, '1.1', 'conforms', { ownerName: 'Hotel manager' });
  await setStatus(gyumri, '1.9', 'na', { naJustification: naIp });
  await setStatus(dilijan, '1.9', 'in_progress', { ownerName: 'Hotel manager', dueDate: addDays(now, 30) });

  // ── Evidence placeholders (tiny synthetic PDFs) ───────────────────────────
  const addEvidence = async (est, fileName, codes, extra = {}) => {
    const buf = await pdfBuffer(fileName.replace(/\.pdf$/, ''), [`Establishment: ${est.name}`, `Criteria: ${codes.join(', ')}`]);
    const stored = saveFile({ originalname: fileName, buffer: buf, size: buf.length, mimetype: 'application/pdf' }, company.id);
    const ev = await prisma.gkEvidence.create({
      data: { establishmentId: est.id, fileName, storedFilePath: stored.storedFilePath, mime: 'application/pdf', size: buf.length, uploadedById: user.id, description: 'Synthetic placeholder', ...extra },
    });
    for (const code of codes) if (C[code]) await prisma.gkEvidenceLink.create({ data: { evidenceId: ev.id, criterionId: C[code].id } });
  };
  await addEvidence(yerevan, 'strategic-targets-synthetic.pdf', ['1.2'], { documentDate: addMonths(now, -27) }); // too old → warning
  await addEvidence(yerevan, 'representative-appointment-synthetic.pdf', ['1.1'], { documentDate: addMonths(now, -6), status: 'approved', reviewedById: user.id, reviewedAt: now });
  await addEvidence(yerevan, 'water-meter-log-synthetic.pdf', ['3.1'], { documentDate: addMonths(now, -1), status: 'approved', reviewedById: user.id, reviewedAt: now });
  await addEvidence(yerevan, 'transport-info-synthetic.pdf', ['2.5'], { documentDate: addMonths(now, -8) }); // review reminder
  await addEvidence(sevan, 'water-bills-synthetic.pdf', ['3.1'], { documentDate: addMonths(now, -1) });
  await addEvidence(gyumri, 'well-permit-synthetic.pdf', ['3.1'], { documentDate: addMonths(now, -30), validUntil: addDays(now, -15) }); // expired

  // ── Targets and actions ───────────────────────────────────────────────────
  const y = now.getUTCFullYear();
  const target = (est, data) => prisma.gkTarget.create({ data: { establishmentId: est.id, documentDate: addMonths(now, -3), baselineYear: y - 1, ...data } });
  // Yerevan: 85 employees → 4 needed; only 3 (count rule fails on purpose).
  const ty1 = await target(yerevan, { area: 4, description: 'Reduce electricity per guest-night by 12 %', metric: 'kWh/guest-night', baselineValue: 31, targetValue: 27.3, targetYear: y + 3 });
  const ty2 = await target(yerevan, { area: 3, description: 'Reduce water per guest-night by 8 %', metric: 'L/guest-night', baselineValue: 520, targetValue: 478, targetYear: y + 3 });
  await target(yerevan, { area: 5, description: 'Raise recycling rate to 55 %', metric: '%', baselineValue: 41, targetValue: 55, targetYear: y + 2 });
  const tg1 = await target(gyumri, { area: 4, description: 'Switch common-area lighting to LED', metric: 'kWh', baselineValue: 26000, targetValue: 23000, targetYear: y + 2 });
  await target(gyumri, { area: 5, description: 'Separate organic waste in the kitchen', metric: '% recycled', baselineValue: 18, targetValue: 35, targetYear: y + 2 });
  await target(sevan, { area: 3, description: 'Install low-flow showerheads', metric: 'L/guest-night', baselineValue: null, targetValue: 400, targetYear: y + 8 }); // baseline + horizon fail

  const action = (est, data) => prisma.gkAction.create({ data: { establishmentId: est.id, status: 'planned', ...data } });
  await action(yerevan, { targetId: ty1.id, description: 'LED retrofit in corridors', owner: 'Chief engineer', measure: 'kWh per month', dueDate: addMonths(now, 4) });
  await action(yerevan, { targetId: ty1.id, description: 'BMS night set-back for HVAC', owner: 'Chief engineer', measure: 'kWh per month', dueDate: addMonths(now, 14) });
  await action(yerevan, { targetId: ty2.id, description: 'Aerators on all guest taps', owner: 'Housekeeping', measure: '', dueDate: addMonths(now, 6) }); // missing measure
  await action(yerevan, { targetId: ty2.id, description: 'Linen reuse card', owner: 'Front office', measure: 'Loads per month', dueDate: addMonths(now, -1), status: 'not_fulfilled' }); // no justification
  await action(gyumri, { targetId: tg1.id, description: 'Replace lobby lamps', owner: 'Maintenance', measure: 'kWh', dueDate: addMonths(now, 3), status: 'in_progress' });
  await action(gyumri, { targetId: tg1.id, description: 'Motion sensors in staff areas', owner: 'Maintenance', measure: 'kWh', dueDate: addMonths(now, 16) });

  // ── Team and training ─────────────────────────────────────────────────────
  const member = (est, data) => prisma.gkTeamMember.create({ data: { establishmentId: est.id, permanentStaff: true, ...data } });
  await member(yerevan, { role: 'representative', name: 'Former rep (synthetic)', position: 'Quality manager', fromDate: addMonths(now, -36), toDate: addMonths(now, -10) });
  await member(yerevan, { role: 'representative', name: 'Ani Hakobyan (synthetic)', position: 'Sustainability lead', email: 'ani@example.invalid', fromDate: addMonths(now, -10) });
  await member(yerevan, { role: 'substitute', name: 'Davit Sargsyan (synthetic)', position: 'Front office manager', fromDate: addMonths(now, -10) });
  await member(yerevan, { role: 'committee', name: 'Mariam Grigoryan (synthetic)', position: 'Housekeeping', fromDate: addMonths(now, -10) });
  await member(gyumri, { role: 'representative', name: 'Lilit Avetisyan (synthetic)', position: 'Hotel manager', fromDate: addMonths(now, -5) }); // no substitute
  await member(sevan, { role: 'representative', name: 'Aram Mkrtchyan (synthetic)', position: 'Owner', fromDate: addMonths(now, -4) });
  await member(sevan, { role: 'substitute', name: 'Seasonal assistant (synthetic)', permanentStaff: false, fromDate: addMonths(now, -4) }); // not permanent

  const training = (est, data) => prisma.gkTraining.create({ data: { establishmentId: est.id, durationMin: 45, format: 'in person', ...data } });
  for (const yr of [y - 1, y]) {
    await training(yerevan, { kind: 'briefing', topic: `Energy saving habits ${yr}`, date: new Date(Date.UTC(yr, 2, 12)), participants: 60 });
    await training(yerevan, { kind: 'briefing', topic: `Waste sorting refresher ${yr}`, date: new Date(Date.UTC(yr, 8, 18)), participants: 55 });
    await training(yerevan, { kind: 'general_training', topic: `Sustainability programme overview ${yr}`, date: new Date(Date.UTC(yr, 3, 5)), participants: 70 });
    await training(yerevan, { kind: 'departmental_training', topic: `Housekeeping chemicals dosing ${yr}`, department: 'Housekeeping', date: new Date(Date.UTC(yr, 4, 20)), participants: 18 });
  }
  await training(yerevan, { kind: 'new_hire', topic: 'Induction: programme basics', staffName: 'New receptionist (synthetic)', hireDate: addDays(now, -70), date: addDays(now, -60) });
  await training(yerevan, { kind: 'new_hire', topic: 'Induction: programme basics', staffName: 'New cook (synthetic)', hireDate: addDays(now, -90), date: addDays(now, -40) }); // late
  await training(gyumri, { kind: 'briefing', topic: 'Why we are applying', date: new Date(Date.UTC(y - 1, 5, 2)), participants: 20 }); // one briefing only
  await training(gyumri, { kind: 'general_training', topic: 'Programme overview', date: new Date(Date.UTC(y - 1, 6, 2)), participants: 22 });

  // ── Certificates and non-conformities ─────────────────────────────────────
  const certFrom = addMonths(now, -22); // expires in about 2 months
  const cert = await prisma.gkCertification.create({
    data: { establishmentId: yerevan.id, periodNumber: 2, criteriaVersion: '2022-2026', status: 'certified', auditDate: addDays(certFrom, -20), validFrom: certFrom, validTo: addMonths(certFrom, 24), surveillanceDate: addMonths(certFrom, 10), notes: 'Synthetic certificate' },
  });
  await prisma.gkCertification.create({ data: { establishmentId: gyumri.id, periodNumber: 1, criteriaVersion: '2026-2031', status: 'applied', notes: 'Synthetic application' } });
  const nc = (data) => prisma.gkNonConformity.create({ data: { establishmentId: yerevan.id, certificationId: cert.id, ...data } });
  await nc({ criterionCode: '1.2', description: 'Targets document older than two years (synthetic)', raisedAt: addDays(now, -75), deadline: addDays(now, -15), status: 'open' });
  await nc({ criterionCode: '1.21', description: 'New-hire training later than four weeks (synthetic)', raisedAt: addDays(now, -20), deadline: addDays(now, 40), status: 'open' });
  await nc({ criterionCode: '3.1', description: 'Estimated months without documented method (synthetic)', raisedAt: addDays(now, -200), deadline: addDays(now, -140), status: 'closed', closedAt: addDays(now, -150), closureNote: 'Method documented' });

  log(`Green Key demo ready: ${DEMO_COMPANY}\n  login: ${DEMO_EMAIL}\n  clients: 2, establishments: 4, months: ${months.length}`);
  return { company: company.name, email: DEMO_EMAIL };
}

module.exports = { seedGkDemo, DEMO_COMPANY };

if (require.main === module) {
  if (process.env.NODE_ENV === 'production') {
    console.error('seedGkDemo: refusing to run from the command line with NODE_ENV=production; use the platform admin "Demo data" action instead.');
    process.exit(1);
  }
  seedGkDemo()
    .catch((err) => { console.error('seedGkDemo failed:', err.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
