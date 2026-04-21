import { useEffect, useState } from 'react';
import api from '../services/api';
import {
  Loader2, CheckCircle, Clock, Sparkles, ChevronDown, ChevronUp,
  Info, X, FileText, BarChart3, Hash,
} from 'lucide-react';

const CATEGORY_LABELS = {
  environmental: 'Environmental',
  social: 'Social',
  governance: 'Governance',
  product: 'Product',
};

const CATEGORY_ACCENT = {
  environmental: { border: 'border-l-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400' },
  social: { border: 'border-l-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-400' },
  governance: { border: 'border-l-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400' },
  product: { border: 'border-l-brand-500', bg: 'bg-brand-50 dark:bg-brand-950/30', text: 'text-brand-700 dark:text-brand-400' },
};

// KPI explanations — shown when the user clicks on a KPI.
// Maps code prefixes and specific codes to plain-English descriptions.
const KPI_EXPLANATIONS = {
  'TC-HW': { source: 'SASB Technology & Communications — Hardware', guidance: 'Report from your product compliance database. Covers IEC 62474 substance declarations, ENERGY STAR and EPEAT certifications, and e-waste take-back programs.' },
  'TC-SC': { source: 'SASB Technology & Communications — Semiconductors', guidance: 'Report from your fab/assembly site data (energy, water, waste meters), HR systems (workforce visa status, labor costs), and supply chain audit records.' },
  'TR-AU': { source: 'SASB Transportation — Automobiles', guidance: 'Report from your fleet sales records (fuel economy by model), safety testing results (NCAP ratings, recall data), and HR systems (collective bargaining, work stoppages).' },
  'SCOPE3': { source: 'GHG Protocol Scope 3 Standard', guidance: 'Auto-computed from your uploaded emissions data. Upload more invoices/data to improve this number.' },
  'E1-': { source: 'ESRS E1 — Climate Change', guidance: 'Auto-computed from your E1 emissions data uploaded through the Climate & Emissions module.' },
  'E5-': { source: 'ESRS E5 — Resource Use & Circular Economy', guidance: 'Report from your waste management and materials tracking systems.' },
  'PCF-': { source: 'Product Carbon Footprint Module', guidance: 'Auto-computed from your PCF calculations. Create products, upload BOMs, and run calculations to populate this.' },
  'RBA': { source: 'Responsible Business Alliance Code of Conduct', guidance: 'Report from your supplier audit management system. Track which Tier-1 suppliers have been audited and their VAP closure status.' },
  'CMRT': { source: 'Conflict Minerals Reporting Template (OECD)', guidance: 'Report from your smelter due-diligence program. Identify 3TG (tin, tantalum, tungsten, gold) smelters and their RMI compliance.' },
  'ROHS': { source: 'EU RoHS Directive / REACH Regulation', guidance: 'Report from your product compliance system. Track which SKUs contain restricted substances above thresholds.' },
  'REACH': { source: 'EU REACH Regulation', guidance: 'Report from your product compliance system. Track SVHCs (Substances of Very High Concern) above 0.1% w/w.' },
  'GRESB': { source: 'GRESB Real Estate Assessment', guidance: 'Report from your property management systems (energy meters, water meters, waste haulers, green certifications).' },
  'CRREM': { source: 'Carbon Risk Real Estate Monitor', guidance: 'Auto-computed by the CRREM engine from your asset energy records. Upload energy data per building to activate.' },
  'RE-': { source: 'Real Estate Module', guidance: 'Report from your asset and property management data.' },
  'PCAF': { source: 'Partnership for Carbon Accounting Financials', guidance: 'Auto-computed from your financial exposures. Add counterparty data and run PCAF calculations.' },
  'SFDR': { source: 'EU Sustainable Finance Disclosure Regulation', guidance: 'Derived from PCAF financed emissions calculations and counterparty ESG data.' },
  'PAI': { source: 'SFDR Principal Adverse Impact Indicators', guidance: 'The 14 mandatory + voluntary PAI indicators. Most derive from the same counterparty emissions data used for PCAF.' },
  'BATTERY': { source: 'EU Battery Regulation (2023/1542)', guidance: 'Report from your battery production data. Covers carbon footprint per kWh and recycled content in active materials.' },
  'CATENA': { source: 'Catena-X Automotive Data Space', guidance: 'Auto-computed: counts products with PCF calculations that can be exported in PACT Pathfinder format for OEM data exchange.' },
  'ZEV': { source: 'EU Fleet CO2 Regulation', guidance: 'Report from your vehicle sales database. Track zero-emission vehicle share against regulatory targets.' },
  'FLEET': { source: 'EU Fleet CO2 Regulation (2019/631)', guidance: 'Report from your fleet sales and homologation records. EU targets: 93.6 g/km (2025), 49.5 g/km (2030), 0 g/km (2035).' },
  'NZBA': { source: 'Net-Zero Banking Alliance', guidance: 'Report from your portfolio decarbonization targets and progress tracking.' },
  'EU_TAX': { source: 'EU Taxonomy Regulation', guidance: 'Report from your taxonomy alignment assessment. Track which activities meet the technical screening criteria.' },
};

function getExplanation(code) {
  // Try exact match first, then prefix match
  for (const [prefix, info] of Object.entries(KPI_EXPLANATIONS)) {
    if (code.startsWith(prefix) || code.includes(prefix)) return info;
  }
  return { source: 'Industry standard', guidance: 'This metric is required by your sector\'s reporting frameworks. Check the framework documentation for detailed reporting guidance.' };
}

function isNarrativeKpi(kpi) {
  return kpi.unit === 'narrative' || kpi.unit?.includes('narrative');
}

// ─── KPI Detail Popup ───────────────────────────────────────────────────────
function KpiPopup({ kpi, onClose }) {
  const explanation = getExplanation(kpi.code);
  const isNarrative = isNarrativeKpi(kpi);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-[11px] font-mono text-gray-400">{kpi.code}</p>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mt-0.5">{kpi.name}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="badge bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px]">{kpi.framework}</span>
          <span className={`badge text-[10px] ${CATEGORY_ACCENT[kpi.category]?.bg} ${CATEGORY_ACCENT[kpi.category]?.text}`}>
            {CATEGORY_LABELS[kpi.category] || kpi.category}
          </span>
          {isNarrative ? (
            <span className="badge bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-[10px] flex items-center gap-1">
              <FileText className="w-3 h-3" /> Narrative disclosure
            </span>
          ) : (
            <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-[10px] flex items-center gap-1">
              {kpi.unit?.includes('%') ? <BarChart3 className="w-3 h-3" /> : <Hash className="w-3 h-3" />}
              Quantitative · {kpi.unit}
            </span>
          )}
        </div>

        {kpi.computed && kpi.value !== null && (
          <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
            <p className="text-xs text-green-600 dark:text-green-400 font-semibold">Current value</p>
            <p className="text-xl font-bold text-green-800 dark:text-green-200 mt-0.5">
              {typeof kpi.value === 'number' ? kpi.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : kpi.value}
              {kpi.unit && !isNarrative && <span className="text-sm font-normal ml-1">{kpi.unit.split(';')[0]}</span>}
            </p>
            {kpi.detail && <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">{kpi.detail}</p>}
          </div>
        )}

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300">Source framework</p>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">{explanation.source}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300">
              {isNarrative ? 'What to write' : 'Where the data comes from'}
            </p>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">{explanation.guidance}</p>
          </div>
          {isNarrative && (
            <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg text-xs text-purple-700 dark:text-purple-400">
              <strong>This is a narrative disclosure</strong> — it requires a written description rather than a number.
              You can draft this text in the Reports module when generating your sustainability report.
              The report generator will include a placeholder section with guidance on what to cover.
            </div>
          )}
          {!kpi.computed && !isNarrative && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-xs text-amber-700 dark:text-amber-400">
              <strong>Not yet reported</strong> — this metric doesn't have data in the system yet.
              Upload the relevant data through the appropriate module, or enter it manually in your next reporting cycle.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function SectorKpiTiles({ year, className = '' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getSectorKpis(year).then((d) => {
      if (!cancelled) setData(d);
    }).catch(() => {
      if (!cancelled) setData(null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [year]);

  if (loading) return null;
  if (!data || !data.selected || data.kpis.length === 0) return null;

  const computedKpis = data.kpis.filter((k) => k.computed);
  const pendingKpis = data.kpis.filter((k) => !k.computed);
  const visiblePending = pendingExpanded ? pendingKpis : pendingKpis.slice(0, 4);

  return (
    <div className={`${className}`}>
      {/* Collapsible header — always visible */}
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        className="w-full flex items-center justify-between py-3 group"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-500" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {data.packName} KPIs
          </h3>
          <span className="text-[10px] text-gray-400">v{data.packVersion}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" /> {data.summary.computedKpis} computed
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-500" /> {data.summary.pendingKpis} pending
            </span>
          </div>
          {sectionOpen
            ? <ChevronUp className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
            : <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
          }
        </div>
      </button>

      {/* Collapsible body */}
      {sectionOpen && (
        <div className="space-y-4 pb-2">
          {/* Framework chips */}
          <div className="flex flex-wrap gap-1">
            {data.frameworks.map((f) => (
              <span key={f} className="text-[9px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">
                {f}
              </span>
            ))}
          </div>

          {/* Computed KPIs — clickable tiles */}
          {computedKpis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {computedKpis.map((kpi) => {
                const accent = CATEGORY_ACCENT[kpi.category] || CATEGORY_ACCENT.product;
                return (
                  <button
                    key={kpi.id}
                    type="button"
                    onClick={() => setSelectedKpi(kpi)}
                    className={`rounded-lg border-l-4 ${accent.border} bg-white dark:bg-gray-900 shadow-sm p-3 text-left hover:shadow-md transition-shadow cursor-pointer`}
                  >
                    <div className="flex items-start justify-between">
                      <p className="text-[10px] font-mono text-gray-400">{kpi.code}</p>
                      <Info className="w-3 h-3 text-gray-300 hover:text-brand-500 shrink-0" />
                    </div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 line-clamp-2 mt-0.5">{kpi.name}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {typeof kpi.value === 'number' ? kpi.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : kpi.value}
                      {kpi.unit && !isNarrativeKpi(kpi) && (
                        <span className="text-xs font-normal text-gray-400 ml-1">{kpi.unit.split(';')[0]}</span>
                      )}
                    </p>
                    {kpi.detail && <p className="text-[10px] text-gray-400 mt-0.5">{kpi.detail}</p>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Pending KPIs — muted, no colored borders, clickable for explanation */}
          {pendingKpis.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-500" />
                Not yet reported ({pendingKpis.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {visiblePending.map((kpi) => (
                  <button
                    key={kpi.id}
                    type="button"
                    onClick={() => setSelectedKpi(kpi)}
                    className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                  >
                    <div className="w-1 h-8 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-mono text-gray-400">{kpi.code}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{kpi.name}</p>
                    </div>
                    {isNarrativeKpi(kpi) ? (
                      <FileText className="w-3 h-3 text-purple-400 shrink-0" title="Narrative disclosure" />
                    ) : (
                      <span className="text-[9px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded shrink-0">
                        {kpi.framework}
                      </span>
                    )}
                    <Info className="w-3 h-3 text-gray-300 shrink-0" />
                  </button>
                ))}
              </div>
              {pendingKpis.length > 4 && (
                <button
                  onClick={() => setPendingExpanded((v) => !v)}
                  className="text-xs text-brand-600 hover:underline flex items-center gap-1 mt-1"
                >
                  {pendingExpanded ? <><ChevronUp className="w-3 h-3" /> Show fewer</> : <><ChevronDown className="w-3 h-3" /> Show all {pendingKpis.length}</>}
                </button>
              )}
            </div>
          )}

          {/* Summary bar */}
          <div className="flex items-center gap-4 text-[10px] text-gray-400 pt-1 border-t dark:border-gray-800">
            {data.summary.totalEmissions > 0 && <span>Emissions: {data.summary.totalEmissions.toFixed(1)} tCO2e</span>}
            {data.summary.totalEmployees > 0 && <span>Employees: {data.summary.totalEmployees}</span>}
            {data.summary.productCount > 0 && <span>Products: {data.summary.productCount}</span>}
            {data.summary.pcfCoveragePct > 0 && <span>PCF coverage: {data.summary.pcfCoveragePct.toFixed(0)}%</span>}
            {data.summary.hasSbti && <span>SBTi: active</span>}
          </div>
        </div>
      )}

      {/* KPI explanation popup */}
      {selectedKpi && (
        <KpiPopup kpi={selectedKpi} onClose={() => setSelectedKpi(null)} />
      )}
    </div>
  );
}
