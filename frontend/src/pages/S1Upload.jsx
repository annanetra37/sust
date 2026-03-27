import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2 } from 'lucide-react';

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
    // Also poll immediately
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
        <p className="text-gray-500">Upload Excel files with workforce composition, diversity, training, and turnover data</p>
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
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-brand-400 transition-colors cursor-pointer"
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
              <p className="text-gray-500">Drop your Excel file here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">Supports .xlsx, .xls, .csv — 1 credit per row</p>
            </>
          )}
        </div>

        {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        <button className="btn-primary w-full" disabled={!file || uploading} onClick={handleUpload}>
          {uploading ? 'Uploading...' : 'Upload & Process'}
        </button>
      </div>

      {/* Progress */}
      {progress && (
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            {progress.status === 'PROCESSING' && <Loader2 className="w-5 h-5 text-brand-600 animate-spin" />}
            {progress.status === 'COMPLETED' && <CheckCircle className="w-5 h-5 text-green-500" />}
            {progress.status === 'FAILED' && <XCircle className="w-5 h-5 text-red-500" />}
            <span className="font-medium">
              {progress.status === 'PROCESSING' ? 'Processing...' : progress.status === 'COMPLETED' ? 'Completed' : 'Failed'}
            </span>
          </div>
          {progress.totalRows > 0 && (
            <>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                <div className="bg-brand-600 h-2.5 rounded-full transition-all" style={{ width: `${progress.progress}%` }} />
              </div>
              <p className="text-sm text-gray-500">{progress.processedRows} / {progress.totalRows} rows ({progress.progress}%)</p>
            </>
          )}
          {progress.error && <p className="text-sm text-red-600 mt-2">{progress.error}</p>}
        </div>
      )}

      {/* Template info */}
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-2">Excel Template Guide</h3>
        <p className="text-sm text-blue-700">Your Excel file should have sheets named:</p>
        <ul className="text-sm text-blue-700 list-disc ml-5 mt-1 space-y-1">
          <li><strong>Composition</strong> — year, gender, contract_type, country, count</li>
          <li><strong>Diversity</strong> — year, gender, disability_status, disability_type, count</li>
          <li><strong>Training</strong> — year, gender, training_hours, count</li>
          <li><strong>Turnover</strong> — year, gender, turnover_type, count</li>
          <li><strong>Injuries</strong> — year, injury_type, injury_status, gender, count</li>
        </ul>
      </div>
    </div>
  );
}
