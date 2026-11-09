'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// workspace.js — loads one establishment's data and runs the pure engines.
// Used by the establishment endpoints, the portfolio and the audit pack.
// ─────────────────────────────────────────────────────────────────────────────

const applicability = require('./applicability');
const readiness = require('./readiness');
const rules = require('./rules');
const lifecycle = require('./lifecycle');
const kpis = require('./kpis');
const { loadCriteria } = require('./library');

const profileOf = (est) => ({
  employees: est.employees, seasonal: est.seasonal, country: est.country, facilities: est.facilities || {},
});

/** Applicability for an establishment (optionally with a modified profile). */
async function computeApplicability(prisma, companyId, est, profile) {
  const criteria = await loadCriteria(prisma, companyId, { version: est.criteriaVersion, category: est.category });
  return { criteria, appl: applicability.computeList(criteria, profile || profileOf(est)) };
}

/** Full readiness board for one establishment. */
async function loadBoard(prisma, companyId, est, now = new Date()) {
  const { criteria, appl } = await computeApplicability(prisma, companyId, est);
  const [statuses, evidence, certifications] = await Promise.all([
    prisma.gkCriterionStatus.findMany({ where: { establishmentId: est.id } }),
    prisma.gkEvidence.findMany({ where: { establishmentId: est.id }, include: { links: true }, orderBy: { createdAt: 'desc' } }),
    prisma.gkCertification.findMany({ where: { establishmentId: est.id } }),
  ]);
  const criteriaById = new Map(criteria.map((c) => [c.id, c]));
  const statusBy = new Map(statuses.map((s) => [s.criterionId, s]));
  const evidenceBy = new Map();
  const evidenceOut = evidence.map((e) => {
    const linked = e.links.map((l) => criteriaById.get(l.criterionId)).filter(Boolean);
    const out = { ...e, criteria: linked.map((c) => ({ id: c.id, code: c.code, title: c.title })), warnings: readiness.evidenceWarnings(e, linked, now) };
    for (const l of e.links) {
      if (!evidenceBy.has(l.criterionId)) evidenceBy.set(l.criterionId, []);
      evidenceBy.get(l.criterionId).push(out);
    }
    return out;
  });
  const requirement = rules.guidelineRequirement(est, certifications, now);
  const board = readiness.buildBoard(appl, criteriaById, statusBy, evidenceBy, requirement, now);
  return { ...board, requirement, evidence: evidenceOut, certifications, criteria };
}

/** Rule checks for targets/actions/team/training + data coverage. */
async function loadChecks(prisma, est, requirement, now = new Date()) {
  const [targets, actions, team, trainings, resources, occupancy] = await Promise.all([
    prisma.gkTarget.findMany({ where: { establishmentId: est.id }, orderBy: { createdAt: 'asc' } }),
    prisma.gkAction.findMany({ where: { establishmentId: est.id }, orderBy: { dueDate: 'asc' } }),
    prisma.gkTeamMember.findMany({ where: { establishmentId: est.id }, orderBy: { fromDate: 'desc' } }),
    prisma.gkTraining.findMany({ where: { establishmentId: est.id }, orderBy: { date: 'desc' } }),
    prisma.gkResourceRecord.findMany({ where: { establishmentId: est.id }, orderBy: [{ year: 'asc' }, { month: 'asc' }] }),
    prisma.gkOccupancy.findMany({ where: { establishmentId: est.id }, orderBy: [{ year: 'asc' }, { month: 'asc' }] }),
  ]);
  const coverage = {};
  for (const kind of ['water', 'energy', 'waste']) coverage[kind] = rules.dataCoverage(resources.filter((r) => r.kind === kind), requirement, now);
  coverage.occupancy = rules.dataCoverage(occupancy, requirement, now);
  return {
    data: { targets, actions, team, trainings, resources, occupancy },
    checks: {
      targets: rules.checkTargets(targets, est, now),
      actions: rules.checkActions(actions, est, {}),
      team: rules.checkTeam(team, now),
      training: rules.checkTraining(trainings, est, { now }),
      trainingLastYear: rules.checkTraining(trainings, est, { now, year: now.getUTCFullYear() - 1 }),
      coverage,
    },
  };
}

function certificatesWithTimers(certs, now = new Date()) {
  return certs
    .map((c) => ({ ...c, timers: lifecycle.certificateTimers(c, now) }))
    .sort((a, b) => (b.periodNumber - a.periodNumber) || (new Date(b.createdAt) - new Date(a.createdAt)));
}

/** Overview bundle: board summary, rule checks, KPIs, certificate timeline, alerts. */
async function overview(prisma, companyId, est, now = new Date()) {
  const board = await loadBoard(prisma, companyId, est, now);
  const { data, checks } = await loadChecks(prisma, est, board.requirement, now);
  const ncs = await prisma.gkNonConformity.findMany({ where: { establishmentId: est.id }, orderBy: { deadline: 'asc' } });
  const certs = certificatesWithTimers(board.certifications, now);
  const k = kpis.computeKpis(est, data.resources, data.occupancy);
  const nc = lifecycle.ncSummary(ncs, now);
  const alerts = buildAlerts({ est, board, checks, certs, ncs, nc, now });
  const lastEntry = [...data.resources, ...data.occupancy].reduce((m, r) => (!m || new Date(r.createdAt || 0) > m ? new Date(r.createdAt || 0) : m), null);
  const tasks = board.rows
    .filter((r) => !r.done && r.dueDate && new Date(r.dueDate) <= new Date(now.getTime() + 31 * 86400000))
    .map((r) => ({ code: r.code, title: r.title, dueDate: r.dueDate, ownerName: r.ownerName, overdue: r.overdue }));
  return {
    summary: board.summary,
    requirement: board.requirement,
    checks,
    kpis: { period: k.period, intensities: k.intensities, totals: k.totals, warnings: k.warnings },
    certificates: certs,
    currentCertificate: certs.find((c) => ['certified', 'suspended', 'applied'].includes(c.timers.effectiveStatus)) || certs[0] || null,
    nc,
    alerts,
    tasks,
    lastDataEntry: lastEntry,
    imperativeOpen: board.rows.filter((r) => r.effectiveType === 'imperative' && !r.done).map((r) => ({ code: r.code, title: r.title, status: r.status })),
  };
}

function buildAlerts({ est, board, checks, certs, ncs, nc, now }) {
  const a = [];
  const push = (severity, key, text, extra = {}) => a.push({ severity, key, text, establishmentId: est.id, establishmentName: est.name, ...extra });
  if (nc.overdue) push('critical', 'ncOverdue', `${nc.overdue} non-conformity(ies) past deadline.`);
  if (nc.followUpRequired) push('critical', 'ncFollowUp', 'More than 5 non-conformities at one audit — follow-up audit required.');
  for (const c of certs) for (const t of c.timers.tasks) push(t.severity, `cert_${t.key}`, t.label, { due: t.due });
  const exp = certs.find((c) => c.timers.effectiveStatus === 'certified' && c.timers.daysToExpiry != null && c.timers.daysToExpiry <= 90);
  if (exp) push('warning', 'certExpiring', `Certificate expires in ${exp.timers.daysToExpiry} days.`, { due: exp.timers.validTo });
  if (!checks.coverage.water.pass) push('warning', 'dataGapWater', `Water records incomplete for criterion 3.1 (${checks.coverage.water.recorded}/${checks.coverage.water.required} months).`);
  if (!checks.coverage.occupancy.pass) push('warning', 'dataGapOccupancy', 'Occupancy data incomplete — intensities may be off.');
  for (const [k, label] of [['targets', '1.2 targets'], ['actions', '1.3 action plan'], ['team', '1.1 team']]) {
    if (!checks[k].pass) push('warning', `rule_${k}`, `Rule check failing: ${label}.`);
  }
  for (const tr of [checks.trainingLastYear, checks.training]) {
    if (!tr.pass) push('warning', `rule_training_${tr.year}`, `Rule check failing: 1.20/1.21 staff training (${tr.year}).`);
  }
  if (board.summary.overdue) push('warning', 'criteriaOverdue', `${board.summary.overdue} criterion task(s) past due date.`);
  if (board.summary.evidenceWarnings) push('warning', 'evidenceValidity', `${board.summary.evidenceWarnings} evidence validity warning(s).`);
  void ncs; void now;
  const order = { critical: 0, warning: 1, info: 2 };
  return a.sort((x, y) => order[x.severity] - order[y.severity]);
}

module.exports = { profileOf, computeApplicability, loadBoard, loadChecks, overview, certificatesWithTimers };
