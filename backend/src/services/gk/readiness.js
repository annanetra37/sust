'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// readiness.js — readiness board and score (GK-06), evidence validity (GK-07). Pure.
//
// Definitions (shown in the UI help text):
//   Done                  status approved or conforms, or N/A with a stored justification
//   Readiness %           done ÷ applicable criteria (criteria the engine marks
//                         not applicable are excluded)
//   Imperative gaps       applicable criteria of effective type imperative that are not done
//   Guideline achieved %  guideline criteria approved/conforms ÷ applicable guideline
//                         criteria (user N/A with justification removes it from the denominator)
// ─────────────────────────────────────────────────────────────────────────────

const { addMonths } = require('./rules');

const STATUSES = ['not_started', 'in_progress', 'evidence_uploaded', 'approved', 'conforms', 'na'];
const MET = new Set(['approved', 'conforms']);
const DAY = 86400000;

const isDone = (s) => !!s && (MET.has(s.status) || (s.status === 'na' && !!(s.naJustification && s.naJustification.trim())));

/**
 * Validity warnings for one evidence file given the criteria it is linked to.
 * criteria: [{ code, applicability }]
 */
function evidenceWarnings(ev, criteria = [], now = new Date()) {
  const w = [];
  if (ev.validUntil) {
    const until = new Date(ev.validUntil);
    if (until < now) w.push({ key: 'expired', severity: 'critical', text: `Expired on ${until.toISOString().slice(0, 10)}.` });
    else if ((until - now) / DAY <= 30) w.push({ key: 'expiring', severity: 'warning', text: `Expires on ${until.toISOString().slice(0, 10)}.` });
  }
  for (const c of criteria) {
    const rules = c.applicability || {};
    const maxAge = Number(rules.evidenceMaxAgeMonths);
    if (maxAge > 0) {
      if (!ev.documentDate) w.push({ key: 'undated', severity: 'warning', text: `${c.code}: document date needed (must be under ${maxAge} months old).` });
      else if (new Date(ev.documentDate) < addMonths(now, -maxAge)) w.push({ key: 'tooOld', severity: 'critical', text: `${c.code}: document older than ${maxAge} months.` });
    }
    const review = Number(rules.reviewEveryMonths);
    if (review > 0) {
      const d = ev.documentDate || ev.createdAt;
      if (d && new Date(d) < addMonths(now, -review)) w.push({ key: 'review', severity: 'warning', text: `${c.code}: check the information is still valid (every ${review} months).` });
    }
  }
  return w;
}

/**
 * Build board rows and the summary.
 * appl: output of applicability.computeList
 * criteriaById: Map(id → criterion)
 * statusByCriterion: Map(criterionId → GkCriterionStatus)
 * evidenceByCriterion: Map(criterionId → [evidence with warnings])
 * requirement: output of rules.guidelineRequirement
 */
function buildBoard(appl, criteriaById, statusByCriterion, evidenceByCriterion, requirement, now = new Date()) {
  const rows = appl.applicable.map((a) => {
    const c = criteriaById.get(a.criterionId) || {};
    const s = statusByCriterion.get(a.criterionId) || null;
    const ev = evidenceByCriterion.get(a.criterionId) || [];
    const overdue = !!(s && s.dueDate && new Date(s.dueDate) < now && !isDone(s));
    return {
      criterionId: a.criterionId, code: a.code, area: a.area, subArea: c.subArea || null, title: a.title,
      guidance: c.guidance || null, baseType: a.baseType, effectiveType: a.effectiveType, notes: a.notes, naAllowed: a.naAllowed,
      evidenceTypes: c.evidenceTypes || [], auditMethod: c.auditMethod || null, dataLink: c.dataLink || null,
      custom: !!c.companyId,
      status: s ? s.status : 'not_started', naJustification: s ? s.naJustification : null,
      ownerName: s ? s.ownerName : null, dueDate: s ? s.dueDate : null, comments: (s && s.comments) || [],
      done: isDone(s), overdue,
      evidence: ev.map((e) => ({ id: e.id, fileName: e.fileName, status: e.status, documentDate: e.documentDate, validUntil: e.validUntil, warnings: e.warnings || [] })),
      evidenceWarnings: ev.reduce((n, e) => n + (e.warnings || []).length, 0),
    };
  }).sort(byCode);

  const notApplicable = appl.notApplicable.map((a) => ({ criterionId: a.criterionId, code: a.code, area: a.area, title: a.title, reasons: a.reasons })).sort(byCode);
  return { rows, notApplicable, summary: summarise(rows, requirement) };
}

function summarise(rows, requirement) {
  const total = rows.length;
  const done = rows.filter((r) => r.done).length;
  const imperative = rows.filter((r) => r.effectiveType === 'imperative');
  const imperativeGaps = imperative.filter((r) => !r.done);
  const guideline = rows.filter((r) => r.effectiveType === 'guideline' && !(r.status === 'na' && r.done));
  const guidelineMet = guideline.filter((r) => MET.has(r.status)).length;
  const achievedPct = guideline.length ? Math.round((guidelineMet / guideline.length) * 1000) / 10 : 0;
  const requiredPct = requirement ? requirement.requiredPct : 0;
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  const byArea = {};
  for (const r of rows) {
    byArea[r.area] = byArea[r.area] || { total: 0, done: 0 };
    byArea[r.area].total++;
    if (r.done) byArea[r.area].done++;
  }
  return {
    applicable: total,
    done,
    readinessPct: total ? Math.round((done / total) * 1000) / 10 : 0,
    imperativeTotal: imperative.length,
    imperativeGaps: imperativeGaps.length,
    imperativeGapCodes: imperativeGaps.map((r) => r.code),
    guideline: {
      applicable: guideline.length,
      met: guidelineMet,
      achievedPct,
      requiredPct,
      neededCount: Math.ceil((requiredPct / 100) * guideline.length - 1e-9),
      metRequirement: achievedPct >= requiredPct,
    },
    byStatus,
    byArea,
    overdue: rows.filter((r) => r.overdue).length,
    evidenceWarnings: rows.reduce((n, r) => n + r.evidenceWarnings, 0),
  };
}

function byCode(a, b) {
  const pa = String(a.code).split('.').map(Number);
  const pb = String(b.code).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return String(a.code).localeCompare(String(b.code));
}

module.exports = { STATUSES, isDone, evidenceWarnings, buildBoard, summarise, byCode };
