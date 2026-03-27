import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Upload, FileSpreadsheet, FileImage, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function E1Upload() {
  const [orgUnits, setOrgUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tab, setTab] = useState('excel'); // excel | xapture
  const [orgUnitId, setOrgUnitId] = useState('');
  const [activityCategory, setActivityCategory] = useState('');
  const [activitySubcategory, setActivitySubcategory] = useState('');
  const [calcMethod, setCalcMethod] = useState('consumption');
  const [file, setFile] = useState(null);
  const [xaptureFiles, setXaptureFiles] = useState([]);
  const [xaptureMode, setXaptureMode] = useState('Travel');
  const [uploading, setUploading] = useState(false);
  const [uploadId, setUploadId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();
  const xFileRef = useRef();
  const pollRef = useRef();

  useEffect(() => {
    Promise.all([api.getOrgUnits(), api.getCategories()]).then(([units, cats]) => {
      setOrgUnits(units);
      setCategories(cats);
      if (units.length) setOrgUnitId(units[0].id);
    });
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (!uploadId) return;
    const poll = async () => {
      try {
        const p = tab === 'excel' ? await api.getE1Progress(uploadId) : await api.getE1Progress(uploadId);
        setProgress(p);
        if (p.status !== 'PROCESSING') clearInterval(pollRef.current);
      } catch {}
    };
    pollRef.current = setInterval(poll, 10000);
    poll();
    return () => clearInterval(pollRef.current);
  }, [uploadId, tab]);

  const handleExcelUpload = async () => {
    if (!file || !orgUnitId) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('orgUnitId', orgUnitId);
      fd.append('activityCategory', activityCategory);
      fd.append('activitySubcategory', activitySubcategory);
      fd.append('calcMethod', calcMethod);
      const res = await api.uploadE1(fd);
      setUploadId(res.uploadId);
    } catch (err) {
      setError(err.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleXaptureUpload = async () => {
    if (!xaptureFiles.length) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      xaptureFiles.forEach((f) => fd.append('files', f));
      fd.append('mode', xaptureMode);
      fd.append('orgUnitId', orgUnitId);
      const res = await api.uploadXapture(fd);
      setUploadId(res.uploadId);
    } catch (err) {
      setError(err.error || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const selectedCat = categories.find((c) => c.name === activityCategory);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">E1 — Upload Emissions Data</h1>
        <p className="text-gray-500">Upload Excel files or extract data from documents</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'excel' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => setTab('excel')}>
          <FileSpreadsheet className="w-4 h-4 inline mr-1" /> Excel Upload
        </button>
        <button className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'xapture' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => setTab('xapture')}>
          <FileImage className="w-4 h-4 inline mr-1" /> Xapture (Documents)
        </button>
      </div>

      {tab === 'excel' ? (
        <div className="card space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Org Unit</label>
              <select className="input" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
                {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Calculation Method</label>
              <select className="input" value={calcMethod} onChange={(e) => setCalcMethod(e.target.value)}>
                <option value="consumption">Consumption-based</option>
                <option value="expenditure">Expenditure-based</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Activity Category</label>
              <select className="input" value={activityCategory} onChange={(e) => { setActivityCategory(e.target.value); setActivitySubcategory(''); }}>
                <option value="">Select...</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subcategory</label>
              <select className="input" value={activitySubcategory} onChange={(e) => setActivitySubcategory(e.target.value)}>
                <option value="">Select...</option>
                {selectedCat?.subcategories?.map((s) => <option key={s.id} value={s.name}>{s.name} ({s.scope})</option>)}
              </select>
            </div>
          </div>

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
                <p className="text-gray-500">Drop Excel file here — 1 credit per row</p>
              </>
            )}
          </div>

          {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
          <button className="btn-primary w-full" disabled={!file || uploading} onClick={handleExcelUpload}>
            {uploading ? 'Uploading...' : 'Upload & Process'}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Extraction Mode</label>
              <select className="input" value={xaptureMode} onChange={(e) => setXaptureMode(e.target.value)}>
                <option>Travel</option>
                <option>Stay</option>
                <option>Energy</option>
                <option>Company Vehicle</option>
              </select>
            </div>
          </div>

          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-brand-400 transition-colors cursor-pointer"
            onClick={() => xFileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setXaptureFiles([...xaptureFiles, ...Array.from(e.dataTransfer.files)].slice(0, 20)); }}
          >
            <input ref={xFileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.zip" multiple onChange={(e) => setXaptureFiles([...xaptureFiles, ...Array.from(e.target.files)].slice(0, 20))} />
            {xaptureFiles.length > 0 ? (
              <div className="space-y-1">
                {xaptureFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span>{f.name}</span>
                    <button className="text-red-500 text-xs" onClick={(e) => { e.stopPropagation(); setXaptureFiles(xaptureFiles.filter((_, j) => j !== i)); }}>Remove</button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <FileImage className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">Drop invoices/receipts here (PDF, JPG, PNG, ZIP)</p>
                <p className="text-xs text-gray-400 mt-1">Up to 20 files, 10MB each — 2 credits per document</p>
              </>
            )}
          </div>

          {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
          <button className="btn-primary w-full" disabled={!xaptureFiles.length || uploading} onClick={handleXaptureUpload}>
            {uploading ? 'Uploading...' : `Extract ${xaptureFiles.length} Document${xaptureFiles.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            {progress.status === 'PROCESSING' && <Loader2 className="w-5 h-5 text-brand-600 animate-spin" />}
            {progress.status === 'COMPLETED' && <CheckCircle className="w-5 h-5 text-green-500" />}
            {progress.status === 'FAILED' && <XCircle className="w-5 h-5 text-red-500" />}
            <span className="font-medium">{progress.status}</span>
          </div>
          {progress.totalRows > 0 && (
            <>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                <div className="bg-brand-600 h-2.5 rounded-full transition-all" style={{ width: `${progress.progress}%` }} />
              </div>
              <p className="text-sm text-gray-500">{progress.processedRows} / {progress.totalRows} ({progress.progress}%)</p>
            </>
          )}
          {progress.error && <p className="text-sm text-red-600 mt-2">{progress.error}</p>}
        </div>
      )}
    </div>
  );
}
