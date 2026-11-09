'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// applicability.js — Green Key Readiness applicability engine (GK-04). Pure.
//
// A criterion carries JSON rules in `applicability`.  Supported keys:
//   minEmployees: 51            applies only when employees >= 51
//   maxEmployees: 50            applies only when employees <= 50
//   requiresFacility: "restaurant" | ["restaurant", "pool"]   (all required)
//   excludesFacility: "outsourcedHousekeeping" | [...]         (any excludes)
//   notSeasonal: true           not for seasonal establishments
//   seasonalOnly: true          only for seasonal establishments
//   countries: ["BE"]           national adaptation: only in these countries
//   excludeCountries: ["DK"]    not in these countries
//   typeByEmployees: { threshold: 50, above: "imperative", atOrBelow: "guideline" }
//   naAllowedWithJustification: true   hint: may be set N/A with a justification
// Unknown keys are ignored (readiness.js reads evidenceMaxAgeMonths and
// reviewEveryMonths from the same object).
//
// Facilities on the establishment profile: { restaurant, animals,
// outsourcedHousekeeping, pool, meetingSpaceM2 }.  A numeric facility counts
// as present when > 0.
// ─────────────────────────────────────────────────────────────────────────────

const FACILITIES = ['restaurant', 'animals', 'outsourcedHousekeeping', 'pool', 'meetingSpaceM2'];
const TYPES = ['imperative', 'guideline'];

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function hasFacility(profile, key) {
  const f = (profile && profile.facilities) || {};
  const v = f[key];
  return typeof v === 'number' ? v > 0 : !!v;
}

/**
 * Evaluate one criterion against an establishment profile.
 * Returns { applicable, effectiveType, baseType, reasons: [], notes: [], naAllowed }.
 * `reasons` explain why it is not applicable; `notes` explain type changes or
 * assumptions (e.g. employees unknown).
 */
function evaluate(criterion, profile) {
  const rules = (criterion && criterion.applicability) || {};
  const p = profile || {};
  const reasons = [];
  const notes = [];
  const employees = p.employees == null || p.employees === '' ? null : Number(p.employees);
  const country = String(p.country || '').toUpperCase();

  if (rules.minEmployees != null) {
    if (employees == null) notes.push(`Employee count unknown — assumed applicable (applies from ${rules.minEmployees} employees).`);
    else if (employees < rules.minEmployees) reasons.push(`Applies from ${rules.minEmployees} employees; establishment has ${employees}.`);
  }
  if (rules.maxEmployees != null) {
    if (employees == null) notes.push(`Employee count unknown — assumed applicable (applies up to ${rules.maxEmployees} employees).`);
    else if (employees > rules.maxEmployees) reasons.push(`Applies up to ${rules.maxEmployees} employees; establishment has ${employees}.`);
  }
  for (const f of asList(rules.requiresFacility)) {
    if (!hasFacility(p, f)) reasons.push(`Requires facility: ${f}.`);
  }
  for (const f of asList(rules.excludesFacility)) {
    if (hasFacility(p, f)) reasons.push(`Not applicable with facility: ${f}.`);
  }
  if (rules.notSeasonal && p.seasonal) reasons.push('Not applicable to seasonal establishments.');
  if (rules.seasonalOnly && !p.seasonal) reasons.push('Applies to seasonal establishments only.');
  const only = asList(rules.countries).map((c) => String(c).toUpperCase());
  if (only.length && !only.includes(country)) reasons.push(`National adaptation for ${only.join(', ')} only.`);
  const excl = asList(rules.excludeCountries).map((c) => String(c).toUpperCase());
  if (excl.includes(country)) reasons.push(`Not applicable in ${country} (national adaptation).`);

  const baseType = TYPES.includes(criterion.type) ? criterion.type : 'guideline';
  let effectiveType = baseType;
  const tbe = rules.typeByEmployees;
  if (tbe && tbe.threshold != null) {
    if (employees == null) {
      notes.push(`Employee count unknown — type stays ${baseType} (changes at ${tbe.threshold} employees).`);
    } else {
      const t = employees > tbe.threshold ? tbe.above : tbe.atOrBelow;
      if (TYPES.includes(t)) effectiveType = t;
      if (effectiveType !== baseType) notes.push(`${effectiveType === 'imperative' ? 'Imperative' : 'Guideline'} because the establishment has ${employees > tbe.threshold ? 'more than' : 'at most'} ${tbe.threshold} employees.`);
    }
  }

  return {
    applicable: reasons.length === 0,
    effectiveType,
    baseType,
    reasons,
    notes,
    naAllowed: !!rules.naAllowedWithJustification,
  };
}

/** Evaluate a list of criteria. Returns { applicable: [...], notApplicable: [...] } with the criterion merged in. */
function computeList(criteria, profile) {
  const applicable = [];
  const notApplicable = [];
  for (const c of criteria) {
    const r = evaluate(c, profile);
    const row = { criterionId: c.id, code: c.code, area: c.area, title: c.title, ...r };
    (r.applicable ? applicable : notApplicable).push(row);
  }
  return { applicable, notApplicable };
}

/**
 * Change notice between two computations (profile before → after).
 * Returns { becameApplicable, becameNotApplicable, typeChanged, changed }.
 */
function diff(before, after) {
  const index = (res) => {
    const m = new Map();
    for (const r of res.applicable) m.set(r.criterionId, r);
    for (const r of res.notApplicable) m.set(r.criterionId, r);
    return m;
  };
  const a = index(before);
  const b = index(after);
  const becameApplicable = [];
  const becameNotApplicable = [];
  const typeChanged = [];
  for (const [id, now] of b) {
    const was = a.get(id);
    if (!was) { if (now.applicable) becameApplicable.push(pick(now)); continue; }
    if (!was.applicable && now.applicable) becameApplicable.push(pick(now));
    else if (was.applicable && !now.applicable) becameNotApplicable.push({ ...pick(now), reasons: now.reasons });
    else if (was.applicable && now.applicable && was.effectiveType !== now.effectiveType) {
      typeChanged.push({ ...pick(now), from: was.effectiveType, to: now.effectiveType });
    }
  }
  return {
    becameApplicable, becameNotApplicable, typeChanged,
    changed: becameApplicable.length + becameNotApplicable.length + typeChanged.length > 0,
  };
}

function pick(r) { return { criterionId: r.criterionId, code: r.code, title: r.title, effectiveType: r.effectiveType }; }

/** Validate a rules object from user input. Returns an array of error strings. */
function validateRules(rules) {
  const errors = [];
  if (rules == null) return errors;
  if (typeof rules !== 'object' || Array.isArray(rules)) return ['applicability must be a JSON object.'];
  for (const k of ['minEmployees', 'maxEmployees', 'evidenceMaxAgeMonths', 'reviewEveryMonths']) {
    if (rules[k] != null && !(Number.isFinite(Number(rules[k])) && Number(rules[k]) >= 0)) errors.push(`${k} must be a non-negative number.`);
  }
  for (const k of ['requiresFacility', 'excludesFacility']) {
    for (const f of asList(rules[k])) if (!FACILITIES.includes(f)) errors.push(`${k}: unknown facility "${f}" (allowed: ${FACILITIES.join(', ')}).`);
  }
  for (const k of ['countries', 'excludeCountries']) {
    for (const c of asList(rules[k])) if (!/^[A-Za-z]{2}$/.test(String(c))) errors.push(`${k}: "${c}" is not a 2-letter country code.`);
  }
  const t = rules.typeByEmployees;
  if (t != null) {
    if (typeof t !== 'object' || !Number.isFinite(Number(t.threshold)) || !TYPES.includes(t.above) || !TYPES.includes(t.atOrBelow)) {
      errors.push('typeByEmployees needs { threshold: number, above: imperative|guideline, atOrBelow: imperative|guideline }.');
    }
  }
  return errors;
}

module.exports = { evaluate, computeList, diff, validateRules, FACILITIES, TYPES };
