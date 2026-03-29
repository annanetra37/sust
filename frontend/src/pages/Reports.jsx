import { useState, useEffect } from 'react';
import api from '../services/api';
import { FileText, Download, Loader2 } from 'lucide-react';
import { HelpBanner, FieldLabel } from '../components/HelpSystem';

export default function Reports() {
  const [languages, setLanguages] = useState({});
  const [year, setYear] = useState(new Date().getFullYear());
  const [format, setFormat] = useState('pdf');
  const [language, setLanguage] = useState('en');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.getLanguages().then(setLanguages).catch(() => {});
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.generateReport({ year, format, language });
    } catch (err) {
      alert(err.error || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ESG Reports</h1>
        <p className="text-gray-500">Generate ESRS (CSRD) compliant ESG compliance reports</p>
      </div>

      <HelpBanner
        id="reports-guide"
        title="ESG Compliance Reports"
        variant="info"
      >
        Generate reports based on your uploaded E1 (Climate) and S1 (Workforce) data.
        Reports follow the ESRS standard under CSRD and can be downloaded in PDF or Word format in 7 languages.
        Make sure you've uploaded data for the selected year before generating.
      </HelpBanner>

      <div className="card space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <FieldLabel label="Year" required info="The reporting year. Only data uploaded for this year will be included in the report." />
            <select className="input" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel label="Format" info="PDF is best for sharing. DOCX allows editing the report content before finalizing." />
            <select className="input" value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="pdf">PDF</option>
              <option value="docx">Word (DOCX)</option>
            </select>
          </div>
          <div>
            <FieldLabel label="Language" info="The language for report headers and labels. Data values remain as uploaded." />
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {Object.entries(languages).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        <button className="btn-primary w-full flex items-center justify-center gap-2" onClick={handleGenerate} disabled={generating}>
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {generating ? 'Generating...' : 'Generate & Download Report'}
        </button>
      </div>

      <div className="card bg-amber-50 border-amber-200">
        <div className="flex gap-3">
          <FileText className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-900">ESRS Compliant</h3>
            <p className="text-sm text-amber-700 mt-1">Reports follow the European Sustainability Reporting Standards (ESRS) under the Corporate Sustainability Reporting Directive (CSRD). Includes E1 Climate Change and S1 Own Workforce disclosures.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
