'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// lifecycle.js — certificate timers and non-conformity counters (GK-27/28). Pure.
//
//   Validity      24 months from validFrom unless validTo is set
//   Surveillance  window 8–14 months after validFrom (certification date)
//   Renewal       contact window 6–8 months before expiry
//   Suspension    creates a "remove certificate display" task
//   NCs           deadline raisedAt + 2 months by default; more than 5 NCs
//                 raised at one audit → follow-up audit required
// ─────────────────────────────────────────────────────────────────────────────

const { addMonths } = require('./rules');

const DAY = 86400000;
const VALIDITY_MONTHS = 24;
const NC_DEADLINE_MONTHS = 2;
const NC_FOLLOW_UP_THRESHOLD = 5;
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function defaultValidTo(validFrom) {
  return validFrom ? addMonths(new Date(validFrom), VALIDITY_MONTHS) : null;
}

function windowState(from, to, now, done) {
  if (done) return 'done';
  if (now < from) return 'upcoming';
  if (now <= to) return 'open';
  return 'overdue';
}

/**
 * Timers for one certificate.
 * Returns { effectiveStatus, validTo, daysToExpiry, surveillance: {from,to,state},
 *           renewal: {from,to,state}, tasks: [{ key, label, due }] }.
 */
function certificateTimers(cert, now = new Date()) {
  const validFrom = cert.validFrom ? new Date(cert.validFrom) : null;
  const validTo = cert.validTo ? new Date(cert.validTo) : defaultValidTo(validFrom);
  let effectiveStatus = cert.status;
  if (cert.status === 'certified' && validTo && now > validTo) effectiveStatus = 'expired';
  const out = {
    effectiveStatus,
    validFrom: iso(validFrom),
    validTo: iso(validTo),
    daysToExpiry: validTo ? Math.ceil((validTo - now) / DAY) : null,
    surveillance: null,
    renewal: null,
    tasks: [],
  };
  const live = effectiveStatus === 'certified';
  if (validFrom) {
    const from = addMonths(validFrom, 8);
    const to = addMonths(validFrom, 14);
    out.surveillance = { from: iso(from), to: iso(to), state: windowState(from, to, now, !!cert.surveillanceDate), date: iso(cert.surveillanceDate) };
    if (live && out.surveillance.state === 'open') out.tasks.push({ key: 'surveillance', label: 'Surveillance visit window is open', due: iso(to), severity: 'warning' });
    if (live && out.surveillance.state === 'overdue') out.tasks.push({ key: 'surveillanceOverdue', label: 'Surveillance visit window has passed without a recorded visit', due: iso(to), severity: 'critical' });
  }
  if (validTo) {
    const from = addMonths(validTo, -8);
    const to = addMonths(validTo, -6);
    out.renewal = { from: iso(from), to: iso(to), state: windowState(from, to, now, false) };
    if (live && out.renewal.state === 'open') out.tasks.push({ key: 'renewal', label: 'Contact the certification body about renewal', due: iso(to), severity: 'warning' });
    if (live && (out.renewal.state === 'overdue')) out.tasks.push({ key: 'renewalLate', label: 'Renewal contact window passed — renew before expiry', due: iso(validTo), severity: 'critical' });
  }
  if (effectiveStatus === 'suspended') out.tasks.push({ key: 'removeDisplay', label: 'Remove certificate display (plaque, website, booking channels) while suspended', due: null, severity: 'critical' });
  if (effectiveStatus === 'expired' && cert.status === 'certified') out.tasks.push({ key: 'expired', label: 'Certificate has expired — remove display and re-apply', due: iso(validTo), severity: 'critical' });
  return out;
}

function defaultNcDeadline(raisedAt) {
  return addMonths(raisedAt ? new Date(raisedAt) : new Date(), NC_DEADLINE_MONTHS);
}

/**
 * Non-conformity summary. ncs: [{ id, certificationId, status, deadline }]
 * Returns { open, overdue, byAudit: [{ certificationId, total, open, followUpRequired }] }.
 */
function ncSummary(ncs, now = new Date()) {
  const list = ncs || [];
  const open = list.filter((n) => n.status === 'open');
  const overdue = open.filter((n) => n.deadline && new Date(n.deadline) < now);
  const groups = new Map();
  for (const n of list) {
    const k = n.certificationId || null;
    if (!groups.has(k)) groups.set(k, { certificationId: k, total: 0, open: 0 });
    const g = groups.get(k);
    g.total++;
    if (n.status === 'open') g.open++;
  }
  const byAudit = [...groups.values()].map((g) => ({ ...g, followUpRequired: g.total > NC_FOLLOW_UP_THRESHOLD }));
  return { open: open.length, overdue: overdue.length, total: list.length, byAudit, followUpRequired: byAudit.some((g) => g.followUpRequired) };
}

module.exports = { certificateTimers, defaultValidTo, defaultNcDeadline, ncSummary, VALIDITY_MONTHS, NC_FOLLOW_UP_THRESHOLD };
