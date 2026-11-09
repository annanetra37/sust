'use strict';

// Unit tests for the Green Key Readiness engines (pure functions, no database).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const applicability = require('../src/services/gk/applicability');
const rules = require('../src/services/gk/rules');
const readiness = require('../src/services/gk/readiness');
const lifecycle = require('../src/services/gk/lifecycle');
const kpis = require('../src/services/gk/kpis');
const buildingEnergy = require('../src/services/buildingEnergy');

const D = (s) => new Date(`${s}T00:00:00Z`);
const crit = (code, type, applicabilityRules = {}) => ({ id: `c${code}`, code, area: Number(code.split('.')[0]), title: `T ${code}`, type, applicability: applicabilityRules });

// ─── Applicability ──────────────────────────────────────────────────────────

test('applicability: type changes at 50 employees (1.6 / 1.10)', () => {
  const c = crit('1.6', 'guideline', { typeByEmployees: { threshold: 50, above: 'imperative', atOrBelow: 'guideline' } });
  assert.equal(applicability.evaluate(c, { employees: 50 }).effectiveType, 'guideline');
  const r51 = applicability.evaluate(c, { employees: 51 });
  assert.equal(r51.effectiveType, 'imperative');
  assert.equal(r51.applicable, true);
  assert.match(r51.notes[0], /more than 50/);
  const unknown = applicability.evaluate(c, { employees: null });
  assert.equal(unknown.effectiveType, 'guideline');
  assert.match(unknown.notes[0], /unknown/);
});

test('applicability: size, facility, seasonal and country rules', () => {
  const p = { employees: 20, seasonal: true, country: 'am', facilities: { restaurant: false, meetingSpaceM2: 120 } };
  assert.equal(applicability.evaluate(crit('9.1', 'guideline', { minEmployees: 51 }), p).applicable, false);
  assert.equal(applicability.evaluate(crit('9.2', 'guideline', { requiresFacility: 'restaurant' }), p).applicable, false);
  assert.equal(applicability.evaluate(crit('9.3', 'guideline', { requiresFacility: 'meetingSpaceM2' }), p).applicable, true);
  assert.equal(applicability.evaluate(crit('9.4', 'guideline', { notSeasonal: true }), p).applicable, false);
  const be = applicability.evaluate(crit('9.5', 'guideline', { countries: ['BE'] }), p);
  assert.equal(be.applicable, false);
  assert.match(be.reasons[0], /BE/);
  assert.equal(applicability.evaluate(crit('9.5', 'guideline', { countries: ['BE'] }), { ...p, country: 'BE' }).applicable, true);
  assert.equal(applicability.evaluate(crit('9.6', 'imperative', { naAllowedWithJustification: true }), p).naAllowed, true);
});

test('applicability: change notice when the profile changes', () => {
  const list = [
    crit('1.6', 'guideline', { typeByEmployees: { threshold: 50, above: 'imperative', atOrBelow: 'guideline' } }),
    crit('6.1', 'guideline', { requiresFacility: 'restaurant' }),
    crit('3.1', 'imperative'),
  ];
  const before = applicability.computeList(list, { employees: 30, facilities: { restaurant: true } });
  const after = applicability.computeList(list, { employees: 80, facilities: { restaurant: false } });
  const d = applicability.diff(before, after);
  assert.equal(d.changed, true);
  assert.deepEqual(d.typeChanged.map((x) => [x.code, x.from, x.to]), [['1.6', 'guideline', 'imperative']]);
  assert.deepEqual(d.becameNotApplicable.map((x) => x.code), ['6.1']);
  assert.equal(d.becameApplicable.length, 0);
  assert.equal(applicability.diff(after, before).becameApplicable[0].code, '6.1');
});

test('applicability: rule validation', () => {
  assert.deepEqual(applicability.validateRules({ minEmployees: 51, countries: ['BE'] }), []);
  assert.ok(applicability.validateRules({ requiresFacility: 'spa' }).length);
  assert.ok(applicability.validateRules({ typeByEmployees: { threshold: 50, above: 'x' } }).length);
  assert.ok(applicability.validateRules([]).length);
});

// ─── Guideline % (GK-05) ────────────────────────────────────────────────────

test('guideline %: period table 0/10/20/30/40/50', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 12].map(rules.guidelinePctForPeriod), [0, 10, 20, 30, 40, 50, 50, 50]);
  const now = D('2026-11-09');
  assert.equal(rules.guidelineRequirement({ priorPeriods: 0 }, [], now).requiredPct, 0);
  assert.equal(rules.guidelineRequirement({ priorPeriods: 2 }, [], now).period, 3);
  assert.equal(rules.guidelineRequirement({ priorPeriods: 2 }, [], now).requiredPct, 20);
  // History beats the profile.
  const h = rules.guidelineRequirement({ priorPeriods: 0 }, [{ periodNumber: 1, status: 'certified' }, { periodNumber: 2, status: 'expired' }], now);
  assert.equal(h.period, 3);
  assert.equal(h.source, 'history');
  // An open application fixes the period.
  assert.equal(rules.guidelineRequirement({ priorPeriods: 1 }, [{ periodNumber: 2, status: 'applied' }], now).period, 2);
});

test('guideline %: transition gives the next lower percentage until end 2027', () => {
  const est = { priorPeriods: 3, transition: true, dispensation: true };
  const r = rules.guidelineRequirement(est, [], D('2026-11-09'));
  assert.equal(r.period, 4);
  assert.equal(r.basePct, 30);
  assert.equal(r.requiredPct, 20);
  assert.equal(r.transitionActive, true);
  assert.equal(r.dispensation, true);
  assert.equal(rules.guidelineRequirement({ priorPeriods: 1, transition: true }, [], D('2026-11-09')).requiredPct, 0);
  assert.equal(rules.guidelineRequirement(est, [], D('2028-01-02')).requiredPct, 30);
});

// ─── Readiness (GK-06) ──────────────────────────────────────────────────────

test('readiness %: done = approved/conforms/N/A with justification; imperative gaps; guideline achieved', () => {
  const list = [
    crit('1.1', 'imperative'), crit('1.2', 'imperative'), crit('1.3', 'imperative'),
    crit('1.9', 'guideline', { naAllowedWithJustification: true }), crit('2.5', 'guideline'), crit('5.1', 'guideline'), crit('5.2', 'guideline'),
    crit('6.9', 'guideline', { requiresFacility: 'restaurant' }),
  ];
  const appl = applicability.computeList(list, { employees: 10, facilities: {} });
  const byId = new Map(list.map((c) => [c.id, c]));
  const status = new Map([
    ['c1.1', { status: 'approved' }],
    ['c1.2', { status: 'conforms' }],
    ['c1.3', { status: 'evidence_uploaded' }],
    ['c1.9', { status: 'na', naJustification: 'No Indigenous Peoples within 100 km.' }],
    ['c2.5', { status: 'conforms' }],
    ['c5.1', { status: 'na', naJustification: '' }],
  ]);
  const req = rules.guidelineRequirement({ priorPeriods: 2 }, [], D('2026-11-09')); // 20 %
  const b = readiness.buildBoard(appl, byId, status, new Map(), req);
  assert.equal(b.notApplicable.length, 1);
  assert.equal(b.summary.applicable, 7);
  assert.equal(b.summary.done, 4); // 1.1, 1.2, 1.9 (N/A justified), 2.5
  assert.equal(b.summary.readinessPct, 57.1);
  assert.equal(b.summary.imperativeGaps, 1);
  assert.deepEqual(b.summary.imperativeGapCodes, ['1.3']);
  // Guideline: 1.9 removed (N/A), 2.5 met, 5.1 (N/A without justification) and 5.2 not → 1/3.
  assert.equal(b.summary.guideline.applicable, 3);
  assert.equal(b.summary.guideline.achievedPct, 33.3);
  assert.equal(b.summary.guideline.requiredPct, 20);
  assert.equal(b.summary.guideline.metRequirement, true);
});

test('evidence validity: expired, too old for 1.2, review reminder for 2.5', () => {
  const now = D('2026-11-09');
  const w = readiness.evidenceWarnings({ validUntil: D('2026-10-01'), documentDate: D('2024-06-01') }, [{ code: '1.2', applicability: { evidenceMaxAgeMonths: 24 } }, { code: '2.5', applicability: { reviewEveryMonths: 6 } }], now);
  assert.deepEqual(w.map((x) => x.key).sort(), ['expired', 'review', 'tooOld']);
  assert.deepEqual(readiness.evidenceWarnings({ documentDate: D('2025-12-01') }, [{ code: '1.2', applicability: { evidenceMaxAgeMonths: 24 } }], now), []);
  assert.equal(readiness.evidenceWarnings({}, [{ code: '1.2', applicability: { evidenceMaxAgeMonths: 24 } }], now)[0].key, 'undated');
});

// ─── Targets / actions / team / training ────────────────────────────────────

const status = (res, key) => res.rules.find((r) => r.key === key).status;

test('targets (1.2): count by size, two areas, horizon, baseline, document age', () => {
  const now = D('2026-11-09');
  const t = (id, area, extra = {}) => ({ id, area, baselineYear: 2025, baselineValue: 100, targetYear: 2030, documentDate: D('2026-01-15'), ...extra });
  const small = rules.checkTargets([t('a', 3), t('b', 4)], { employees: 30 }, now);
  assert.equal(small.pass, true);
  const big = rules.checkTargets([t('a', 3), t('b', 4)], { employees: 51 }, now);
  assert.equal(status(big, 'count'), 'fail');
  const oneArea = rules.checkTargets([t('a', 3), t('b', 3)], { employees: 10 }, now);
  assert.equal(status(oneArea, 'areas'), 'fail');
  const far = rules.checkTargets([t('a', 3, { targetYear: 2033 }), t('b', 4)], { employees: 10 }, now);
  assert.equal(status(far, 'horizon'), 'fail');
  const nob = rules.checkTargets([t('a', 3, { baselineValue: null }), t('b', 4)], { employees: 10 }, now);
  assert.equal(status(nob, 'baseline'), 'fail');
  const old = rules.checkTargets([t('a', 3, { documentDate: D('2024-10-01') }), t('b', 4)], { employees: 10 }, now);
  assert.equal(status(old, 'documentAge'), 'fail');
  assert.equal(status(old, 'horizon'), 'pass'); // 2024 → 2030 = 6 years
});

test('actions (1.3): count, 24-month span split by year, fields, unfulfilled justification', () => {
  const a = (id, due, extra = {}) => ({ id, dueDate: D(due), measure: 'kWh', owner: 'Ani', targetId: 't1', status: 'planned', ...extra });
  const planStart = D('2026-01-01');
  const ok = rules.checkActions([a('1', '2026-06-01'), a('2', '2027-06-01')], { employees: 20 }, { planStart });
  assert.equal(ok.pass, true, JSON.stringify(ok.rules));
  const oneYear = rules.checkActions([a('1', '2026-06-01'), a('2', '2026-09-01')], { employees: 20 }, { planStart });
  assert.equal(status(oneYear, 'span'), 'fail');
  const beyond = rules.checkActions([a('1', '2026-06-01'), a('2', '2027-06-01'), a('3', '2028-02-01')], { employees: 20 }, { planStart });
  assert.equal(status(beyond, 'span'), 'fail');
  const big = rules.checkActions([a('1', '2026-06-01'), a('2', '2027-06-01')], { employees: 60 }, { planStart });
  assert.equal(status(big, 'count'), 'fail');
  const fields = rules.checkActions([a('1', '2026-06-01', { measure: '' }), a('2', '2027-06-01', { owner: null, targetId: null })], { employees: 20 }, { planStart });
  assert.equal(status(fields, 'measurable'), 'fail');
  assert.equal(status(fields, 'owner'), 'fail');
  assert.equal(status(fields, 'linkedTarget'), 'fail');
  const unf = rules.checkActions([a('1', '2026-06-01', { status: 'not_fulfilled', justification: 'Budget' }), a('2', '2027-06-01')], { employees: 20 }, { planStart });
  assert.equal(status(unf, 'unfulfilled'), 'fail');
});

test('team (1.1): exactly one current representative and substitute, permanent staff', () => {
  const now = D('2026-11-09');
  const ok = rules.checkTeam([
    { role: 'representative', name: 'Ani', permanentStaff: true },
    { role: 'representative', name: 'Old Rep', permanentStaff: true, toDate: D('2025-01-01') },
    { role: 'substitute', name: 'Davit', permanentStaff: true },
    { role: 'committee', name: 'Mariam', permanentStaff: false },
  ], now);
  assert.equal(ok.pass, true);
  assert.equal(ok.current.representative.name, 'Ani');
  const two = rules.checkTeam([{ role: 'representative', name: 'A', permanentStaff: true }, { role: 'representative', name: 'B', permanentStaff: true }, { role: 'substitute', name: 'C', permanentStaff: false }], now);
  assert.equal(status(two, 'representative'), 'fail');
  assert.equal(status(two, 'permanent'), 'fail');
  assert.equal(status(rules.checkTeam([], now), 'substitute'), 'fail');
});

test('training (1.20/1.21): briefings, general/departmental, new hires within 4 weeks', () => {
  const now = D('2026-11-09');
  const tr = [
    { kind: 'briefing', topic: 'Water', date: D('2025-03-01') },
    { kind: 'general_training', topic: 'Basics', date: D('2025-04-01') },
    { kind: 'departmental_training', topic: 'Housekeeping chemicals', date: D('2025-05-01') },
    { id: 'n1', kind: 'new_hire', topic: 'Induction', staffName: 'Lilit', hireDate: D('2025-06-01'), date: D('2025-07-15') },
    { id: 'n2', kind: 'new_hire', topic: 'Induction', staffName: 'Aram', hireDate: D('2025-06-01'), date: D('2025-06-20') },
  ];
  const last = rules.checkTraining(tr, { employees: 40, seasonal: false }, { now, year: 2025 });
  assert.equal(status(last, 'briefings'), 'fail'); // 1 of 2
  assert.equal(status(last, 'generalTraining'), 'pass');
  assert.equal(status(last, 'departmentalTraining'), 'pass');
  assert.equal(status(last, 'newHires'), 'fail');
  assert.deepEqual(last.rules.find((r) => r.key === 'newHires').items.map((i) => i.staffName), ['Lilit']);
  const seasonal = rules.checkTraining(tr, { employees: 40, seasonal: true }, { now, year: 2025 });
  assert.equal(status(seasonal, 'briefings'), 'pass');
  const tiny = rules.checkTraining(tr, { employees: 5 }, { now, year: 2025 });
  assert.equal(status(tiny, 'briefings'), 'pass');
  // Current year still running → warning, not fail.
  const cur = rules.checkTraining([], { employees: 40 }, { now, year: 2026 });
  assert.equal(status(cur, 'briefings'), 'warning');
});

// ─── Data coverage (3.1) ────────────────────────────────────────────────────

const months = (fromY, fromM, n) => Array.from({ length: n }, (_, i) => {
  const k = fromM - 1 + i;
  return { year: fromY + Math.floor(k / 12), month: (k % 12) + 1 };
});

test('3.1 coverage: two calendar years, first-time and transition rules', () => {
  const now = D('2026-11-09');
  const full = months(2024, 1, 24);
  assert.equal(rules.dataCoverage(full, { firstTime: false }, now).pass, true);
  const gap = full.filter((m) => !(m.year === 2025 && m.month === 7));
  const g = rules.dataCoverage(gap, { firstTime: false }, now);
  assert.equal(g.pass, false);
  assert.deepEqual(g.missing, ['2025-07']);
  assert.equal(g.recorded, 23);
  // First-time: 3 months is enough.
  assert.equal(rules.dataCoverage(months(2026, 6, 3), { firstTime: true }, now).pass, true);
  assert.equal(rules.dataCoverage(months(2026, 6, 2), { firstTime: true }, now).pass, false);
  // Transition: six months instead of two years.
  assert.equal(rules.dataCoverage(months(2026, 4, 6), { transitionActive: true }, now).pass, true);
  assert.equal(rules.dataCoverage(months(2026, 4, 5), { transitionActive: true }, now).pass, false);
  assert.equal(rules.dataCoverage(months(2026, 4, 6), { firstTime: false }, now).pass, false);
});

// ─── KPIs ───────────────────────────────────────────────────────────────────

test('KPIs per guest-night and per occupied room with known numbers', () => {
  buildingEnergy._setCountryFactors({}); // global defaults only, no pending AM factors
  const est = { country: 'DE' };
  const records = [
    { kind: 'energy', source: 'electricity', unit: 'kWh', quantity: 10000, year: 2026, month: 1 },
    { kind: 'energy', source: 'electricity', unit: 'MWh', quantity: 10, year: 2026, month: 2 },
    { kind: 'water', source: 'municipal', unit: 'm3', quantity: 300, year: 2026, month: 1 },
    { kind: 'water', source: 'well', unit: 'm3', quantity: 100, year: 2026, month: 2, estimated: true, estimationMethod: 'tank_refills' },
    { kind: 'waste', source: 'mixed', unit: 'kg', quantity: 600, disposal: 'landfill', year: 2026, month: 1 },
    { kind: 'waste', source: 'paper', unit: 'kg', quantity: 400, disposal: 'recycled', year: 2026, month: 2 },
  ];
  const occ = [{ year: 2026, month: 1, guestNights: 1000, occupiedRooms: 500 }, { year: 2026, month: 2, guestNights: 1000, occupiedRooms: 500 }];
  const k = kpis.computeKpis(est, records, occ, { from: '2026-01', to: '2026-02' });
  assert.equal(k.period.months, 2);
  assert.equal(k.totals.kwh, 20000);
  assert.equal(k.intensities.kwhPerGuestNight, 10);
  assert.equal(k.intensities.litresPerGuestNight, 200);
  assert.equal(k.intensities.wasteKgPerGuestNight, 0.5);
  assert.equal(k.intensities.recyclingRatePct, 40);
  // DE legacy grid factor 0.381 → 7620 kgCO2e over 1000 occupied rooms.
  assert.equal(k.totals.scope2KgCo2e, 7620);
  assert.equal(k.intensities.kgCo2ePerOccupiedRoom, 7.62);
  assert.equal(k.estimatedShare, 16.7);
  assert.equal(k.marketBased, 'out_of_scope');
});

test('KPIs: Armenian pending factors surface as warnings; gas is Scope 1', () => {
  buildingEnergy._setCountryFactors({ AM: { emission: { electricity: { value: null, status: 'pending_source' } } } });
  const k = kpis.computeKpis({ country: 'AM' }, [
    { kind: 'energy', source: 'electricity', unit: 'kWh', quantity: 1000, year: 2026, month: 1 },
    { kind: 'energy', source: 'natural_gas', unit: 'kWh', quantity: 1000, year: 2026, month: 1 },
  ], [{ year: 2026, month: 1, guestNights: 100, occupiedRooms: 50 }], { from: '2026-01', to: '2026-01' });
  assert.ok(k.warnings.some((w) => /AM electricity grid factor is pending/.test(w)));
  assert.ok(k.totals.scope1KgCo2e > 200 && k.totals.scope1KgCo2e < 203); // 56,100 kg/TJ ≈ 0.202 kg/kWh
  assert.equal(k.totals.scope2KgCo2e, 450); // GLO default 0.45 used as fallback
  buildingEnergy._setCountryFactors(null);
});

// ─── Certificate timers and NCs (GK-27/28) ──────────────────────────────────

test('certificate timers: 24-month validity, surveillance 8–14 months, renewal 6–8 months before expiry', () => {
  const cert = { status: 'certified', validFrom: D('2025-01-15') };
  const t0 = lifecycle.certificateTimers(cert, D('2025-06-01'));
  assert.equal(t0.validTo, '2027-01-15');
  assert.equal(t0.surveillance.from, '2025-09-15');
  assert.equal(t0.surveillance.to, '2026-03-15');
  assert.equal(t0.surveillance.state, 'upcoming');
  assert.equal(t0.renewal.from, '2026-05-15');
  assert.equal(t0.renewal.to, '2026-07-15');
  assert.equal(lifecycle.certificateTimers(cert, D('2025-10-01')).surveillance.state, 'open');
  assert.ok(lifecycle.certificateTimers(cert, D('2025-10-01')).tasks.some((x) => x.key === 'surveillance'));
  assert.equal(lifecycle.certificateTimers({ ...cert, surveillanceDate: D('2025-11-01') }, D('2025-12-01')).surveillance.state, 'done');
  assert.equal(lifecycle.certificateTimers(cert, D('2026-04-01')).surveillance.state, 'overdue');
  const ren = lifecycle.certificateTimers(cert, D('2026-06-01'));
  assert.equal(ren.renewal.state, 'open');
  assert.ok(ren.tasks.some((x) => x.key === 'renewal'));
  const exp = lifecycle.certificateTimers(cert, D('2027-02-01'));
  assert.equal(exp.effectiveStatus, 'expired');
  assert.ok(exp.daysToExpiry < 0);
  const sus = lifecycle.certificateTimers({ ...cert, status: 'suspended' }, D('2025-06-01'));
  assert.ok(sus.tasks.some((x) => x.key === 'removeDisplay'));
});

test('non-conformities: default 2-month deadline, overdue, follow-up when more than 5 at one audit', () => {
  assert.equal(lifecycle.defaultNcDeadline(D('2026-01-31')).toISOString().slice(0, 10), '2026-03-31');
  const now = D('2026-11-09');
  const nc = (i, cert, st = 'open', deadline = '2026-12-01') => ({ id: String(i), certificationId: cert, status: st, deadline: D(deadline) });
  const five = [1, 2, 3, 4, 5].map((i) => nc(i, 'A'));
  assert.equal(lifecycle.ncSummary(five, now).followUpRequired, false);
  const six = [...five, nc(6, 'A', 'closed'), nc(7, 'B', 'open', '2026-10-01')];
  const s = lifecycle.ncSummary(six, now);
  assert.equal(s.followUpRequired, true);
  assert.equal(s.byAudit.find((g) => g.certificationId === 'A').total, 6);
  assert.equal(s.byAudit.find((g) => g.certificationId === 'B').followUpRequired, false);
  assert.equal(s.overdue, 1);
  assert.equal(s.open, 6);
});
