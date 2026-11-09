'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// nace.js — NACE Rev.2 code helpers for the Financed Emissions module (FE-05)
//
// Accepted forms: section letter ("I"), division ("55"), group ("55.1"),
// class ("55.10"), and the same with a leading section letter ("I55.10").
// Factor lookup walks exact code → 2-digit division → section letter.
// ─────────────────────────────────────────────────────────────────────────────

// NACE Rev.2 division ranges per section (Eurostat structure, divisions 01–99).
const SECTIONS = [
  ['A', 1, 3, 'Agriculture, forestry and fishing'],
  ['B', 5, 9, 'Mining and quarrying'],
  ['C', 10, 33, 'Manufacturing'],
  ['D', 35, 35, 'Electricity, gas, steam and air conditioning supply'],
  ['E', 36, 39, 'Water supply; sewerage, waste management and remediation'],
  ['F', 41, 43, 'Construction'],
  ['G', 45, 47, 'Wholesale and retail trade; repair of motor vehicles'],
  ['H', 49, 53, 'Transportation and storage'],
  ['I', 55, 56, 'Accommodation and food service activities'],
  ['J', 58, 63, 'Information and communication'],
  ['K', 64, 66, 'Financial and insurance activities'],
  ['L', 68, 68, 'Real estate activities'],
  ['M', 69, 75, 'Professional, scientific and technical activities'],
  ['N', 77, 82, 'Administrative and support service activities'],
  ['O', 84, 84, 'Public administration and defence; compulsory social security'],
  ['P', 85, 85, 'Education'],
  ['Q', 86, 88, 'Human health and social work activities'],
  ['R', 90, 93, 'Arts, entertainment and recreation'],
  ['S', 94, 96, 'Other service activities'],
  ['T', 97, 98, 'Activities of households as employers'],
  ['U', 99, 99, 'Activities of extraterritorial organisations and bodies'],
];

const SECTION_NAMES = Object.fromEntries(SECTIONS.map(([s, , , n]) => [s, n]));

// Format check only (not a full code list): letter, or 2 digits with an
// optional .d / .dd, optionally prefixed by the section letter.
const NACE_RE = /^([A-U])$|^([A-U])?(\d{2})(\.\d{1,2})?$/;

function isValidFormat(code) {
  return NACE_RE.test(String(code || '').trim().toUpperCase());
}

/** Section letter for a 2-digit division number, or null if unassigned. */
function sectionOfDivision(div) {
  const n = Number(div);
  const hit = SECTIONS.find(([, lo, hi]) => n >= lo && n <= hi);
  return hit ? hit[0] : null;
}

/**
 * Parse a code into { code, division, section } or null when the format is
 * wrong or the division does not exist in NACE Rev.2 (e.g. "04").
 */
function parse(code) {
  const c = String(code || '').trim().toUpperCase();
  const m = c.match(NACE_RE);
  if (!m) return null;
  if (m[1]) return { code: m[1], division: null, section: m[1] };
  const division = m[3];
  const section = sectionOfDivision(division);
  if (!section) return null;
  if (m[2] && m[2] !== section) return null; // "C55" — letter contradicts division
  return { code: `${division}${m[4] || ''}`, division, section };
}

/** Lookup keys in order: exact code → division → section (deduplicated). */
function lookupKeys(code) {
  const p = parse(code);
  if (!p) return [];
  return [...new Set([p.code, p.division, p.section].filter(Boolean))];
}

module.exports = { SECTIONS, SECTION_NAMES, isValidFormat, parse, lookupKeys, sectionOfDivision };
