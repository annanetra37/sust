import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Upload, FileSpreadsheet, FileImage, CheckCircle, XCircle, Loader2, ScanSearch, Sparkles } from 'lucide-react';

export default function E1Upload() {
  const [orgUnits, setOrgUnits] = useState([]);
  const [tab, setTab] = useState('excel');
  const [orgUnitId, setOrgUnitId] = useState('');
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
    pollRef.current = setInterval(poll, 10000);
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
      const res = await api.uploadDocExtract(fd);
      setUploadId(res.uploadId);
    } catch (err) {
      setError(err.error || err.message || 'Extraction failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">E1 — Upload Emissions Data</h1>
        <p className="text-gray-500">Upload spreadsheets or scan invoices — AI extracts and structures everything</p>
      </div>

      {/* AI badge */}
      <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-emerald-900">AI-Powered Emissions ETL</h3>
            <p className="text-sm text-emerald-700 mt-1">
              No templates required. Upload raw emissions data in any format — our AI identifies activity categories,
              maps columns, normalizes units, looks up emission factors, and calculates tCO2e automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'excel' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => setTab('excel')}>
          <FileSpreadsheet className="w-4 h-4 inline mr-1" /> Spreadsheet
        </button>
        <button className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'doc-extract' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => setTab('doc-extract')}>
          <ScanSearch className="w-4 h-4 inline mr-1" /> Invoices & Receipts
        </button>
      </div>

      {tab === 'excel' ? (
        <div className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Organizational Unit</label>
            <select className="input" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
              {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-emerald-400 transition-colors cursor-pointer"
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
                <Upload className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">Drop any emissions spreadsheet — AI auto-detects categories & scopes</p>
                <p className="text-xs text-gray-400 mt-1">Any column names, any language, any units — 1 credit per row</p>
              </>
            )}
          </div>

          {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
          <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={!file || uploading} onClick={handleExcelUpload}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {uploading ? 'Starting AI processing...' : 'Upload & Process with AI'}
          </button>
        </div>
      ) : (
        <div className="card space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Org Unit</label>
              <select className="input" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
                {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
              <select className="input" value={extractMode} onChange={(e) => setExtractMode(e.target.value)}>
                <option value="Travel">Travel (flights, trains, taxis)</option>
                <option value="Stay">Stay (hotels, accommodation)</option>
                <option value="Energy">Energy (electricity, gas, fuel bills)</option>
                <option value="Company Vehicle">Company Vehicle (fuel, mileage)</option>
              </select>
            </div>
          </div>

          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-emerald-400 transition-colors cursor-pointer"
            onClick={() => docFileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setDocFiles([...docFiles, ...Array.from(e.dataTransfer.files)].slice(0, 20)); }}
          >
            <input ref={docFileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={(e) => setDocFiles([...docFiles, ...Array.from(e.target.files)].slice(0, 20))} />
            {docFiles.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {docFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-1.5">
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
                <ScanSearch className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">Drop invoices & receipts — AI reads any language, any format</p>
                <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — up to 20 files, 10MB each — 2 credits per document</p>
              </>
            )}
          </div>

          {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
          <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={!docFiles.length || uploading} onClick={handleDocExtract}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {uploading ? 'AI is reading documents...' : `Extract ${docFiles.length} Document${docFiles.length !== 1 ? 's' : ''} with AI`}
          </button>
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            {progress.status === 'PROCESSING' && <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />}
            {progress.status === 'COMPLETED' && <CheckCircle className="w-5 h-5 text-green-500" />}
            {progress.status === 'FAILED' && <XCircle className="w-5 h-5 text-red-500" />}
            <span className="font-medium">
              {progress.status === 'PROCESSING' ? 'AI is mapping, cleaning, and ingesting your data...' :
               progress.status === 'COMPLETED' ? 'Extraction & ingestion complete' : 'Processing failed'}
            </span>
          </div>
          {progress.totalRows > 0 && (
            <>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                <div className={`h-2.5 rounded-full transition-all ${progress.status === 'FAILED' ? 'bg-red-500' : 'bg-emerald-600'}`} style={{ width: `${progress.progress}%` }} />
              </div>
              <p className="text-sm text-gray-500">{progress.processedRows} / {progress.totalRows} ({progress.progress}%)</p>
            </>
          )}
          {progress.status === 'COMPLETED' && (
            <p className="text-sm text-green-600 mt-2">Emissions data extracted, scopes assigned, and tCO2e calculated. View the E1 Dashboard.</p>
          )}
          {progress.error && <p className="text-sm text-red-600 mt-2">{progress.error}</p>}
        </div>
      )}
    </div>
  );
}
