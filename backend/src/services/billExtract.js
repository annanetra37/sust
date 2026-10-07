'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// billExtract.js — read an energy bill (PDF / photo) into draft energy records
//
// Used by POST /api/real-estate/assets/:id/bills/extract.  The result is a
// DRAFT: the user reviews and corrects it on the Building Energy page before
// anything is saved, so a misread number never lands in the KPIs silently.
//
// Pipeline (same as E1 doc-extract): text layer via docExtract → Claude text
// prompt; scanned PDFs and photos → Claude vision.  Output is normalised to the
// fuels/units that services/buildingEnergy.js accepts.
// ─────────────────────────────────────────────────────────────────────────────

const Anthropic = require('@anthropic-ai/sdk').default;
const config = require('../config');
const { trackedAICall } = require('../utils/costTracker');
const { extractText } = require('./docExtract');
const buildingEnergy = require('./buildingEnergy');

let client;
function getClient() {
  if (!client) {
    if (!config.anthropic.apiKey) throw new Error('AI extraction is not configured (ANTHROPIC_API_KEY missing).');
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

const PROMPT = `You read utility bills for building energy accounting. The bill may be in Armenian, Russian or English, scanned, photographed or partly handwritten.

Useful words:
- Armenian: կՎտ·ժ / կՎտժ = kWh, խ.մ / մ³ = cubic metre, դրամ / դր. = AMD, ծախս / սպառում = consumption, վճարման ենթակա գումար = amount due, ցուցմունք = meter reading, ժամանակահատված = period
- Russian: кВт·ч = kWh, м³ = cubic metre, драм = AMD, расход / потребление = consumption, сумма к оплате = amount due, показания = meter reading, период = period
- Suppliers: "Gazprom Armenia" / Գազպրոմ Արմենիա = natural gas; "Electric Networks of Armenia" / ՀԷՑ / ENA = electricity

Return one item per fuel per billing period on the bill. For each item:
- fuel: one of electricity, natural_gas, district_heat, lpg, biomass, oil
- quantity: the CONSUMPTION for the period (if only meter readings are shown, current minus previous), never the meter reading itself
- unit: as billed — kWh, MWh, Gcal, m3, litre or kg
- periodStart, periodEnd: billing period dates (YYYY-MM-DD) if shown
- month: billing month as YYYY-MM if only a month is shown
- cost: total amount for this fuel including taxes, as a number without separators
- currency: ISO code (AMD for dram)
- meterPrevious, meterCurrent: readings if shown, else null
- evidence: the exact text you read the quantity from (short)

Do not guess numbers you cannot read; use null and explain in notes.

Return ONLY JSON:
{"items":[{"fuel":"natural_gas","quantity":1234,"unit":"m3","periodStart":"2025-01-01","periodEnd":"2025-01-31","month":null,"cost":185100,"currency":"AMD","meterPrevious":null,"meterCurrent":null,"evidence":"Ծախս 1234 խ.մ"}],"supplier":"Gazprom Armenia","accountNumber":"...","confidence":0.9,"notes":""}
If the document is not an energy bill: {"items":[],"confidence":0,"notes":"reason"}`;

const MIME_BY_EXT = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

async function callModel(file, costCtx) {
  const t = await extractText(file);
  let content;
  if (t.text && t.text.length >= 20) {
    content = `${PROMPT}\n\n## Bill text\n${t.text.slice(0, 12000)}`;
  } else {
    const ext = (file.originalname || '').split('.').pop().toLowerCase();
    const mime = t.mime || file.mimetype || MIME_BY_EXT[ext] || 'image/jpeg';
    const data = (t.buffer || file.buffer).toString('base64');
    const block = mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data } };
    content = [block, { type: 'text', text: PROMPT }];
  }
  const params = { model: config.anthropic.model, max_tokens: 4096, messages: [{ role: 'user', content }] };
  const response = await trackedAICall(getClient(), params, { ...costCtx, operation: 'AI_BILL_EXTRACT' });
  if (response.stop_reason === 'refusal') return { items: [], confidence: 0, notes: 'The AI declined to read this document.' };
  const text = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { items: [], confidence: 0, notes: 'Could not read a structured answer from the AI.' };
  try { return JSON.parse(m[0]); } catch { return { items: [], confidence: 0, notes: 'Could not parse the AI answer.' }; }
}

// ─── Normalisation ──────────────────────────────────────────────────────────

const FUEL_ALIASES = [
  [/electric|power|grid|էլեկտր|электр/i, 'electricity'],
  [/natural.?gas|^gas$|գազ|газ/i, 'natural_gas'],
  [/district|heat|ջերմ|тепл/i, 'district_heat'],
  [/lpg|propane|сжиж/i, 'lpg'],
  [/wood|biomass|pellet|փայտ|дров/i, 'biomass'],
  [/diesel|heating.?oil|oil|дизел|мазут/i, 'oil'],
];

function normaliseFuel(f) {
  const s = String(f || '').trim();
  if (buildingEnergy.isValidFuel(s)) return s;
  for (const [re, key] of FUEL_ALIASES) if (re.test(s)) return key;
  return null;
}

// Armenian / Russian unit spellings → canonical units.
const UNIT_ALIASES = [
  [/^(խ\.?\s?մ\.?|մ³|մ3|м³|м3|куб\.?\s?м\.?|cubic\s*met(er|re)s?)$/i, 'm3'],
  [/^(կՎտ\s?[·.]?\s?ժ|кВт\s?[·.]?\s?ч)$/i, 'kWh'],
  [/^(ՄՎտ\s?[·.]?\s?ժ|МВт\s?[·.]?\s?ч)$/i, 'MWh'],
  [/^(Գկալ|Гкал)$/i, 'Gcal'],
  [/^(լ|լիտր|л|литр(ов)?)$/i, 'litre'],
  [/^(կգ|кг)$/i, 'kg'],
];

function normaliseBillUnit(u) {
  const direct = buildingEnergy.normaliseUnit(u);
  if (direct) return direct;
  const s = String(u || '').trim();
  for (const [re, unit] of UNIT_ALIASES) if (re.test(s)) return unit;
  return null;
}

const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[\s, ]/g, ''));
  return isFinite(n) ? n : null;
};
const isoDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v)) ? v : null);

/**
 * Turn raw AI items into draft records shaped for the bulk endpoint, each
 * with a list of problems the reviewer must look at.
 */
function toDrafts(raw) {
  const today = new Date().toISOString().slice(0, 10);
  return (raw.items || []).map((it) => {
    const issues = [];
    const fuel = normaliseFuel(it.fuel);
    if (!fuel) issues.push(`Unknown fuel "${it.fuel ?? ''}"`);
    let unit = normaliseBillUnit(it.unit);
    if (!unit) issues.push(`Unknown unit "${it.unit ?? ''}"`);
    else if (fuel && !buildingEnergy.isValidUnit(fuel, unit)) issues.push(`Unit ${unit} is not valid for ${fuel}`);
    if (!unit && fuel) unit = buildingEnergy.FUELS[fuel].units[0];

    let quantity = num(it.quantity);
    const prev = num(it.meterPrevious);
    const curr = num(it.meterCurrent);
    if (quantity == null && prev != null && curr != null && curr > prev) quantity = curr - prev;
    if (!(quantity > 0)) issues.push('Consumption could not be read');

    let periodStart = isoDate(it.periodStart);
    let periodEnd = isoDate(it.periodEnd);
    let year = null; let month = null;
    if (periodStart && periodEnd && periodEnd >= periodStart) {
      // A bill covering exactly one calendar month is stored as that month.
      const s = new Date(periodStart); const e = new Date(periodEnd);
      const lastDay = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 0)).getUTCDate();
      if (s.getUTCDate() === 1 && e.getUTCDate() === lastDay && s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
        year = s.getUTCFullYear(); month = s.getUTCMonth() + 1; periodStart = null; periodEnd = null;
      } else {
        year = e.getUTCFullYear();
      }
    } else {
      periodStart = null; periodEnd = null;
      const m = /^(\d{4})-(\d{2})/.exec(String(it.month || '')) || /^(\d{4})-(\d{2})/.exec(String(it.periodEnd || it.periodStart || ''));
      if (m) { year = Number(m[1]); month = Number(m[2]); } else issues.push('Billing period could not be read');
    }
    if ((periodEnd && periodEnd > today) || (year && month && `${year}-${String(month).padStart(2, '0')}` > today.slice(0, 7))) {
      issues.push('Billing period is in the future');
    }

    const cost = num(it.cost);
    return {
      fuel: fuel || 'electricity',
      quantity,
      unit,
      year,
      month,
      periodStart,
      periodEnd,
      cost: cost != null && cost >= 0 ? cost : null,
      currency: it.currency ? String(it.currency).toUpperCase().slice(0, 3) : 'AMD',
      evidence: it.evidence ? String(it.evidence).slice(0, 200) : null,
      issues,
    };
  });
}

/**
 * Extract draft records from one uploaded bill.
 * @returns {{ drafts, confidence, supplier, notes }}
 */
async function extractBill(file, costCtx) {
  const raw = await callModel(file, costCtx);
  return {
    drafts: toDrafts(raw),
    confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
    supplier: raw.supplier || null,
    notes: raw.notes || '',
  };
}

module.exports = { extractBill, toDrafts, normaliseFuel, normaliseBillUnit };
