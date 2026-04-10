import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Upload, FileSpreadsheet, FileImage, Loader2, ScanSearch, Sparkles, Database } from 'lucide-react';
import { HelpBanner, FieldLabel } from '../components/HelpSystem';
import ProcessingScreen from '../components/ProcessingScreen';
import DatabaseImport from '../components/DatabaseImport';
import ConfirmCreditsModal from '../components/ConfirmCreditsModal';

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

  // Credit preview modal state
  const [estimate, setEstimate] = useState(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState('');
  const [pendingAction, setPendingAction] = useState(null); // 'excel' | 'doc-extract'

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

  // ─── Credit preview + confirm flow ───────────────────────────────────
  const openEstimate = async (action) => {
    setEstimateError('');
    setEstimate(null);
    setPendingAction(action);
    setEstimateLoading(true);
    try {
      let body;
      if (action === 'excel') {
        if (!file || !orgUnitId) { setPendingAction(null); return; }
        body = { action: 'excel-e1', params: { fileSizeBytes: file.size } };
      } else if (action === 'doc-extract') {
        if (!docFiles.length) { setPendingAction(null); return; }
        body = { action: 'doc-extract', params: { fileCount: docFiles.length, assumeVision: true } };
      }
      const est = await api.estimateCredits(body);
      setEstimate(est);
    } catch (err) {
      setEstimateError(err.error || err.message || 'Could not calculate estimated cost');
    } finally {
      setEstimateLoading(false);
    }
  };

  const cancelEstimate = () => {
    if (uploading) return;
    setPendingAction(null);
    setEstimate(null);
    setEstimateError('');
  };

  const confirmAction = async () => {
    setError('');
    setUploading(true);
    try {
      if (pendingAction === 'excel') {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('orgUnitId', orgUnitId);
        fd.append('reportingYear', reportingYear);
        const res = await api.uploadE1(fd);
        setUploadId(res.uploadId);
      } else if (pendingAction === 'doc-extract') {
        const fd = new FormData();
        docFiles.forEach((f) => fd.append('files', f));
        fd.append('mode', extractMode);
        fd.append('orgUnitId', orgUnitId);
        fd.append('reportingYear', reportingYear);
        const res = await api.uploadDocExtract(fd);
        setUploadId(res.uploadId);
      }
      setPendingAction(null);
      setEstimate(null);
    } catch (err) {
      setError(err.error || err.message || 'Upload failed');
      setPendingAction(null);
      setEstimate(null);
    } finally {
      setUploading(false);
    }
  };

  const handleExcelUpload = () => openEstimate('excel');
  const handleDocExtract = () => openEstimate('doc-extract');

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
        <p className="text-gray-500 dark:text-gray-400">Upload spreadsheets, scan invoices, or pull from a connected database</p>
      </div>

      {/* Three ways to connect — visual cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-brand-200 dark:border-brand-800 bg-gradient-to-b from-brand-50 to-white dark:from-brand-950 dark:to-gray-900 p-4 text-center">
          <FileSpreadsheet className="w-7 h-7 text-brand-600 dark:text-brand-400 mx-auto mb-2" />
          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">Spreadsheets</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Upload Excel or CSV files with emissions data</p>
        </div>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-gradient-to-b from-amber-50 to-white dark:from-amber-950 dark:to-gray-900 p-4 text-center">
          <ScanSearch className="w-7 h-7 text-amber-600 dark:text-amber-400 mx-auto mb-2" />
          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">Invoices & Bills</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Scan travel, hotel, energy, or vehicle invoices</p>
        </div>
        <a href="/connections" className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-gradient-to-b from-indigo-50 to-white dark:from-indigo-950 dark:to-gray-900 p-4 text-center hover:shadow-md transition-shadow group">
          <Database className="w-7 h-7 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 group-hover:text-indigo-700">Source Systems</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Pull directly from connected databases</p>
        </a>
      </div>

      {/* Smart processing badge */}
      <div className="p-4 bg-gradient-to-r from-brand-50/80 to-emerald-50/80 dark:from-brand-950/50 dark:to-emerald-950/50 rounded-xl border border-brand-200/60 dark:border-brand-800/60">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Smart Data Processing</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              No rigid templates or specific column names needed. Our algorithms automatically recognize your data structure,
              map it to the correct emission categories and GHG scopes, and calculate tCO2e — regardless of format or language.
            </p>
          </div>
        </div>
      </div>

      {/* Reporting year + org unit */}
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
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Any column names, any language, any units — cost preview shown before processing</p>
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
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">PDF, JPG, PNG — up to 20 files, 10MB each — cost preview shown before processing</p>
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

      <ConfirmCreditsModal
        open={pendingAction !== null}
        loading={estimateLoading}
        estimate={estimate}
        action={
          pendingAction === 'excel'
            ? 'Process Spreadsheet with AI'
            : pendingAction === 'doc-extract'
              ? `Extract ${docFiles.length} Document${docFiles.length !== 1 ? 's' : ''} (${extractMode})`
              : ''
        }
        description={
          pendingAction === 'excel'
            ? `AI will map columns, clean rows, and ingest into E1 emission tables for ${reportingYear}.`
            : pendingAction === 'doc-extract'
              ? `Claude Vision will read each file and extract ${extractMode.toLowerCase()} records for ${reportingYear}. Total cost is the sum of all ${docFiles.length} document(s).`
              : ''
        }
        confirmLabel={pendingAction === 'doc-extract' ? 'Extract & Deduct Credits' : 'Process & Deduct Credits'}
        confirming={uploading}
        error={estimateError || error}
        onConfirm={confirmAction}
        onCancel={cancelEstimate}
      />
    </div>
  );
}
