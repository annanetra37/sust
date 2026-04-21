import { useState, useEffect } from 'react';
import api from '../services/api';
import { Target, Plus, Trash2, TrendingDown, Calendar, Percent, Activity } from 'lucide-react';
import { HelpBanner, FieldLabel, InfoTip } from '../components/HelpSystem';

const METHODS = [
  { value: 'absolute', label: 'Absolute Contraction', desc: 'Reduce total emissions by a fixed percentage from base year' },
  { value: 'intensity', label: 'Intensity-based', desc: 'Reduce emissions per unit of output (e.g., per employee, per revenue)' },
  { value: 'renewable_share', label: 'Renewable Energy Share', desc: 'Increase the share of renewable energy in total consumption' },
];

const SCOPES = [
  { value: 'Scope 1+2', label: 'Scope 1 + 2', desc: 'Direct + purchased energy emissions (required)' },
  { value: 'Scope 3', label: 'Scope 3', desc: 'Value chain emissions (required if >40% of total)' },
  { value: 'All', label: 'All Scopes (1+2+3)', desc: 'Comprehensive target covering all emission sources' },
];

const TIMEFRAMES = [
  { label: 'Near-term (5-10 years)', desc: 'Required by SBTi. Must be 5-10 years from submission.' },
  { label: 'Long-term (by 2050)', desc: 'Net-zero target. Must reach at least 90% reduction.' },
];

export default function SBTiTargets() {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    baseYear: new Date().getFullYear() - 1,
    targetYear: new Date().getFullYear() + 7,
    method: 'absolute',
    reductionPct: 42,
    absoluteTarget: '',
    scope: 'Scope 1+2',
    description: '',
  });

  const load = () => {
    setLoading(true);
    api.getSBTiTargets().then(setTargets).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.createSBTiTarget(form);
      setShowCreate(false);
      setForm({ baseYear: new Date().getFullYear() - 1, targetYear: new Date().getFullYear() + 7, method: 'absolute', reductionPct: 42, absoluteTarget: '', scope: 'Scope 1+2', description: '' });
      load();
    } catch (err) {
      alert(err.error || 'Failed to create target');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this SBTi target?')) return;
    await api.deleteSBTiTarget(id);
    load();
  };

  const selectedMethod = METHODS.find((m) => m.value === form.method);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">SBTi Decarbonization Targets</h1>
          <p className="text-gray-500">Set Science Based Targets for emissions reduction</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> New Target
        </button>
      </div>

      <HelpBanner id="sbti-guide" title="What are Science Based Targets?" variant="info">
        Science Based Targets (SBTi) are emission reduction goals aligned with the Paris Agreement's aim to limit
        warming to 1.5°C. Companies set a base year, choose a target year, and commit to reducing emissions by
        a specific percentage. SBTi requires near-term targets (5-10 years) with at least 4.2% annual reduction
        for Scope 1+2, and encourages long-term net-zero targets by 2050.
      </HelpBanner>

      {/* Create target form */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-600" /> Set New SBTi Target
            </h2>

            {/* Timeframe info */}
            <div className="grid grid-cols-2 gap-3">
              {TIMEFRAMES.map((tf) => (
                <div key={tf.label} className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="font-medium text-purple-900 text-sm">{tf.label}</p>
                  <p className="text-xs text-purple-700 mt-0.5">{tf.desc}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Base Year" required info="The reference year from which emission reductions are measured. Should be recent and have reliable data." />
                <input type="number" className="input" min="2010" max="2030" required value={form.baseYear}
                  onChange={(e) => setForm({ ...form, baseYear: e.target.value })} />
              </div>
              <div>
                <FieldLabel label="Target Year" required info="The year by which you aim to achieve the reduction. Near-term: 5-10 years. Net-zero: by 2050." />
                <input type="number" className="input" min="2025" max="2060" required value={form.targetYear}
                  onChange={(e) => setForm({ ...form, targetYear: e.target.value })} />
              </div>
            </div>

            <div>
              <FieldLabel label="Reduction Method" required info="How the reduction will be measured." />
              <div className="space-y-2">
                {METHODS.map((m) => (
                  <label key={m.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.method === m.value ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="method" value={m.value} checked={form.method === m.value}
                      onChange={(e) => setForm({ ...form, method: e.target.value })} className="mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">{m.label}</p>
                      <p className="text-xs text-gray-500">{m.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel label="Scope Coverage" required info="Which emission scopes this target covers. SBTi requires at least Scope 1+2." />
              <div className="space-y-2">
                {SCOPES.map((s) => (
                  <label key={s.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.scope === s.value ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="scope" value={s.value} checked={form.scope === s.value}
                      onChange={(e) => setForm({ ...form, scope: e.target.value })} className="mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">{s.label}</p>
                      <p className="text-xs text-gray-500">{s.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Reduction Percentage" info="The percentage reduction from base year emissions. SBTi minimum: 4.2% per year for 1.5°C alignment." />
                <div className="relative">
                  <input type="number" className="input pr-8" min="1" max="100" step="0.1" value={form.reductionPct}
                    onChange={(e) => setForm({ ...form, reductionPct: e.target.value })} />
                  <span className="absolute right-3 top-2.5 text-gray-400">%</span>
                </div>
                {form.baseYear && form.targetYear && form.reductionPct && (
                  <p className="text-xs text-gray-400 mt-1">
                    ≈ {(parseFloat(form.reductionPct) / (parseInt(form.targetYear) - parseInt(form.baseYear))).toFixed(1)}% per year
                  </p>
                )}
              </div>
              <div>
                <FieldLabel label="Absolute Target (tCO2e)" info="Optional: Set a specific absolute emission level to reach by the target year instead of a percentage." />
                <input type="number" className="input" placeholder="Optional" value={form.absoluteTarget}
                  onChange={(e) => setForm({ ...form, absoluteTarget: e.target.value })} />
              </div>
            </div>

            <div>
              <FieldLabel label="Description" info="Optional: Describe the target for reporting purposes." />
              <textarea className="input" rows={2} placeholder="e.g., Near-term SBTi target for Scope 1+2 emissions, aligned with 1.5°C pathway"
                value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn-primary flex-1">Create Target</button>
            </div>
          </form>
        </div>
      )}

      {/* Existing targets */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : targets.length === 0 ? (
        <div className="card text-center py-12">
          <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No SBTi targets set yet.</p>
          <p className="text-sm text-gray-400 mt-1">Create a decarbonization target to start tracking your progress.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {targets.map((t) => {
            const methodInfo = METHODS.find((m) => m.value === t.method) || {};
            const yearSpan = t.targetYear - t.baseYear;
            const annualRate = t.reductionPct ? (t.reductionPct / yearSpan).toFixed(1) : '—';

            return (
              <div key={t.id} className="card">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                      <Target className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t.scope} — {methodInfo.label || t.method}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">{t.description || `${t.reductionPct}% reduction from ${t.baseYear} to ${t.targetYear}`}</p>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(t.id)} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Base Year</p>
                      <p className="font-semibold">{t.baseYear}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Target Year</p>
                      <p className="font-semibold">{t.targetYear}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Percent className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Total Reduction</p>
                      <p className="font-semibold">{t.reductionPct}%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingDown className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Annual Rate</p>
                      <p className="font-semibold">{annualRate}% / year</p>
                    </div>
                  </div>
                </div>

                {t.absoluteTarget && (
                  <div className="mt-3 p-2 bg-gray-50 rounded-lg text-sm text-gray-600">
                    Absolute target: <strong>{t.absoluteTarget.toLocaleString()} tCO2e</strong> by {t.targetYear}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SBTi reference */}
      <div className="card bg-purple-50 border-purple-200">
        <h3 className="font-semibold text-purple-900 mb-2">SBTi Minimum Requirements</h3>
        <div className="grid grid-cols-2 gap-4 text-sm text-purple-700">
          <div>
            <p className="font-medium">Near-term (1.5°C aligned)</p>
            <ul className="text-xs mt-1 space-y-0.5 list-disc ml-4">
              <li>Scope 1+2: at least 4.2% annual reduction</li>
              <li>Scope 3: at least 2.5% annual reduction (if &gt;40% of total)</li>
              <li>Target year: 5-10 years from submission</li>
            </ul>
          </div>
          <div>
            <p className="font-medium">Long-term (Net-Zero)</p>
            <ul className="text-xs mt-1 space-y-0.5 list-disc ml-4">
              <li>At least 90% absolute reduction by target year</li>
              <li>Target year: no later than 2050</li>
              <li>Remaining 10% neutralized via carbon removal</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
