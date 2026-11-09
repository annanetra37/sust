'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// auditPack.js — simplified audit pack (GK-25): one XLSX per establishment.
// Sheets: Index, one per criteria area, Not applicable, Evidence, Resource data,
// Occupancy, KPIs, Targets, Actions, Team, Training, Certification.
// The ZIP of evidence files per criterion is out of scope for the MVP.
// ─────────────────────────────────────────────────────────────────────────────

const XLSX = require('xlsx');
const workspace = require('./workspace');
const kpis = require('./kpis');
const { libraryData } = require('./library');

const d = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');

async function buildAuditPack(prisma, companyId, est, now = new Date()) {
  const board = await workspace.loadBoard(prisma, companyId, est, now);
  const { data, checks } = await workspace.loadChecks(prisma, est, board.requirement, now);
  const ncs = await prisma.gkNonConformity.findMany({ where: { establishmentId: est.id }, orderBy: { raisedAt: 'asc' } });
  const k = kpis.computeKpis(est, data.resources, data.occupancy);
  const areas = libraryData().areas;
  const wb = XLSX.utils.book_new();
  const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));

  const s = board.summary;
  add('Index', [
    ['Green Key Readiness — audit pack'],
    ['Establishment', est.name],
    ['Client', est.client ? est.client.name : ''],
    ['Country / city', `${est.country}${est.city ? ` / ${est.city}` : ''}`],
    ['Criteria version', est.criteriaVersion],
    ['Generated', now.toISOString()],
    [],
    ['Readiness %', s.readinessPct],
    ['Applicable criteria', s.applicable],
    ['Imperative gaps', s.imperativeGaps],
    ['Certification period', board.requirement.period],
    ['Guideline % required', board.requirement.requiredPct],
    ['Guideline % achieved', s.guideline.achievedPct],
    ['Transition rule applied', board.requirement.transitionActive ? 'yes' : 'no'],
    ['Dispensation recorded', board.requirement.dispensation ? 'yes' : 'no'],
    [],
    ['Notes'],
    ['Criteria titles are Triple i paraphrases, not the official criteria text.'],
    ['Evidence files are listed by name and date; the ZIP of files is not included in this version.'],
    ['Green Key is a programme of the Foundation for Environmental Education (FEE). Triple i is not affiliated with or endorsed by FEE.'],
  ]);

  const header = ['Code', 'Title', 'Effective type', 'Status', 'N/A justification', 'Owner', 'Due date', 'Evidence (file — document date — status)', 'Notes'];
  for (const a of areas) {
    const rows = board.rows.filter((r) => r.area === a.area);
    if (!rows.length) continue;
    add(`${a.area} ${a.name}`, [header, ...rows.map((r) => [
      r.code, r.title, r.effectiveType, r.status, r.naJustification || '', r.ownerName || '', d(r.dueDate),
      r.evidence.map((e) => `${e.fileName} — ${d(e.documentDate) || 'undated'} — ${e.status}`).join('\n'),
      r.notes.join(' '),
    ])]);
  }
  add('Not applicable', [['Code', 'Title', 'Reason (engine)'], ...board.notApplicable.map((r) => [r.code, r.title, r.reasons.join(' ')])]);
  add('Evidence', [['File', 'Description', 'Document date', 'Valid until', 'Status', 'Criteria', 'Warnings'],
    ...board.evidence.map((e) => [e.fileName, e.description || '', d(e.documentDate), d(e.validUntil), e.status, e.criteria.map((c) => c.code).join(', '), e.warnings.map((w) => w.text).join(' ')])]);
  add('Resource data', [['Year', 'Month', 'Kind', 'Source / stream', 'Quantity', 'Unit', 'Disposal', 'Estimated', 'Estimation method', 'Notes'],
    ...data.resources.map((r) => [r.year, r.month, r.kind, r.source, r.quantity, r.unit, r.disposal || '', r.estimated ? 'yes' : 'no', r.estimationMethod || '', r.notes || ''])]);
  add('Occupancy', [['Year', 'Month', 'Guest nights', 'Occupied room-nights'], ...data.occupancy.map((o) => [o.year, o.month, o.guestNights, o.occupiedRooms])]);
  add('Data coverage', [['Resource', 'Rule', 'Months recorded', 'Required', 'Pass', 'Missing months'],
    ...Object.entries(checks.coverage).map(([kind, c]) => [kind, c.rule, c.recorded, c.required, c.pass ? 'yes' : 'no', c.missing.join(' ')])]);
  const i = k.intensities || {};
  add('KPIs', [
    ['Period', k.period ? `${k.period.from} to ${k.period.to}` : 'no data'],
    ['Method', 'Scope 1–2 location-based (shared Triple i engine); market-based not included'],
    ['Energy kWh', k.totals?.kwh], ['Scope 1 kgCO2e', k.totals?.scope1KgCo2e], ['Scope 2 kgCO2e', k.totals?.scope2KgCo2e],
    ['Water m³', k.totals?.waterM3], ['Waste kg', k.totals?.wasteKg], ['Guest nights', k.totals?.guestNights], ['Occupied room-nights', k.totals?.occupiedRooms],
    ['kWh per guest-night', i.kwhPerGuestNight], ['Litres water per guest-night', i.litresPerGuestNight], ['kg waste per guest-night', i.wasteKgPerGuestNight],
    ['kgCO2e per occupied room', i.kgCo2ePerOccupiedRoom], ['Recycling rate %', i.recyclingRatePct],
    [], ['Warnings'], ...k.warnings.map((w) => [w]),
    [], ['Month', 'kWh', 'kgCO2e', 'Water m³', 'Waste kg', 'Guest nights', 'Occupied room-nights'],
    ...k.monthly.map((m) => [m.month, m.kwh, m.kgCo2e, m.waterM3, m.wasteKg, m.guestNights, m.occupiedRooms]),
  ]);
  const targetName = new Map(data.targets.map((t) => [t.id, t.description]));
  add('Targets', [['Area', 'Target', 'Metric', 'Baseline year', 'Baseline', 'Target value', 'Target year', 'Document date'],
    ...data.targets.map((t) => [t.area, t.description, t.metric || '', t.baselineYear || '', t.baselineValue ?? '', t.targetValue ?? '', t.targetYear || '', d(t.documentDate)]),
    [], ['Rule check (1.2)', 'Result', 'Detail'], ...checks.targets.rules.map((r) => [r.key, r.status, r.detail])]);
  add('Actions', [['Action', 'Target', 'Owner', 'Measure', 'Due date', 'Status', 'Justification', 'Next step'],
    ...data.actions.map((a) => [a.description, targetName.get(a.targetId) || '', a.owner || '', a.measure || '', d(a.dueDate), a.status, a.justification || '', a.nextStep || '']),
    [], ['Rule check (1.3)', 'Result', 'Detail'], ...checks.actions.rules.map((r) => [r.key, r.status, r.detail])]);
  add('Team', [['Role', 'Name', 'Position', 'Email', 'Permanent staff', 'From', 'To'],
    ...data.team.map((m) => [m.role, m.name, m.position || '', m.email || '', m.permanentStaff ? 'yes' : 'no', d(m.fromDate), d(m.toDate)]),
    [], ['Rule check (1.1)', 'Result', 'Detail'], ...checks.team.rules.map((r) => [r.key, r.status, r.detail])]);
  add('Training', [['Kind', 'Topic', 'Department', 'Date', 'Minutes', 'Format', 'Participants', 'Staff (new hire)', 'Hire date'],
    ...data.trainings.map((t) => [t.kind, t.topic, t.department || '', d(t.date), t.durationMin ?? '', t.format || '', t.participants ?? '', t.staffName || '', d(t.hireDate)]),
    [], [`Rule check (1.20/1.21) ${checks.training.year}`, 'Result', 'Detail'], ...checks.training.rules.map((r) => [r.key, r.status, r.detail]),
    [], [`Rule check (1.20/1.21) ${checks.trainingLastYear.year}`, 'Result', 'Detail'], ...checks.trainingLastYear.rules.map((r) => [r.key, r.status, r.detail])]);
  add('Certification', [['Period', 'Version', 'Status', 'Audit date', 'Valid from', 'Valid to', 'Surveillance date'],
    ...board.certifications.map((c) => [c.periodNumber, c.criteriaVersion, c.status, d(c.auditDate), d(c.validFrom), d(c.validTo), d(c.surveillanceDate)]),
    [], ['Non-conformity', 'Criterion', 'Raised', 'Deadline', 'Status', 'Closed', 'Closure note'],
    ...ncs.map((n) => [n.description, n.criterionCode || '', d(n.raisedAt), d(n.deadline), n.status, d(n.closedAt), n.closureNote || ''])]);

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { buildAuditPack };
