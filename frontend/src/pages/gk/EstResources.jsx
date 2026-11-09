import { useState, useMemo, useEffect, useRef } from 'react';
import { Upload, Download, Save, Plus, Pencil, Zap, Droplets, Trash, Users } from 'lucide-react';
import gkApi from '../../services/gkApi';
import {
  Loading, ErrorBox, Modal, Field, Check, Note, Tone, SectionTitle, unitLabel, fmt, errText, useLoad, parseCsv, downloadText,
} from './ui';

const FUEL_UNITS = { electricity: ['kWh', 'MWh'], natural_gas: ['m3', 'kWh'], district_heat: ['kWh', 'MWh', 'Gcal'], district_cool: ['kWh', 'MWh'], lpg: ['litre', 'kg'], biomass: ['kg', 'm3'], oil: ['litre'] };
const WATER_SOURCES = ['municipal', 'well', 'surface', 'rainwater', 'tanker'];
const WASTE_STREAMS = ['mixed', 'paper', 'plastic', 'glass', 'metal', 'organic', 'hazardous', 'other'];
const DISPOSAL = ['landfill', 'recycled', 'composted', 'incinerated'];
const EST_METHODS = ['area_allocation', 'occupancy_allocation', 'tank_refills', 'delivery_logs', 'other'];
const IMPORT_COLUMNS = ['year', 'month', 'kind', 'source', 'quantity', 'unit', 'disposal', 'estimated', 'estimationMethod', 'guestNights', 'occupiedRooms', 'notes'];
const KINDS = [['energy', Zap], ['water', Droplets], ['waste', Trash], ['occupancy', Users]];
const DEFAULT_COLS = {
  energy: ['electricity', 'natural_gas'],
  water: ['municipal'],
  waste: ['mixed|landfill', 'paper|recycled', 'plastic|recycled', 'organic|composted'],
  occupancy: ['guestNights', 'occupiedRooms'],
};

const colKey = (r) => (r.kind === 'waste' ? `${r.source}|${r.disposal}` : r.source);
const cellKey = (month, col) => `${month}#${col}`;

function CoveragePanel({ coverage, t }) {
  return (
    <div className="card">
      <SectionTitle>{t('gk.data.coverageTitle')}</SectionTitle>
      <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {['water', 'energy', 'waste', 'occupancy'].map((k) => {
          const c = coverage[k];
          return (
            <div key={k} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t(`gk.data.kind.${k}`)}{k === 'water' && <span className="font-mono text-xs text-gray-500 ml-1">(3.1)</span>}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t(`gk.data.rule.${c.rule}`)}</p>
              <div className="mt-1.5"><Tone tone={c.pass ? 'good' : 'warning'}>{c.pass ? t('gk.rule.pass') : t('gk.data.gap')} · {t('gk.data.monthsOf', { n: c.recorded, req: c.required })}</Tone></div>
              {c.missing.length > 0 && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 break-words">{t('gk.data.missing')}: {c.missing.slice(0, 8).join(', ')}{c.missing.length > 8 ? '…' : ''}</p>}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3">{t('gk.data.coverageHelp')}</p>
    </div>
  );
}

function CellModal({ rec, onClose, onSaved, t }) {
  const [f, setF] = useState({ quantity: rec.quantity, estimated: rec.estimated, estimationMethod: rec.estimationMethod || '', notes: rec.notes || '', cost: rec.cost ?? '', currency: rec.currency || 'AMD' });
  const [err, setErr] = useState('');
  const save = async () => {
    try {
      await gkApi.updateResource(rec.id, { ...f, quantity: Number(f.quantity), estimationMethod: f.estimated ? f.estimationMethod : null, cost: f.cost === '' ? null : Number(f.cost) });
      onSaved();
    } catch (ex) { setErr(errText(ex)); }
  };
  const del = async () => { try { await gkApi.deleteResource(rec.id); onSaved(); } catch (ex) { setErr(errText(ex)); } };
  return (
    <Modal title={`${rec.year}-${String(rec.month).padStart(2, '0')} · ${t(`gk.source.${rec.source}`)}`} onClose={onClose}
      footer={<><button className="btn-danger mr-auto" onClick={del}>{t('gk.delete')}</button><button className="btn-secondary" onClick={onClose}>{t('gk.cancel')}</button><button className="btn-primary" onClick={save}>{t('gk.save')}</button></>}
    >
      <div className="space-y-3">
        <ErrorBox message={err} />
        <div className="grid [&>*]:min-w-0 gap-3 grid-cols-2">
          <Field label={`${t('gk.data.quantity')} (${unitLabel(rec.unit)})`}><input type="number" min="0" step="any" className="input" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
          <Field label={`${t('gk.data.cost')} (${f.currency})`}><input type="number" min="0" step="any" className="input" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
        </div>
        <Check label={t('gk.data.estimated')} checked={f.estimated} onChange={(v) => setF({ ...f, estimated: v })} />
        {f.estimated && (
          <Field label={t('gk.data.estimationMethod')}>
            <select className="input" value={f.estimationMethod} onChange={(e) => setF({ ...f, estimationMethod: e.target.value })}>
              <option value="">—</option>{EST_METHODS.map((m) => <option key={m} value={m}>{t(`gk.estMethod.${m}`)}</option>)}
            </select>
          </Field>
        )}
        <Field label={t('gk.data.notes')} hint={t('gk.data.notesHint')}><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function ImportModal({ estId, onClose, onDone, t }) {
  const fileRef = useRef();
  const [rows, setRows] = useState(null);
  const [errs, setErrs] = useState([]);
  const [busy, setBusy] = useState(false);
  const template = () => downloadText([
    IMPORT_COLUMNS.join(','),
    '2025,1,energy,electricity,24000,kWh,,,,,,Bill 2025-01',
    '2025,1,energy,natural_gas,3100,m3,,,,,,',
    '2025,1,water,municipal,980,m3,,,,,,',
    '2025,1,water,well,120,m3,,yes,tank_refills,,,Tank log',
    '2025,1,waste,mixed,1600,kg,landfill,,,,,',
    '2025,1,waste,paper,400,kg,recycled,,,,,',
    '2025,1,occupancy,,,,,,,2100,1240,PMS export',
  ].join('\n') + '\n', 'green-key-readiness-data-template.csv');
  const run = async () => {
    setBusy(true); setErrs([]);
    try { const r = await gkApi.importData(estId, rows); onDone(r); } catch (ex) { setErrs(ex.errors || [errText(ex)]); } finally { setBusy(false); }
  };
  return (
    <Modal title={t('gk.data.importTitle')} onClose={onClose} wide
      footer={<><button className="btn-secondary" onClick={onClose}>{t('gk.cancel')}</button><button className="btn-primary" disabled={!rows?.length || busy} onClick={run}>{t('gk.data.importRun', { n: rows?.length || 0 })}</button></>}
    >
      <div className="space-y-3">
        <Note>
          <p>{t('gk.data.importHelp')}</p>
          <p className="font-mono text-xs mt-1 break-words">{IMPORT_COLUMNS.join(', ')}</p>
          <ul className="list-disc pl-4 mt-1 text-xs space-y-0.5">
            <li>{t('gk.data.importColKind')}</li><li>{t('gk.data.importColSource')}</li><li>{t('gk.data.importColUnit')}</li>
            <li>{t('gk.data.importColEstimated')}</li><li>{t('gk.data.importColOccupancy')}</li><li>{t('gk.data.importReplace')}</li>
          </ul>
        </Note>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={template}><Download className="w-4 h-4" />{t('gk.downloadTemplate')}</button>
          <button className="btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4" />{t('gk.chooseFile')}</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setRows(parseCsv(await f.text())); e.target.value = ''; }} />
        </div>
        {rows && <p className="text-sm text-gray-700 dark:text-gray-300">{t('gk.data.rowsRead', { n: rows.length })}</p>}
        {errs.length > 0 && <ErrorBox message={errs.join(' · ')} />}
      </div>
    </Modal>
  );
}

export default function ResourcesTab({ est, t }) {
  const { data, loading, error, reload } = useLoad(() => gkApi.resources(est.id), [est.id]);
  const now = new Date();
  const [kind, setKind] = useState('energy');
  const [year, setYear] = useState(now.getUTCFullYear());
  const [extraCols, setExtraCols] = useState({ energy: [], water: [], waste: [] });
  const [units, setUnits] = useState({});
  const [edits, setEdits] = useState({});
  const [modal, setModal] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCol, setNewCol] = useState({ source: '', disposal: 'recycled' });

  useEffect(() => { setEdits({}); }, [kind, year]);

  const years = useMemo(() => {
    const ys = new Set([now.getUTCFullYear(), now.getUTCFullYear() - 1, now.getUTCFullYear() - 2]);
    for (const r of data?.records || []) ys.add(r.year);
    return [...ys].sort((a, b) => b - a);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const recs = useMemo(() => (data?.records || []).filter((r) => r.kind === kind && r.year === year), [data, kind, year]);
  const byCell = useMemo(() => {
    const m = new Map();
    if (kind === 'occupancy') {
      for (const o of (data?.occupancy || []).filter((x) => x.year === year)) {
        m.set(cellKey(o.month, 'guestNights'), { quantity: o.guestNights });
        m.set(cellKey(o.month, 'occupiedRooms'), { quantity: o.occupiedRooms });
      }
    } else for (const r of recs) m.set(cellKey(r.month, colKey(r)), r);
    return m;
  }, [recs, data, kind, year]);

  const cols = useMemo(() => {
    if (kind === 'occupancy') return DEFAULT_COLS.occupancy;
    const all = new Set([...DEFAULT_COLS[kind], ...(data?.records || []).filter((r) => r.kind === kind).map(colKey), ...extraCols[kind]]);
    return [...all];
  }, [kind, data, extraCols]);

  const unitFor = (col) => {
    if (kind === 'water') return 'm3';
    if (kind === 'waste') return 'kg';
    if (kind === 'occupancy') return '';
    if (units[col]) return units[col];
    const r = (data?.records || []).find((x) => x.kind === 'energy' && x.source === col);
    return r ? r.unit : FUEL_UNITS[col][0];
  };
  const colLabel = (col) => {
    if (kind === 'occupancy') return t(`gk.data.${col}`);
    if (kind === 'waste') { const [s, d] = col.split('|'); return `${t(`gk.source.${s}`)} · ${t(`gk.disposal.${d}`)}`; }
    return t(`gk.source.${col}`);
  };

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} />;

  const lastMonth = year < now.getUTCFullYear() ? 12 : now.getUTCMonth() + 1;
  const dirty = Object.keys(edits).length;

  const saveGrid = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      if (kind === 'occupancy') {
        const months = [...new Set(Object.keys(edits).map((k) => Number(k.split('#')[0])))];
        const rows = months.map((m) => {
          const val = (c) => (edits[cellKey(m, c)] !== undefined ? edits[cellKey(m, c)] : byCell.get(cellKey(m, c))?.quantity);
          return { year, month: m, guestNights: val('guestNights'), occupiedRooms: val('occupiedRooms') };
        });
        if (rows.some((r) => r.guestNights === '' || r.guestNights == null || r.occupiedRooms === '' || r.occupiedRooms == null)) throw { error: t('gk.data.occupancyBoth') };
        await gkApi.saveOccupancy(est.id, rows);
      } else {
        const rows = []; const deletes = [];
        for (const [k, v] of Object.entries(edits)) {
          const [m, col] = k.split('#');
          const existing = byCell.get(k);
          if (v === '' || v == null) { if (existing) deletes.push(existing.id); continue; }
          const [source, disposal] = col.split('|');
          rows.push({ year, month: Number(m), kind, source, unit: existing?.unit || unitFor(col), quantity: Number(v), ...(kind === 'waste' ? { disposal } : {}) });
        }
        if (rows.length) await gkApi.saveResources(est.id, rows);
        for (const id of deletes) await gkApi.deleteResource(id);
      }
      setEdits({});
      setMsg(t('gk.data.saved'));
      reload();
    } catch (ex) { setErr(errText(ex)); } finally { setBusy(false); }
  };

  const addCol = () => {
    if (!newCol.source) return;
    const key = kind === 'waste' ? `${newCol.source}|${newCol.disposal}` : newCol.source;
    setExtraCols({ ...extraCols, [kind]: [...extraCols[kind], key] });
    setNewCol({ source: '', disposal: 'recycled' });
  };
  const addOptions = kind === 'energy' ? Object.keys(FUEL_UNITS) : kind === 'water' ? WATER_SOURCES : WASTE_STREAMS;

  return (
    <div className="space-y-4">
      <CoveragePanel coverage={data.coverage} t={t} />

      <div className="card !p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 overflow-x-auto" role="tablist">
            {KINDS.map(([k, Icon]) => (
              <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border whitespace-nowrap ${kind === k ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}
              >
                <Icon className="w-4 h-4" />{t(`gk.data.kind.${k}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="input !w-auto !py-1.5" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t('gk.data.year')}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button className="btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={() => setModal({ kind: 'import' })}><Upload className="w-4 h-4" />{t('gk.data.import')}</button>
          </div>
        </div>
        {msg && <Note>{msg}</Note>}
        <ErrorBox message={err} />
        <p className="text-xs text-gray-500 dark:text-gray-400">{t(`gk.data.gridHelp.${kind}`)}</p>

        <div className="overflow-x-auto -mx-4 px-4">
          <table className="text-sm border-separate border-spacing-0 min-w-full">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white dark:bg-gray-900 text-left text-xs text-gray-500 dark:text-gray-400 py-2 pr-3">{t('gk.data.month')}</th>
                {cols.map((c) => (
                  <th key={c} className="text-left text-xs font-medium text-gray-600 dark:text-gray-300 py-2 px-1 min-w-[7.5rem]">
                    <span className="block">{colLabel(c)}</span>
                    {kind === 'energy' && (
                      <select className="mt-1 text-[11px] bg-transparent border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5" value={unitFor(c)} onChange={(e) => setUnits({ ...units, [c]: e.target.value })} aria-label={t('gk.data.unit')}>
                        {FUEL_UNITS[c].map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
                      </select>
                    )}
                    {(kind === 'water' || kind === 'waste') && <span className="block text-[11px] text-gray-400">{unitLabel(unitFor(c))}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const future = m > lastMonth;
                return (
                  <tr key={m}>
                    <td className="sticky left-0 bg-white dark:bg-gray-900 py-1 pr-3 text-xs text-gray-600 dark:text-gray-400 tabular-nums whitespace-nowrap">{year}-{String(m).padStart(2, '0')}</td>
                    {cols.map((c) => {
                      const k = cellKey(m, c);
                      const rec = byCell.get(k);
                      const val = edits[k] !== undefined ? edits[k] : rec?.quantity ?? '';
                      return (
                        <td key={c} className="py-1 px-1">
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min="0" step="any" disabled={future}
                              className={`input !py-1 !px-2 text-sm tabular-nums ${edits[k] !== undefined ? 'ring-2 ring-brand-300 dark:ring-brand-700' : ''} ${future ? 'opacity-40' : ''}`}
                              value={val}
                              onChange={(e) => setEdits({ ...edits, [k]: e.target.value })}
                              aria-label={`${colLabel(c)} ${year}-${m}`}
                            />
                            {rec?.id && (
                              <button className={`shrink-0 p-1 rounded ${rec.estimated ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 hover:text-gray-600'}`} onClick={() => setModal({ kind: 'cell', rec })}
                                title={rec.estimated ? `${t('gk.data.estimated')}: ${t(`gk.estMethod.${rec.estimationMethod}`)}` : t('gk.data.details')} aria-label={t('gk.data.details')}
                              >
                                {rec.estimated ? <span className="text-[10px] font-bold">{t('gk.data.estShort')}</span> : <Pencil className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          {kind !== 'occupancy' ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t('gk.data.addColumn')}>
                <select className="input !py-1.5 !w-auto" value={newCol.source} onChange={(e) => setNewCol({ ...newCol, source: e.target.value })}>
                  <option value="">—</option>{addOptions.map((o) => <option key={o} value={o}>{t(`gk.source.${o}`)}</option>)}
                </select>
              </Field>
              {kind === 'waste' && (
                <Field label={t('gk.data.disposal')}>
                  <select className="input !py-1.5 !w-auto" value={newCol.disposal} onChange={(e) => setNewCol({ ...newCol, disposal: e.target.value })}>
                    {DISPOSAL.map((d) => <option key={d} value={d}>{t(`gk.disposal.${d}`)}</option>)}
                  </select>
                </Field>
              )}
              <button className="btn-secondary !py-1.5 inline-flex items-center gap-1 text-sm" onClick={addCol}><Plus className="w-4 h-4" />{t('gk.add')}</button>
            </div>
          ) : <span />}
          <button className="btn-primary inline-flex items-center gap-1.5" disabled={!dirty || busy} onClick={saveGrid}><Save className="w-4 h-4" />{t('gk.data.saveGrid', { n: dirty })}</button>
        </div>
        {kind !== 'occupancy' && recs.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('gk.data.yearTotal')}: {cols.map((c) => `${colLabel(c)} ${fmt(recs.filter((r) => colKey(r) === c).reduce((s, r) => s + r.quantity, 0))}`).join(' · ')}
          </p>
        )}
      </div>
      {modal?.kind === 'cell' && <CellModal rec={modal.rec} t={t} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'import' && <ImportModal estId={est.id} t={t} onClose={() => setModal(null)} onDone={(r) => { setModal(null); setMsg(t('gk.data.imported', { r: r.resources, o: r.occupancy })); reload(); }} />}
    </div>
  );
}
