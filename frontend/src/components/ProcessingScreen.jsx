import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Brain, Search, CheckCircle, Database, BarChart3, Lightbulb, ArrowRight, Zap, Shield, FileText, Globe } from 'lucide-react';

const STEPS = [
  { icon: Search, label: 'Reading your data...', color: 'text-blue-500', bg: 'from-blue-500/20 to-blue-600/5' },
  { icon: Brain, label: 'AI is analyzing structure...', color: 'text-purple-500', bg: 'from-purple-500/20 to-purple-600/5' },
  { icon: Sparkles, label: 'Mapping to ESG model...', color: 'text-amber-500', bg: 'from-amber-500/20 to-amber-600/5' },
  { icon: Database, label: 'Cleaning & normalizing...', color: 'text-emerald-500', bg: 'from-emerald-500/20 to-emerald-600/5' },
  { icon: Shield, label: 'Validating records...', color: 'text-cyan-500', bg: 'from-cyan-500/20 to-cyan-600/5' },
  { icon: BarChart3, label: 'Updating dashboards...', color: 'text-brand-500', bg: 'from-brand-500/20 to-brand-600/5' },
];

const ESG_FACTS = [
  { icon: '🌍', category: 'Climate', fact: 'The average carbon footprint per employee in a tech company is about 3.5 tCO2e per year.' },
  { icon: '📊', category: 'Reporting', fact: 'CSRD requires over 50,000 EU companies to report under ESRS starting 2025.' },
  { icon: '🔗', category: 'Scope 3', fact: 'Scope 3 emissions typically account for 70-90% of a company\'s total carbon footprint.' },
  { icon: '👥', category: 'Workforce', fact: 'Companies with above-average diversity scores have 19% higher innovation revenue.' },
  { icon: '🎯', category: 'SBTi', fact: 'Over 4,000 companies worldwide have committed to Science Based Targets.' },
  { icon: '💧', category: 'Water', fact: 'It takes about 10,000 liters of water to produce one pair of jeans.' },
  { icon: '📚', category: 'Training', fact: 'Companies investing in employee training see 24% higher profit margins on average.' },
  { icon: '💡', category: 'Energy', fact: 'Switching to LED lighting can reduce energy consumption by up to 80%.' },
  { icon: '🌿', category: 'Biodiversity', fact: '1 million animal and plant species are currently threatened with extinction.' },
  { icon: '♻️', category: 'Circular', fact: 'The circular economy could generate $4.5 trillion in economic output by 2030.' },
  { icon: '🏛️', category: 'Governance', fact: 'Companies with diverse boards outperform peers by 36% in profitability.' },
  { icon: '✈️', category: 'Travel', fact: 'A round-trip flight London to New York produces about 1.1 tCO2e per passenger.' },
  { icon: '☀️', category: 'Renewables', fact: 'Solar energy costs have dropped 89% in the last decade.' },
  { icon: '📈', category: 'Data', fact: 'ESG data quality is the #1 challenge for 78% of sustainability professionals.' },
  { icon: '🎯', category: 'Net Zero', fact: 'To reach net-zero by 2050, global emissions must fall 7% every year from now.' },
];

const TIPS = [
  { icon: Globe, text: 'You can upload data in any language — our AI translates automatically.' },
  { icon: Shield, text: 'Use the History page to audit every upload and verify transformed data.' },
  { icon: Zap, text: 'Set SBTi targets to track your decarbonization progress over time.' },
  { icon: FileText, text: 'Document extraction works on invoices, receipts, and utility bills.' },
  { icon: Database, text: 'Connect databases directly via Data Connections to automate imports.' },
  { icon: BarChart3, text: 'Generate PDF or Word reports in 7 languages for CSRD compliance.' },
];

export default function ProcessingScreen({ progress, status, type }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * ESG_FACTS.length));
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [showFact, setShowFact] = useState(true);
  const [fadeIn, setFadeIn] = useState(true);
  const [particles, setParticles] = useState([]);
  const [elapsed, setElapsed] = useState(0);

  // Timer
  useEffect(() => {
    if (status !== 'PROCESSING') return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  // Cycle steps
  useEffect(() => {
    if (status !== 'PROCESSING') return;
    const t = setInterval(() => setCurrentStep((s) => (s + 1) % STEPS.length), 3000);
    return () => clearInterval(t);
  }, [status]);

  // Cycle facts/tips with fade animation
  useEffect(() => {
    if (status !== 'PROCESSING') return;
    const t = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setShowFact((f) => !f);
        setFactIndex((i) => (i + 1) % ESG_FACTS.length);
        setTipIndex((i) => (i + 1) % TIPS.length);
        setFadeIn(true);
      }, 400);
    }, 6000);
    return () => clearInterval(t);
  }, [status]);

  // Floating particles
  useEffect(() => {
    if (status !== 'PROCESSING') return;
    const t = setInterval(() => {
      setParticles((p) => {
        const next = p.filter((pp) => Date.now() - pp.born < 3000);
        next.push({
          id: Date.now(),
          born: Date.now(),
          x: 20 + Math.random() * 60,
          size: 2 + Math.random() * 4,
          speed: 1 + Math.random() * 2,
        });
        return next.slice(-12);
      });
    }, 400);
    return () => clearInterval(t);
  }, [status]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const dashboardPath = type === 'E1' ? '/dashboard/E/environmental-1' : '/dashboard/S/social-1';
  const dashboardLabel = type === 'E1' ? 'E1 Climate Dashboard' : 'S1 Workforce Dashboard';

  if (status === 'COMPLETED') {
    return (
      <div className="card border-green-200 dark:border-green-800 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-green-50/50 to-emerald-50/30 dark:from-green-950/30 dark:to-emerald-950/20" />
        <div className="flex flex-col items-center text-center py-8 relative z-10">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-5">
            <CheckCircle className="w-10 h-10 text-green-500 animate-scale-in" />
          </div>
          <h3 className="text-xl font-bold text-green-700 dark:text-green-400">Processing Complete!</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {progress?.processedRows || 0} records processed and loaded into the data model.
          </p>
          {/* Year mismatch warning */}
          {progress?.error && status === 'COMPLETED' && (
            <div className="mt-4 mb-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-left max-w-lg">
              <div className="flex items-start gap-2">
                <span className="text-amber-500 text-lg shrink-0">!</span>
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Year Mismatch Detected</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{progress.error}</p>
                  <p className="text-[10px] text-amber-500 dark:text-amber-500 mt-1">The data was still assigned to your selected reporting year. Review in History if needed.</p>
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3 mt-4">
            <Link to={dashboardPath} className="btn-primary flex items-center gap-2 px-6 py-2.5">
              <BarChart3 className="w-4 h-4" /> Go to {dashboardLabel} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/history" className="btn-secondary flex items-center gap-2">View in History</Link>
          </div>
        </div>
        <style>{`.animate-scale-in { animation: scaleIn 0.5s ease-out; }
          @keyframes scaleIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
      </div>
    );
  }

  if (status === 'FAILED') {
    return (
      <div className="card border-red-200 dark:border-red-800">
        <div className="flex flex-col items-center text-center py-6">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center mb-4">
            <span className="text-3xl">!</span>
          </div>
          <h3 className="text-lg font-bold text-red-700 dark:text-red-400">Processing Failed</h3>
          <p className="text-sm text-red-600 dark:text-red-400 mt-2 max-w-md">{progress?.error || 'An error occurred during processing.'}</p>
        </div>
      </div>
    );
  }

  const step = STEPS[currentStep];
  const fact = ESG_FACTS[factIndex];
  const tip = TIPS[tipIndex];
  const TipIcon = tip.icon;
  const pct = progress?.progress || 0;

  return (
    <div className="card overflow-hidden relative">
      {/* Animated background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${step.bg} transition-all duration-1000`} />

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p) => {
          const age = (Date.now() - p.born) / 3000;
          return (
            <div
              key={p.id}
              className="absolute rounded-full bg-brand-400/30 dark:bg-brand-500/20"
              style={{
                left: `${p.x}%`,
                bottom: `${age * 100}%`,
                width: p.size,
                height: p.size,
                opacity: 1 - age,
                transition: 'all 0.4s linear',
              }}
            />
          );
        })}
      </div>

      <div className="relative z-10 space-y-6 py-2">
        {/* Main indicator */}
        <div className="flex flex-col items-center text-center">
          <div className="relative w-28 h-28 mb-4">
            {/* Outer pulsing ring */}
            <div className="absolute inset-0 rounded-full border-2 border-brand-300/40 dark:border-brand-600/30 animate-ping-slow" />
            {/* Progress ring */}
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="2"
                className="text-gray-200 dark:text-gray-700" />
              <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="3"
                className="text-brand-500" strokeDasharray="276.5" strokeDashoffset={276.5 - (276.5 * pct / 100)}
                strokeLinecap="round" transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
              {/* Orbiting dot */}
              <circle cx="50" cy="6" r="3" fill="currentColor" className="text-brand-500 animate-orbit" />
            </svg>
            {/* Center icon with bounce */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-float">
                <step.icon className={`w-9 h-9 ${step.color} transition-all duration-700`} />
              </div>
            </div>
          </div>

          {/* Step label */}
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-lg transition-all duration-500">{step.label}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Elapsed: {formatTime(elapsed)}</p>

          {/* Progress bar */}
          {progress?.totalRows > 0 && (
            <div className="w-full max-w-sm mt-4">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 relative transition-all duration-1000 ease-out"
                  style={{ width: `${Math.max(pct, 3)}%` }}>
                  <div className="absolute inset-0 bg-white/30 animate-shimmer" />
                </div>
              </div>
              <div className="flex justify-between mt-1.5">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {progress.processedRows} / {progress.totalRows} records
                </p>
                <p className="text-xs font-medium text-brand-600 dark:text-brand-400">{pct}%</p>
              </div>
            </div>
          )}
        </div>

        {/* Steps timeline — horizontal */}
        <div className="flex items-center justify-center gap-1 px-4">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 ${
                i < currentStep ? 'bg-green-100 dark:bg-green-900 text-green-500 scale-100' :
                i === currentStep ? 'bg-brand-100 dark:bg-brand-900 text-brand-600 scale-125 shadow-lg shadow-brand-200/50 dark:shadow-brand-800/30' :
                'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 scale-90'
              }`}>
                {i < currentStep ? <CheckCircle className="w-4 h-4" /> : <s.icon className="w-3.5 h-3.5" />}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-6 h-0.5 mx-0.5 transition-all duration-500 rounded ${
                  i < currentStep ? 'bg-green-400 dark:bg-green-600' : 'bg-gray-200 dark:bg-gray-700'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Facts / Tips — with fade animation */}
        <div className={`rounded-xl p-4 transition-all duration-400 ${fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} ${
          showFact
            ? 'bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/50 dark:to-indigo-950/50'
            : 'bg-gradient-to-r from-brand-50 to-emerald-50 dark:from-brand-950/50 dark:to-emerald-950/50'
        }`}>
          {showFact ? (
            <div className="flex items-start gap-3">
              <span className="text-2xl">{fact.icon}</span>
              <div>
                <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest">
                  Did you know? — {fact.category}
                </p>
                <p className="text-sm text-purple-900 dark:text-purple-100 mt-1 leading-relaxed">{fact.fact}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900 flex items-center justify-center shrink-0">
                <TipIcon className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-brand-700 dark:text-brand-400 uppercase tracking-widest">Pro Tip</p>
                <p className="text-sm text-brand-900 dark:text-brand-100 mt-1 leading-relaxed">{tip.text}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ping-slow { 0% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.15); opacity: 0; } 100% { transform: scale(1); opacity: 0.3; } }
        .animate-ping-slow { animation: ping-slow 2s ease-in-out infinite; }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .animate-float { animation: float 2s ease-in-out infinite; }
        @keyframes orbit { from { transform: rotate(0deg) translateX(44px) rotate(0deg); } to { transform: rotate(360deg) translateX(44px) rotate(-360deg); } }
        .animate-orbit { animation: orbit 4s linear infinite; transform-origin: 50px 50px; }
        @keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(200%); } }
        .animate-shimmer { animation: shimmer 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
