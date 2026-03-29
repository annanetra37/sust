import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Sparkles } from 'lucide-react';

export default function S1Upload() {
  const [orgUnits, setOrgUnits] = useState([]);
  const [orgUnitId, setOrgUnitId] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadId, setUploadId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();
  const pollRef = useRef();

  useEffect(() => {
    api.getOrgUnits().then((units) => { setOrgUnits(units); if (units.length) setOrgUnitId(units[0].id); });
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (!uploadId) return;
    pollRef.current = setInterval(async () => {
      try {
        const p = await api.getS1Progress(uploadId);
        setProgress(p);
        if (p.status !== 'PROCESSING') clearInterval(pollRef.current);
      } catch {}
    }, 10000);
    api.getS1Progress(uploadId).then(setProgress);
    return () => clearInterval(pollRef.current);
  }, [uploadId]);

  const handleUpload = async () => {
    if (!file || !orgUnitId) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('orgUnitId', orgUnitId);
      const res = await api.uploadS1(fd);
      setUploadId(res.uploadId);
    } catch (err) {
      setError(err.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">S1 — Upload Workforce Data</h1>
        <p className="text-gray-500">Upload any spreadsheet with workforce data — our AI handles the rest</p>
      </div>

      {/* AI-powered badge */}
      <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-purple-900">AI-Powered Data Ingestion</h3>
            <p className="text-sm text-purple-700 mt-1">
              Upload your workforce data in <strong>any format, any language, any structure</strong>. Our AI automatically:
            </p>
            <ul className="text-sm text-purple-700 mt-2 space-y-1">
              <li>Identifies what each column represents (even in German, French, Arabic, etc.)</li>
              <li>Maps your data to the correct tables (composition, diversity, training, turnover, injuries)</li>
              <li>Cleans and normalizes values (gender codes, contract types, date formats)</li>
              <li>Validates everything before inserting into the data model</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Organizational Unit</label>
          <select className="input" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
            {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.country})</option>)}
          </select>
        </div>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-purple-400 transition-colors cursor-pointer"
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
              <p className="text-gray-500">Drop any spreadsheet here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv — any column names, any language — 1 credit per row</p>
            </>
          )}
        </div>

        {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={!file || uploading} onClick={handleUpload}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {uploading ? 'Starting AI processing...' : 'Upload & Process with AI'}
        </button>
      </div>

      {/* Progress */}
      {progress && (
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            {progress.status === 'PROCESSING' && <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />}
            {progress.status === 'COMPLETED' && <CheckCircle className="w-5 h-5 text-green-500" />}
            {progress.status === 'FAILED' && <XCircle className="w-5 h-5 text-red-500" />}
            <span className="font-medium">
              {progress.status === 'PROCESSING' ? 'AI is analyzing and transforming your data...' :
               progress.status === 'COMPLETED' ? 'Data ingestion complete' : 'Processing failed'}
            </span>
          </div>
          {progress.totalRows > 0 && (
            <>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                <div className={`h-2.5 rounded-full transition-all ${progress.status === 'FAILED' ? 'bg-red-500' : 'bg-purple-600'}`} style={{ width: `${progress.progress}%` }} />
              </div>
              <p className="text-sm text-gray-500">{progress.processedRows} / {progress.totalRows} rows ({progress.progress}%)</p>
            </>
          )}
          {progress.status === 'COMPLETED' && (
            <p className="text-sm text-green-600 mt-2">Your data has been cleaned, structured, and loaded into the S1 data model. View the dashboard for results.</p>
          )}
          {progress.error && <p className="text-sm text-red-600 mt-2">{progress.error}</p>}
        </div>
      )}

      {/* What the AI handles */}
      <div className="card border-gray-200">
        <h3 className="font-semibold text-gray-900 mb-3">What can I upload?</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-medium text-gray-700">Any column names</p>
            <p className="text-gray-500">"Geschlecht", "Genre", "Gender", "Sex" — all mapped correctly</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-medium text-gray-700">Any data format</p>
            <p className="text-gray-500">"M/F", "Male/Female", "1/2", date formats, number formats</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-medium text-gray-700">Multiple data types</p>
            <p className="text-gray-500">One file with composition + training + turnover data across sheets</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-medium text-gray-700">Messy real-world data</p>
            <p className="text-gray-500">Missing values, inconsistent formatting, summary rows — handled</p>
          </div>
        </div>
      </div>
    </div>
  );
}
