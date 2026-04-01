import { useState, useEffect } from 'react';
import api from '../services/api';
import { FileText, Download, Loader2, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { HelpBanner, FieldLabel, InfoTip } from '../components/HelpSystem';

export default function Reports() {
  const [standards, setStandards] = useState([]);
  const [selectedStandard, setSelectedStandard] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [years, setYears] = useState([]);
  const [language, setLanguage] = useState('en');
  const [languages, setLanguages] = useState({});
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [allTopics, setAllTopics] = useState(true);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [companyDescription, setCompanyDescription] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    Promise.all([api.getStandards(), api.getLanguages(), api.getDataYears()]).then(([stds, langs, yrs]) => {
      setStandards(stds);
      setLanguages(langs);
      setYears(yrs.length > 0 ? yrs : [new Date().getFullYear()]);
      if (yrs.length > 0) setYear(yrs[0]);
      if (stds.length > 0) {
        setSelectedStandard(stds[0].key);
        setSelectedTopics(stds[0].topics.map((t) => t.key));
      }
    });
  }, []);

  const currentStandard = standards.find((s) => s.key === selectedStandard);

  const handleStandardChange = (key) => {
    setSelectedStandard(key);
    const std = standards.find((s) => s.key === key);
    if (std) setSelectedTopics(std.topics.map((t) => t.key));
    setAllTopics(true);
    setValidation(null);
  };

  const toggleTopic = (key) => {
    const next = selectedTopics.includes(key) ? selectedTopics.filter((t) => t !== key) : [...selectedTopics, key];
    setSelectedTopics(next);
    setAllTopics(next.length === currentStandard?.topics.length);
    setValidation(null);
  };

  const toggleAll = () => {
    if (allTopics) {
      setSelectedTopics([]);
      setAllTopics(false);
    } else {
      setSelectedTopics(currentStandard?.topics.map((t) => t.key) || []);
      setAllTopics(true);
    }
    setValidation(null);
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const result = await api.validateReport({ year, standard: selectedStandard, topics: selectedTopics });
      setValidation(result);
      setShowValidation(true);
    } catch (err) {
      alert(err.error || 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleGenerate = async (withoutMissing = false) => {
    setGenerating(true);
    try {
      await api.generateReportV2({
        year, standard: selectedStandard, topics: selectedTopics,
        language, format: 'pdf', generateWithoutMissing: withoutMissing,
        companyDescription,
      });
    } catch (err) {
      alert(err.error || 'Report generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const PILLAR_COLORS = {
    Environmental: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    Social: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
    Governance: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">ESG Report Generation</h1>
        <p className="text-gray-500 dark:text-gray-400">Generate standard-compliant sustainability reports from your connected data</p>
      </div>

      <HelpBanner id="reports-v2-guide" title="How Report Generation Works" variant="info">
        Select a reporting standard, choose the topics you want to include, and the system will validate your data
        coverage. Missing sections are flagged so you can review before generating. The report includes a cover page,
        table of contents, all disclosures aligned with the selected standard, and a standard index.
      </HelpBanner>

      {/* Step 1: Standard selection */}
      <div className="card space-y-4">
        <FieldLabel label="Reporting Standard" required info="The ESG framework your report will be aligned with. This determines the structure, required disclosures, and index format." />
        <div className="grid grid-cols-2 gap-3">
          {standards.map((s) => (
            <button
              key={s.key}
              onClick={() => handleStandardChange(s.key)}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                selectedStandard === s.key
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 ring-1 ring-brand-400'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              <p className="font-semibold text-sm">{s.key}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{s.name}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.framework} {s.version}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Year + Language */}
      <div className="card">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <FieldLabel label="Reporting Year" required />
            <select className="input" value={year} onChange={(e) => { setYear(parseInt(e.target.value)); setValidation(null); }}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel label="Language" />
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {Object.entries(languages).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel label="Company Description" info="Optional brief description for the cover page." />
            <input className="input" placeholder="e.g., Leading manufacturer..." value={companyDescription} onChange={(e) => setCompanyDescription(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Step 3: Topic selection */}
      {currentStandard && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <FieldLabel label="Report Topics" required info="Select which ESG topics to include. Deselected topics won't appear in the report." />
            <button onClick={toggleAll} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
              {allTopics ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="space-y-2">
            {currentStandard.topics.map((t) => (
              <label key={t.key} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                selectedTopics.includes(t.key) ? 'border-brand-400 bg-brand-50/50 dark:bg-brand-950/30' : 'border-gray-200 dark:border-gray-700'
              }`}>
                <input type="checkbox" className="w-4 h-4 rounded accent-brand-600" checked={selectedTopics.includes(t.key)} onChange={() => toggleTopic(t.key)} />
                <div className="flex-1">
                  <p className="font-medium text-sm">{t.code} — {t.name}</p>
                </div>
                <span className={`badge text-[10px] ${PILLAR_COLORS[t.pillar] || 'bg-gray-100 text-gray-600'}`}>{t.pillar}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Validate */}
      <button onClick={handleValidate} disabled={validating || selectedTopics.length === 0} className="btn-secondary w-full flex items-center justify-center gap-2">
        {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
        {validating ? 'Checking data coverage...' : 'Validate Data Coverage'}
      </button>

      {/* Validation results */}
      {validation && showValidation && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Data Coverage Report</h3>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{validation.available.length}</p>
              <p className="text-[10px] text-green-600 dark:text-green-500">Disclosures with data</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-700 dark:text-red-400">{validation.missing.length}</p>
              <p className="text-[10px] text-red-600 dark:text-red-500">Missing metric data</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                {validation.topics.reduce((s, t) => s + t.disclosures.filter(d => d.isNarrative).length, 0)}
              </p>
              <p className="text-[10px] text-amber-600 dark:text-amber-500">Narrative sections</p>
            </div>
          </div>

          {/* Topic details */}
          {validation.topics.map((topic) => (
            <div key={topic.key} className="border dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 font-semibold text-sm flex items-center gap-2">
                <span className={`badge text-[10px] ${PILLAR_COLORS[topic.pillar]}`}>{topic.pillar}</span>
                {topic.code} — {topic.name}
              </div>
              <div className="divide-y dark:divide-gray-700">
                {topic.disclosures.map((disc) => (
                  <div key={disc.code} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    {disc.hasData ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    ) : disc.isNarrative ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    )}
                    <span className="font-mono text-gray-400 w-14 shrink-0">{disc.code}</span>
                    <span className="flex-1 text-gray-700 dark:text-gray-300">{disc.name}</span>
                    {disc.hasData && <span className="text-green-600">{disc.count} records</span>}
                    {disc.isNarrative && <span className="text-amber-500">Narrative</span>}
                    {!disc.hasData && !disc.isNarrative && <span className="text-red-500">No data</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Generate buttons */}
          <div className="space-y-2 pt-2">
            {validation.missing.length === 0 ? (
              <button onClick={() => handleGenerate(false)} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {generating ? 'Generating report...' : 'Generate Full Report'}
              </button>
            ) : (
              <>
                <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
                  <strong>{validation.missing.length} disclosure(s)</strong> are missing quantitative data.
                  You can still generate the report — missing sections will be marked for manual completion.
                </div>
                <button onClick={() => handleGenerate(true)} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {generating ? 'Generating report...' : `Generate Report (${validation.missing.length} sections incomplete)`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ESRS compliance note */}
      <div className="card bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="flex gap-3">
          <FileText className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Report Contents</h3>
            <ul className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5 list-disc ml-4">
              <li>Cover page with company name, standard, and reporting year</li>
              <li>Table of contents with section numbers</li>
              <li>About This Report section with company details</li>
              <li>Standard-specific topic sections with all disclosures</li>
              <li>Metrics populated from your connected data</li>
              <li>Narrative placeholders for qualitative disclosures</li>
              <li>Standard index with data coverage status per disclosure</li>
              <li>Missing data notice (if applicable)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
