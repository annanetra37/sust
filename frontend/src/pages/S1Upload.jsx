import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Upload, FileSpreadsheet, Loader2, Sparkles } from 'lucide-react';
import { HelpBanner, FieldLabel } from '../components/HelpSystem';
import ProcessingScreen from '../components/ProcessingScreen';

export default function S1Upload() {
  const [orgUnits, setOrgUnits] = useState([]);
  const [orgUnitId, setOrgUnitId] = useState('');
  const [reportingYear, setReportingYear] = useState(new Date().getFullYear());
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
    }, 5000);
    api.getS1Progress(uploadId).then(setProgress);
    return () => clearInterval(pollRef.current);
  }, [uploadId]);

  const handleUpload = async () => {
    if (!file || !orgUnitId || !reportingYear) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('orgUnitId', orgUnitId);
      fd.append('reportingYear', reportingYear);
      const res = await api.uploadS1(fd);
      setUploadId(res.uploadId);
    } catch (err) {
      setError(err.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">S1 — Connect Workforce Data</h1>
        <p className="text-gray-500 dark:text-gray-400">Upload any spreadsheet or connect a data source — our AI handles the rest</p>
      </div>

      <HelpBanner
        id="s1-upload-guide"
        title="Getting Started with Workforce Data"
        variant="info"
        steps={[
          'Select the reporting year for which this data applies',
          'Select the organizational unit this data belongs to',
          'Upload any spreadsheet containing workforce data (Excel or CSV)',
          'Our AI will automatically identify columns, clean data, and load it',
          'Check the S1 Dashboard to see your results',
        ]}
      />

      {/* AI badge */}
      <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950 dark:to-indigo-950 rounded-xl border border-purple-200 dark:border-purple-800">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-purple-900 dark:text-purple-200">AI-Powered Data Ingestion</h3>
            <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
              Upload your workforce data in <strong>any format, any language, any structure</strong>. Our AI maps columns,
              cleans values, and loads everything into the correct data model automatically.
            </p>
          </div>
        </div>
      </div>

      {!uploadId ? (
        <div className="card space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Reporting Year" required info="The ESG reporting year this data represents. All records will be assigned to this year regardless of dates in the spreadsheet." />
              <select className="input" value={reportingYear} onChange={(e) => setReportingYear(parseInt(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel label="Organizational Unit" required info="Select which business unit or office this workforce data belongs to." />
              <select className="input" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
                {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.country})</option>)}
              </select>
            </div>
          </div>

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-purple-400 dark:hover:border-purple-500 transition-colors cursor-pointer"
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
                <p className="text-gray-500 dark:text-gray-400">Drop any spreadsheet here or click to browse</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">.xlsx, .xls, .csv — any column names, any language — 1 credit per row</p>
              </>
            )}
          </div>

          {error && <div className="p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>}

          <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={!file || uploading} onClick={handleUpload}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {uploading ? 'Starting AI processing...' : `Process with AI for ${reportingYear}`}
          </button>
        </div>
      ) : (
        /* Processing screen */
        <ProcessingScreen progress={progress} status={progress?.status || 'PROCESSING'} type="S1" />
      )}

      {/* What can I upload */}
      {!uploadId && (
        <div className="card border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">What can I upload?</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="font-medium text-gray-700 dark:text-gray-200">Any column names</p>
              <p className="text-gray-500 dark:text-gray-400">"Geschlecht", "Genre", "Gender" — all mapped correctly</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="font-medium text-gray-700 dark:text-gray-200">Any data format</p>
              <p className="text-gray-500 dark:text-gray-400">"M/F", "Male/Female", date formats, number formats</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="font-medium text-gray-700 dark:text-gray-200">Multiple data types</p>
              <p className="text-gray-500 dark:text-gray-400">Composition + training + turnover across sheets</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="font-medium text-gray-700 dark:text-gray-200">Messy real-world data</p>
              <p className="text-gray-500 dark:text-gray-400">Missing values, inconsistent formatting — handled</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
