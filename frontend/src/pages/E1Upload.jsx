import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Upload, FileSpreadsheet, FileImage, Loader2, ScanSearch, Sparkles, Database } from 'lucide-react';
import { HelpBanner, FieldLabel } from '../components/HelpSystem';
import ProcessingScreen from '../components/ProcessingScreen';
import DatabaseImport from '../components/DatabaseImport';

export default function E1Upload() {
  const [orgUnits, setOrgUnits] = useState([]);
  const [tab, setTab] = useState('excel');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [reportingYear, setReportingYear] = useState(new Date().getFullYear());
  const [file, setFile] = useState(null);
  const [docFiles, setDocFiles] = useState([]);
  const [extractMode, setExtractMode] = useState('Travel');
  const [uploading, setUploading] = useState(false);
  const [uploadId, setUploadId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();
  const docFileRef = useRef();
  const pollRef = useRef();

  useEffect(() => {
    api.getOrgUnits().then((units) => {
      setOrgUnits(units);
      if (units.length) setOrgUnitId(units[0].id);
    });
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (!uploadId) return;
    const poll = async () => {
      try {
        const p = await api.getE1Progress(uploadId);
        setProgress(p);
        if (p.status !== 'PROCESSING') clearInterval(pollRef.current);
      } catch {}
    };
    pollRef.current = setInterval(poll, 5000);
    poll();
    return () => clearInterval(pollRef.current);
  }, [uploadId]);

  const handleExcelUpload = async () => {
    if (!file || !orgUnitId) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('orgUnitId', orgUnitId);
      fd.append('reportingYear', reportingYear);
      const res = await api.uploadE1(fd);
      setUploadId(res.uploadId);
    } catch (err) {
      setError(err.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDocExtract = async () => {
    if (!docFiles.length) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      docFiles.forEach((f) => fd.append('files', f));
      fd.append('mode', extractMode);
      fd.append('orgUnitId', orgUnitId);
      fd.append('reportingYear', reportingYear);
      const res = await api.uploadDocExtract(fd);
      setUploadId(res.uploadId);
    } catch (err) {
      setError(err.error || err.message || 'Extraction failed');
    } finally {
      setUploading(false);
    }
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  // Show processing screen when upload is active
  if (uploadId) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">E1 — Connect Emissions Data</h1>
          <p className="text-gray-500 dark:text-gray-400">Processing your data for reporting year {reportingYear}...</p>
        </div>
        <ProcessingScreen progress={progress} status={progress?.status || 'PROCESSING'} type="E1" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">E1 — Connect Emissions Data</h1>
        <p className="text-gray-500 dark:text-gray-400">Upload spreadsheets, scan invoices, or connect a data source</p>
      </div>

      <HelpBanner
        id="e1-upload-guide"
        title="Two Ways to Connect Emissions Data"
        variant="info"
        steps={[
          'Select the reporting year and organizational unit first',
          'Spreadsheet: Upload Excel/CSV — AI maps columns and assigns scopes automatically',
          'Invoices & Receipts: Upload documents — AI reads and extracts emission data',
          'All data is assigned to your selected reporting year for consistent reporting',
        ]}
      />

      {/* AI badge */}
      <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 rounded-xl border border-emerald-200 dark:border-emerald-800">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-semibold text-emerald-900 dark:text-emerald-200">AI-Powered Emissions ETL</h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
              No templates required. Upload raw emissions data — AI identifies categories, maps columns, and calculates tCO2e.
            </p>
          </div>
        </div>
      </div>

      {/* Reporting year + org unit — shared across both tabs */}
      <div className="card">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel label="Reporting Year" required info="The ESG reporting year. All processed data will be assigned to this year for consistent reporting." />
            <select className="input" value={reportingYear} onChange={(e) => setReportingYear(parseInt(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel label="Organizational Unit" required info="The business unit this data belongs to." />
            <select className="input" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
              {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.country})</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        <button className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'excel' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`} onClick={() => setTab('excel')}>
          <FileSpreadsheet className="w-4 h-4 inline mr-1" /> Spreadsheet
        </button>
        <button className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'doc-extract' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`} onClick={() => setTab('doc-extract')}>
          <ScanSearch className="w-4 h-4 inline mr-1" /> Invoices & Receipts
        </button>
        <button className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'database' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`} onClick={() => setTab('database')}>
          <Database className="w-4 h-4 inline mr-1" /> Database
        </button>
      </div>

      {tab === 'excel' ? (
        <div className="card space-y-4">
          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-emerald-400 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files[0]); }}
          >
            <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files[0])} />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-green-500" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">Drop any emissions spreadsheet — AI auto-detects categories & scopes</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Any column names, any language, any units — 1 credit per row</p>
              </>
            )}
          </div>

          {error && <div className="p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>}
          <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={!file || uploading} onClick={handleExcelUpload}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {uploading ? 'Starting AI processing...' : `Process with AI for ${reportingYear}`}
          </button>
        </div>
      ) : tab === 'doc-extract' ? (
        <div className="card space-y-4">
          <div>
            <FieldLabel label="Document Type" info="Select the type of documents you're uploading for better extraction accuracy." />
            <select className="input" value={extractMode} onChange={(e) => setExtractMode(e.target.value)}>
              <option value="Travel">Travel (flights, trains, taxis)</option>
              <option value="Stay">Stay (hotels, accommodation)</option>
              <option value="Energy">Energy (electricity, gas, fuel bills)</option>
              <option value="Company Vehicle">Company Vehicle (fuel, mileage)</option>
            </select>
          </div>

          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-emerald-400 transition-colors cursor-pointer"
            onClick={() => docFileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setDocFiles([...docFiles, ...Array.from(e.dataTransfer.files)].slice(0, 20)); }}
          >
            <input ref={docFileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={(e) => setDocFiles([...docFiles, ...Array.from(e.target.files)].slice(0, 20))} />
            {docFiles.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {docFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-800 rounded px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <FileImage className="w-4 h-4 text-gray-400" />
                      <span className="truncate max-w-[300px]">{f.name}</span>
                      <span className="text-gray-400 text-xs">{(f.size / 1024).toFixed(0)} KB</span>
                    </div>
                    <button className="text-red-500 hover:text-red-700 text-xs font-medium" onClick={(e) => { e.stopPropagation(); setDocFiles(docFiles.filter((_, j) => j !== i)); }}>Remove</button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <ScanSearch className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">Drop invoices & receipts — AI reads any language, any format</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">PDF, JPG, PNG — up to 20 files, 10MB each — 2 credits per document</p>
              </>
            )}
          </div>

          {error && <div className="p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>}
          <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={!docFiles.length || uploading} onClick={handleDocExtract}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {uploading ? 'AI is reading documents...' : `Extract ${docFiles.length} Document${docFiles.length !== 1 ? 's' : ''} for ${reportingYear}`}
          </button>
        </div>
      ) : tab === 'database' ? (
        <DatabaseImport
          orgUnitId={orgUnitId}
          reportingYear={reportingYear}
          type="E1"
          onProcessingStarted={(id) => setUploadId(id)}
        />
      ) : null}
    </div>
  );
}
