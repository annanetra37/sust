import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  Package, Upload, Loader2, AlertCircle, Trash2, ArrowLeft, CheckCircle,
  XCircle, AlertTriangle, Search, FileSpreadsheet, Play, Download, FileText,
  BarChart3,
} from 'lucide-react';
import { HelpBanner } from '../../components/HelpSystem';

const CONFIDENCE_COLORS = {
  high: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  low: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

function confidenceLevel(c) {
  if (c >= 0.85) return 'high';
  if (c >= 0.70) return 'medium';
  return 'low';
}

function ConfidencePill({ value }) {
  const level = confidenceLevel(value);
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${CONFIDENCE_COLORS[level]}`}>
      {Math.round(value * 100)}%
    </span>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('bom');

  // BOM upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setProduct(await api.getProduct(id));
    } catch (err) {
      setError(err.error || 'Failed to load product.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleBomUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await api.uploadBom(id, fd);
      setUploadResult(result);
      await load();
    } catch (err) {
      setError(err.error || 'BOM upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleBomUpload(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) handleBomUpload(file);
  };

  const handleDeleteProduct = async () => {
    if (!confirm(`Delete product "${product.name}" and all its BOM data?`)) return;
    try {
      await api.deleteProduct(id);
      navigate('/pcf');
    } catch (err) {
      setError(err.error || 'Could not delete product.');
    }
  };

  const handleDeleteBomItem = async (itemId) => {
    try {
      await api.deleteBomItem(itemId);
      await load();
    } catch (err) {
      setError(err.error || 'Could not delete BOM item.');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>;
  }

  if (!product) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">{error || 'Product not found.'}</p>
        <button onClick={() => navigate('/pcf')} className="btn-secondary mt-4">Back to products</button>
      </div>
    );
  }

  const boms = product.boms || [];
  const calculations = product.calculations || [];
  const latestCalc = calculations[0];

  // Split BOM items into "needs review" (low confidence) and "confirmed"
  const bomWithConfidence = uploadResult
    ? boms.map((b) => {
        const matched = uploadResult.items?.find((r) => r.bomItemId === b.id);
        return { ...b, confidence: matched?.confidence ?? 1, originalText: matched?.originalText ?? '' };
      })
    : boms.map((b) => ({ ...b, confidence: 1, originalText: '' }));

  const needsReview = bomWithConfidence.filter((b) => b.confidence < 0.70);
  const confirmed = bomWithConfidence.filter((b) => b.confidence >= 0.70);

  const tabs = [
    { key: 'bom', label: 'BOM', count: boms.length },
    { key: 'calculations', label: 'Calculations', count: calculations.length },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/pcf')} className="mt-1 text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{product.name}</h1>
            <span className="font-mono text-sm text-gray-400">{product.sku}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
            <span>{product.sector}</span>
            <span>{product.functionalUnit}</span>
            {product.massKg && <span>{product.massKg} kg</span>}
            <span>{product.methodology}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          {latestCalc && (
            <div>
              <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">
                {latestCalc.totalKgCo2e.toFixed(2)} <span className="text-sm font-normal">kgCO2e</span>
              </p>
              <p className="text-xs text-gray-400">{Math.round(latestCalc.primaryDataPct * 100)}% primary data</p>
            </div>
          )}
        </div>
        <button onClick={handleDeleteProduct} className="text-gray-400 hover:text-red-500 mt-1" title="Delete product">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count > 0 && <span className="ml-1.5 text-[10px] bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* BOM tab */}
      {tab === 'bom' && (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragOver
                ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30'
                : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'
            }`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
                <div>
                  <p className="font-semibold text-gray-700 dark:text-gray-300">AI is classifying your BOM...</p>
                  <p className="text-xs text-gray-400 mt-1">Upload → AI map → Material classify</p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="font-semibold text-gray-700 dark:text-gray-300">
                  Drop BOM file (.xlsx, .csv) here
                </p>
                <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" id="bom-file" onChange={handleFileInput} />
                <label htmlFor="bom-file" className="btn-secondary mt-3 inline-flex items-center gap-2 cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4" /> Browse files
                </label>
                <p className="text-[11px] text-gray-400 mt-2">
                  Any column order, any language — the AI handles the mapping. 2 credits per upload.
                </p>
              </>
            )}
          </div>

          {/* Upload result summary */}
          {uploadResult && (
            <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg text-sm text-green-700 dark:text-green-400 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                BOM uploaded: {uploadResult.inputRows} rows → {uploadResult.classifiedRows} components classified.
                {needsReview.length > 0 && <strong> {needsReview.length} need review (low confidence).</strong>}
              </span>
            </div>
          )}

          {/* Needs review band */}
          {needsReview.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Needs review ({needsReview.length})
              </p>
              {needsReview.map((b) => (
                <BomRow key={b.id} item={b} onDelete={handleDeleteBomItem} showConfidence />
              ))}
            </div>
          )}

          {/* Confirmed BOM rows */}
          {confirmed.length > 0 && (
            <div className="space-y-1">
              {needsReview.length > 0 && (
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-4">
                  Confirmed ({confirmed.length})
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">Component</th>
                      <th className="pb-2 font-medium">Material class</th>
                      <th className="pb-2 font-medium">Qty</th>
                      <th className="pb-2 font-medium">Unit</th>
                      <th className="pb-2 font-medium">Stage</th>
                      <th className="pb-2 font-medium">Factor</th>
                      {uploadResult && <th className="pb-2 font-medium">Confidence</th>}
                      <th className="pb-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmed.map((b, i) => (
                      <tr key={b.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900">
                        <td className="py-2 text-gray-400">{i + 1}</td>
                        <td className="py-2 font-medium text-gray-800 dark:text-gray-200">{b.component?.name || '—'}</td>
                        <td className="py-2"><span className="font-mono text-[11px] bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{b.component?.materialClass || '—'}</span></td>
                        <td className="py-2">{b.quantity}</td>
                        <td className="py-2 text-gray-500">{b.unit}</td>
                        <td className="py-2"><span className="badge bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-[10px]">{b.lifecycleStage}</span></td>
                        <td className="py-2 text-xs text-gray-500">
                          {b.chosenFactorId ? (
                            <span title="Emission factor matched">{b.component?.materialClass}</span>
                          ) : (
                            <span className="text-amber-500">No factor</span>
                          )}
                        </td>
                        {uploadResult && (
                          <td className="py-2"><ConfidencePill value={b.confidence} /></td>
                        )}
                        <td className="py-2">
                          <button onClick={() => handleDeleteBomItem(b.id)} className="text-gray-400 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {boms.length === 0 && !uploadResult && (
            <div className="card text-center py-8 text-gray-400">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No BOM data yet. Upload a spreadsheet above to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Calculations tab */}
      {tab === 'calculations' && (
        <CalculationsTab
          product={product}
          boms={boms}
          calculations={calculations}
          onCalculated={load}
          setError={setError}
        />
      )}
    </div>
  );
}

function CalculationsTab({ product, boms, calculations, onCalculated, setError }) {
  const [calculating, setCalculating] = useState(false);
  const latestCalc = calculations[0] || null;

  const runCalculation = async () => {
    setCalculating(true);
    setError('');
    try {
      await api.calculatePcf(product.id);
      await onCalculated();
    } catch (err) {
      setError(err.error || 'Calculation failed.');
    } finally {
      setCalculating(false);
    }
  };

  if (boms.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-400">
        <p className="text-sm">Upload a BOM first, then run a PCF calculation.</p>
      </div>
    );
  }

  const stages = latestCalc?.breakdownByStage || {};
  const comps = (latestCalc?.breakdownByComp || []).slice(0, 10);
  const stageTotal = Object.values(stages).reduce((s, v) => s + v, 0) || 1;

  return (
    <div className="space-y-4">
      {/* Run button */}
      <div className="flex items-center gap-4">
        <button
          onClick={runCalculation}
          disabled={calculating}
          className="btn-primary flex items-center gap-2"
        >
          {calculating
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</>
            : <><Play className="w-4 h-4" /> Run calculation</>}
        </button>
        <span className="text-xs text-gray-400">
          {boms.length} component{boms.length !== 1 ? 's' : ''} in BOM · 1 credit per run
        </span>
      </div>

      {/* Latest result */}
      {latestCalc && (
        <>
          {/* Hero metric */}
          <div className="card bg-gradient-to-br from-brand-50 to-white dark:from-brand-950 dark:to-gray-900 text-center py-8">
            <p className="text-4xl font-bold text-brand-600 dark:text-brand-400">
              {latestCalc.totalKgCo2e} <span className="text-lg font-normal">kgCO2e</span>
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Uncertainty: {latestCalc.uncertaintyLow} – {latestCalc.uncertaintyHigh} kgCO2e
              <span className="ml-2 text-gray-400">(p5 – p95, 1000 Monte Carlo iterations)</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Primary data: {Math.round(latestCalc.primaryDataPct * 100)}% · Engine v{latestCalc.engineVersion} · {latestCalc.status}
            </p>

            {/* Export buttons */}
            <div className="flex items-center justify-center gap-3 mt-4">
              <a
                href={api.exportPcfPdf(latestCalc.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center gap-2 text-sm"
              >
                <FileText className="w-4 h-4" /> PDF Statement
              </a>
              <a
                href={api.exportPcfPact(latestCalc.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" /> PACT JSON
              </a>
            </div>
          </div>

          {/* Stage breakdown */}
          {Object.keys(stages).length > 0 && (
            <div className="card space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-brand-600" /> Lifecycle Stage Breakdown
              </h3>
              <div className="space-y-2">
                {Object.entries(stages).sort((a, b) => b[1] - a[1]).map(([stage, kg]) => {
                  const pct = (kg / stageTotal) * 100;
                  return (
                    <div key={stage}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{stage}</span>
                        <span className="text-gray-500">{kg.toFixed(4)} kgCO2e ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top 10 components */}
          {comps.length > 0 && (
            <div className="card space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Top Contributing Components</h3>
              <div className="space-y-1">
                {comps.map((c, i) => (
                  <div key={c.componentId + i} className="flex items-center gap-3 text-sm py-1.5 border-b dark:border-gray-800 last:border-0">
                    <span className="w-6 text-right text-gray-400 text-xs">{i + 1}</span>
                    <span className="flex-1 font-medium text-gray-700 dark:text-gray-300 truncate">{c.name}</span>
                    <span className="font-mono text-[11px] text-gray-400">{c.materialClass}</span>
                    <span className="text-right w-24">{c.kgCo2e} kgCO2e</span>
                    <span className="text-right w-14 text-gray-500">{c.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calculation history */}
          {calculations.length > 1 && (
            <div className="card space-y-2">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Calculation History</h3>
              {calculations.map((c) => (
                <div key={c.id} className="flex items-center gap-4 text-sm py-1.5 border-b dark:border-gray-800 last:border-0">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{c.totalKgCo2e} kgCO2e</span>
                  <span className="text-xs text-gray-400">{c.uncertaintyLow} – {c.uncertaintyHigh}</span>
                  <span className="text-xs text-gray-400 flex-1">{new Date(c.runAt).toLocaleString()}</span>
                  <span className={`badge text-[10px] ${c.status === 'final' ? 'bg-green-100 text-green-700' : c.status === 'verified' ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700'}`}>{c.status}</span>
                  <a href={api.exportPcfPdf(c.id)} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700" title="Export PDF">
                    <FileText className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BomRow({ item, onDelete, showConfidence }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.component?.name || '—'}</p>
        <p className="text-[11px] text-gray-500">
          {item.component?.materialClass || '?'} · {item.quantity} {item.unit} · {item.lifecycleStage}
          {item.originalText && <span className="ml-2 italic text-gray-400">"{item.originalText.slice(0, 60)}"</span>}
        </p>
      </div>
      {showConfidence && <ConfidencePill value={item.confidence} />}
      <button onClick={() => onDelete(item.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  );
}
