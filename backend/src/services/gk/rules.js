'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// rules.js — Green Key Readiness rule checks (pure functions).
//
//   guidelineRequirement  GK-05  required guideline % by certification period
//   checkTargets          GK-16  criterion 1.2
//   checkActions          GK-17  criterion 1.3
//   checkTeam             GK-18  criterion 1.1
//   checkTraining         GK-19  criteria 1.20 / 1.21
//   dataCoverage          GK-09  criterion 3.1 (also shown for energy / waste)
//
// Every check returns { rules: [{ key, status: pass|fail|warning, detail, items? }], pass }.
// `pass` is true when no rule has status 'fail'.  'warning' is used for things
// that are not yet due (current year still running) or are advisory.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000;

// Certification period → guideline % required (spec §5.2).
const GUIDELINE_TABLE = [0, 10, 20, 30, 40, 50];
// Transition rules apply until 31 Dec 2027 (spec §2.2 / §5.2).
const TRANSITION_END = new Date(Date.UTC(2027, 11, 31, 23, 59, 59));
const BIG_ESTABLISHMENT = 50; // "more than 50 employees"

function addMonths(d, n) {
  const x = new Date(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return x;
}
const toDate = (v) => (v == null || v === '' ? null : new Date(v));
const result = (rules) => ({ rules, pass: !rules.some((r) => r.status === 'fail') });
const r = (key, ok, detail, extra = {}) => ({ key, status: ok === true ? 'pass' : ok === false ? 'fail' : ok, detail, ...extra });

// ─── GK-05 Guideline percentage ─────────────────────────────────────────────

function guidelinePctForPeriod(period) {
  const p = Math.max(1, Math.floor(Number(period) || 1));
  return GUIDELINE_TABLE[Math.min(p, GUIDELINE_TABLE.length) - 1];
}

/**
 * Current certification period and required guideline %.
 * est: { priorPeriods, transition, dispensation }
 * certifications: [{ periodNumber, status }]
 * Period = completed periods + 1, where completed periods is the larger of the
 * profile value and the highest certified/expired period in the history; an
 * open application ('applied') fixes the period it was filed for.
 * Transition (re-applicant from 2022–2026, until 31 Dec 2027): one step lower.
 */
function guidelineRequirement(est, certifications = [], now = new Date()) {
  const certs = certifications || [];
  const applied = certs.filter((c) => c.status === 'applied').sort((a, b) => b.periodNumber - a.periodNumber)[0];
  const historyMax = certs
    .filter((c) => ['certified', 'expired', 'suspended'].includes(c.status))
    .reduce((m, c) => Math.max(m, c.periodNumber || 0), 0);
  const completed = Math.max(Number(est.priorPeriods) || 0, historyMax);
  const period = applied ? applied.periodNumber : completed + 1;
  const source = applied ? 'application' : historyMax > (Number(est.priorPeriods) || 0) ? 'history' : 'profile';
  const basePct = guidelinePctForPeriod(period);
  const transitionActive = !!est.transition && now <= TRANSITION_END;
  let requiredPct = basePct;
  if (transitionActive) {
    const idx = GUIDELINE_TABLE.indexOf(basePct);
    requiredPct = GUIDELINE_TABLE[Math.max(0, idx - 1)];
  }
  return {
    period, source, basePct, requiredPct,
    transition: !!est.transition, transitionActive, transitionEnds: TRANSITION_END.toISOString().slice(0, 10),
    dispensation: !!est.dispensation,
    firstTime: period === 1,
  };
}

// ─── GK-16 Strategic targets (criterion 1.2) ────────────────────────────────

function checkTargets(targets, est, now = new Date()) {
  const big = (Number(est.employees) || 0) > BIG_ESTABLISHMENT;
  const minCount = big ? 4 : 2;
  const list = targets || [];
  const rules = [];
  rules.push(r('count', list.length >= minCount, `${list.length} target(s); at least ${minCount} needed (${big ? 'more than' : 'at most'} 50 employees).`, { actual: list.length, required: minCount }));
  const areas = new Set(list.map((t) => t.area));
  rules.push(r('areas', areas.size >= 2, `${areas.size} different area(s); at least 2 needed.`, { actual: areas.size }));

  const nowYear = now.getUTCFullYear();
  const badHorizon = list.filter((t) => {
    if (!t.targetYear) return true;
    const start = t.documentDate ? new Date(t.documentDate).getUTCFullYear() : nowYear;
    return t.targetYear - start > 6 || t.targetYear < start;
  });
  rules.push(r('horizon', list.length > 0 && badHorizon.length === 0,
    badHorizon.length ? `${badHorizon.length} target(s) without a target year or with a horizon over 6 years.` : 'All targets have a horizon of 6 years or less.',
    { items: badHorizon.map((t) => t.id) }));

  const noBaseline = list.filter((t) => !t.baselineYear || t.baselineValue == null);
  rules.push(r('baseline', list.length > 0 && noBaseline.length === 0,
    noBaseline.length ? `${noBaseline.length} target(s) missing a baseline year or value from real data.` : 'All targets have a baseline year and value.',
    { items: noBaseline.map((t) => t.id) }));

  const twoYearsAgo = addMonths(now, -24);
  const dates = list.map((t) => toDate(t.documentDate)).filter(Boolean);
  const newest = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
  const old = list.filter((t) => !t.documentDate || new Date(t.documentDate) < twoYearsAgo);
  rules.push(r('documentAge', list.length > 0 && old.length === 0,
    !newest ? 'No target document date recorded.' : old.length ? `${old.length} target(s) with a document older than 2 years or undated.` : `Target document dated ${newest.toISOString().slice(0, 10)} (under 2 years old).`,
    { items: old.map((t) => t.id) }));
  return result(rules);
}

// ─── GK-17 Action plan (criterion 1.3) ──────────────────────────────────────

/**
 * opts.planStart — start of the 24-month plan (default: earliest action
 * creation date, else now).  Year 1 = [start, start+12m), Year 2 = [start+12m, start+24m).
 */
function checkActions(actions, est, opts = {}) {
  const list = actions || [];
  const big = (Number(est.employees) || 0) > BIG_ESTABLISHMENT;
  const minCount = big ? 4 : 2;
  const created = list.map((a) => toDate(a.createdAt)).filter(Boolean);
  const start = toDate(opts.planStart) || (created.length ? new Date(Math.min(...created.map((d) => d.getTime()))) : new Date());
  const y2 = addMonths(start, 12);
  const end = addMonths(start, 24);
  const rules = [];
  rules.push(r('count', list.length >= minCount, `${list.length} action(s); at least ${minCount} needed (${big ? 'more than' : 'at most'} 50 employees).`, { actual: list.length, required: minCount }));

  const byYear = { year1: 0, year2: 0, beyond: 0, undated: 0 };
  for (const a of list) {
    const d = toDate(a.dueDate);
    if (!d) byYear.undated++;
    else if (d < y2) byYear.year1++;
    else if (d < end) byYear.year2++;
    else byYear.beyond++;
  }
  rules.push(r('span', byYear.year1 > 0 && byYear.year2 > 0 && byYear.beyond === 0,
    `Year 1: ${byYear.year1}, year 2: ${byYear.year2}${byYear.beyond ? `, after 24 months: ${byYear.beyond}` : ''}. The plan must cover both years of the 24-month window starting ${start.toISOString().slice(0, 10)}.`,
    { byYear, planStart: start.toISOString().slice(0, 10), planEnd: end.toISOString().slice(0, 10) }));

  const missing = (field) => list.filter((a) => !a[field] || String(a[field]).trim() === '');
  for (const [key, field, label] of [['measurable', 'measure', 'a measure'], ['owner', 'owner', 'an owner'], ['timeline', 'dueDate', 'a due date'], ['linkedTarget', 'targetId', 'a linked target']]) {
    const m = missing(field);
    rules.push(r(key, list.length > 0 && m.length === 0, m.length ? `${m.length} action(s) without ${label}.` : `All actions have ${label}.`, { items: m.map((a) => a.id) }));
  }
  const unfulfilled = list.filter((a) => a.status === 'not_fulfilled');
  const unjustified = unfulfilled.filter((a) => !a.justification || !a.nextStep);
  rules.push(r('unfulfilled', unjustified.length === 0,
    unfulfilled.length ? `${unfulfilled.length} unfulfilled action(s); ${unjustified.length} without justification and next step.` : 'No unfulfilled actions.',
    { items: unjustified.map((a) => a.id) }));
  return result(rules);
}

// ─── GK-18 Team (criterion 1.1) ─────────────────────────────────────────────

const isCurrent = (m, now) => !m.toDate || new Date(m.toDate) > now;

function checkTeam(members, now = new Date()) {
  const current = (members || []).filter((m) => isCurrent(m, now));
  const reps = current.filter((m) => m.role === 'representative');
  const subs = current.filter((m) => m.role === 'substitute');
  const committee = current.filter((m) => m.role === 'committee');
  const rules = [];
  rules.push(r('representative', reps.length === 1, reps.length === 1 ? `Representative: ${reps[0].name}.` : `${reps.length} current representative(s); exactly one needed.`));
  rules.push(r('substitute', subs.length === 1, subs.length === 1 ? `Substitute: ${subs[0].name}.` : `${subs.length} current substitute(s); exactly one needed.`));
  const notPermanent = [...reps, ...subs].filter((m) => !m.permanentStaff);
  rules.push(r('permanent', reps.length + subs.length > 0 && notPermanent.length === 0,
    notPermanent.length ? `${notPermanent.map((m) => m.name).join(', ')} not permanent staff.` : 'Representative and substitute are permanent staff.'));
  if (reps.length === 1 && subs.length === 1 && reps[0].name.trim().toLowerCase() === subs[0].name.trim().toLowerCase()) {
    rules.push(r('distinct', false, 'Representative and substitute must be different people.'));
  }
  rules.push(r('committee', committee.length > 0 ? true : 'warning', `${committee.length} Green Committee member(s).`));
  return { ...result(rules), current: { representative: reps[0] || null, substitute: subs[0] || null, committee } };
}

// ─── GK-19 Briefings and trainings (criteria 1.20 / 1.21) ──────────────────

/**
 * Checks one calendar year (default: current).  While the year is still
 * running, an unmet frequency is a 'warning' (still due), not a 'fail'.
 */
function checkTraining(trainings, est, opts = {}) {
  const now = opts.now || new Date();
  const year = opts.year || now.getUTCFullYear();
  const running = year >= now.getUTCFullYear();
  const list = trainings || [];
  const inYear = list.filter((t) => new Date(t.date).getUTCFullYear() === year);
  const count = (k) => inYear.filter((t) => t.kind === k).length;
  const lowFreq = !!est.seasonal || (est.employees != null && Number(est.employees) <= 5);
  const minBriefings = lowFreq ? 1 : 2;
  const due = (ok) => (ok ? true : running ? 'warning' : false);
  const rules = [];
  const b = count('briefing');
  rules.push(r('briefings', due(b >= minBriefings), `${b} briefing(s) in ${year}; at least ${minBriefings} needed${lowFreq ? ' (seasonal or 5 staff or fewer)' : ''}.`, { actual: b, required: minBriefings }));
  const g = count('general_training');
  rules.push(r('generalTraining', due(g >= 1), `${g} general training(s) in ${year}; at least 1 needed.`));
  const d = count('departmental_training');
  rules.push(r('departmentalTraining', due(d >= 1), `${d} departmental training(s) in ${year}; at least 1 needed.`));

  const hires = list.filter((t) => t.kind === 'new_hire' && new Date(t.hireDate || t.date).getUTCFullYear() === year);
  const late = hires.filter((t) => t.hireDate && (new Date(t.date) - new Date(t.hireDate)) / DAY > 28);
  rules.push(r('newHires', late.length === 0,
    hires.length ? `${hires.length} new hire training(s) in ${year}; ${late.length} later than 4 weeks after hire.` : `No new-hire trainings recorded for ${year}.`,
    { items: late.map((t) => ({ id: t.id, staffName: t.staffName, days: Math.round((new Date(t.date) - new Date(t.hireDate)) / DAY) })) }));

  // Content should progress year on year: repeated topics are advisory.
  const prevTopics = new Set(list.filter((t) => new Date(t.date).getUTCFullYear() === year - 1 && t.kind !== 'new_hire').map((t) => String(t.topic).trim().toLowerCase()));
  const repeated = inYear.filter((t) => t.kind !== 'new_hire' && prevTopics.has(String(t.topic).trim().toLowerCase()));
  if (repeated.length) rules.push(r('progression', 'warning', `${repeated.length} topic(s) repeated from ${year - 1}; content should progress each year.`));
  return { ...result(rules), year };
}

// ─── GK-09 / 3.1 Data coverage ──────────────────────────────────────────────

const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

/**
 * Monthly coverage for one resource kind.
 * records: [{ year, month }]; requirement depends on the applicant:
 *   transition (active)  → at least 6 months recorded in the last 24 months
 *   first-time (period 1) → previous full calendar year, or at least 3 months
 *   otherwise            → every month of the last 2 calendar years
 */
function dataCoverage(records, req, now = new Date()) {
  const months = new Set((records || []).map((x) => monthKey(x.year, x.month)));
  const y = now.getUTCFullYear();
  const curM = now.getUTCMonth() + 1;
  const lastN = (n) => {
    const out = [];
    let yy = y; let mm = curM - 1; // last complete month
    if (mm === 0) { mm = 12; yy--; }
    for (let i = 0; i < n; i++) { out.push(monthKey(yy, mm)); mm--; if (mm === 0) { mm = 12; yy--; } }
    return out;
  };
  const yearMonths = (yy) => Array.from({ length: 12 }, (_, i) => monthKey(yy, i + 1));
  const recent24 = lastN(24).filter((k) => months.has(k)).length;

  let rule; let pass; let required; let window; let missing = [];
  if (req && req.transitionActive) {
    rule = 'transition';
    required = 6;
    window = lastN(24);
    pass = recent24 >= 6;
    missing = pass ? [] : window.filter((k) => !months.has(k)).slice(0, 6);
  } else if (req && req.firstTime) {
    rule = 'firstTime';
    const prev = yearMonths(y - 1);
    const fullPrev = prev.every((k) => months.has(k));
    required = 3;
    window = lastN(24);
    pass = fullPrev || recent24 >= 3;
    missing = pass ? [] : prev.filter((k) => !months.has(k));
  } else {
    rule = 'twoYears';
    window = [...yearMonths(y - 2), ...yearMonths(y - 1)];
    required = 24;
    missing = window.filter((k) => !months.has(k));
    pass = missing.length === 0;
  }
  return {
    rule, pass, required,
    recorded: rule === 'twoYears' ? window.length - missing.length : recent24,
    totalMonths: months.size,
    missing,
    windowFrom: [...window].sort()[0],
    windowTo: [...window].sort()[window.length - 1],
  };
}

module.exports = {
  GUIDELINE_TABLE, TRANSITION_END, addMonths, isCurrent,
  guidelinePctForPeriod, guidelineRequirement,
  checkTargets, checkActions, checkTeam, checkTraining, dataCoverage,
};
