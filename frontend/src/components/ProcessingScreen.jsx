import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Brain, Search, CheckCircle, Database, BarChart3, Lightbulb, ArrowRight, RotateCcw } from 'lucide-react';

const STEPS = [
  { icon: Search, label: 'Reading your data...', color: 'text-blue-500' },
  { icon: Brain, label: 'AI is analyzing columns & structure...', color: 'text-purple-500' },
  { icon: Sparkles, label: 'Mapping to ESG data model...', color: 'text-amber-500' },
  { icon: Database, label: 'Cleaning & normalizing values...', color: 'text-emerald-500' },
  { icon: CheckCircle, label: 'Validating & inserting records...', color: 'text-green-500' },
  { icon: BarChart3, label: 'Updating dashboards...', color: 'text-brand-500' },
];

const ESG_FACTS = [
  { category: 'Climate', fact: 'The average carbon footprint per employee in a tech company is about 3.5 tCO2e per year.' },
  { category: 'Reporting', fact: 'CSRD requires over 50,000 EU companies to report under ESRS starting 2025.' },
  { category: 'Scope 3', fact: 'Scope 3 emissions typically account for 70-90% of a company\'s total carbon footprint.' },
  { category: 'Workforce', fact: 'Companies with above-average diversity scores have 19% higher innovation revenue.' },
  { category: 'SBTi', fact: 'Over 4,000 companies worldwide have committed to Science Based Targets.' },
  { category: 'Water', fact: 'It takes about 10,000 liters of water to produce one pair of jeans.' },
  { category: 'Training', fact: 'Companies investing in employee training see 24% higher profit margins on average.' },
  { category: 'Energy', fact: 'Switching to LED lighting can reduce energy consumption by up to 80%.' },
  { category: 'Biodiversity', fact: '1 million animal and plant species are currently threatened with extinction.' },
  { category: 'Circular', fact: 'The circular economy could generate $4.5 trillion in economic output by 2030.' },
  { category: 'Governance', fact: 'Companies with diverse boards outperform peers by 36% in profitability.' },
  { category: 'Travel', fact: 'A round-trip flight London to New York produces about 1.1 tCO2e per passenger.' },
  { category: 'Renewables', fact: 'Solar energy costs have dropped 89% in the last decade.' },
  { category: 'Data', fact: 'ESG data quality is the #1 challenge for 78% of sustainability professionals.' },
  { category: 'Net Zero', fact: 'To reach net-zero by 2050, global emissions must fall 7% every year from now.' },
];

const TIPS = [
  'You can upload data in any language — our AI translates automatically.',
  'Use the History page to audit every upload and verify transformed data.',
  'Set SBTi targets to track your decarbonization progress over time.',
  'Document extraction works on invoices, receipts, and utility bills.',
  'Credits are consumed per row (1) or per document (2) processed.',
  'Generate PDF or Word reports in 7 languages for CSRD compliance.',
  'Connect databases directly via Data Connections to automate imports.',
];

export default function ProcessingScreen({ progress, status, type }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * ESG_FACTS.length));
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [showFact, setShowFact] = useState(true);

  // Cycle through processing steps
  useEffect(() => {
    if (status !== 'PROCESSING') return;
    const timer = setInterval(() => {
      setCurrentStep((s) => (s + 1) % STEPS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [status]);

  // Cycle through facts/tips
  useEffect(() => {
    if (status !== 'PROCESSING') return;
    const timer = setInterval(() => {
      setShowFact((f) => !f);
      if (showFact) {
        setTipIndex((i) => (i + 1) % TIPS.length);
      } else {
        setFactIndex((i) => (i + 1) % ESG_FACTS.length);
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [status, showFact]);

  const dashboardPath = type === 'E1' ? '/dashboard/E/environmental-1' : '/dashboard/S/social-1';
  const dashboardLabel = type === 'E1' ? 'E1 Climate Dashboard' : 'S1 Workforce Dashboard';

  if (status === 'COMPLETED') {
    return (
      <div className="card border-green-200 dark:border-green-800">
        <div className="flex flex-col items-center text-center py-6">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4 animate-bounce">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h3 className="text-lg font-bold text-green-700 dark:text-green-400">Processing Complete</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">
            {progress?.processedRows || 0} records processed successfully.
          </p>
          <div className="flex gap-3">
            <Link to={dashboardPath}
              className="btn-primary flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Go to {dashboardLabel} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/history"
              className="btn-secondary flex items-center gap-2">
              View in History
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'FAILED') {
    return (
      <div className="card border-red-200 dark:border-red-800">
        <div className="flex flex-col items-center text-center py-4">
          <h3 className="text-lg font-bold text-red-700 dark:text-red-400">Processing Failed</h3>
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">{progress?.error || 'An error occurred during processing.'}</p>
        </div>
      </div>
    );
  }

  const step = STEPS[currentStep];
  const fact = ESG_FACTS[factIndex];
  const tip = TIPS[tipIndex];
  const pct = progress?.progress || 0;

  return (
    <div className="card space-y-6">
      {/* Animated processing indicator */}
      <div className="flex flex-col items-center text-center">
        <div className="relative w-24 h-24 mb-4">
          {/* Spinning ring */}
          <svg className="w-full h-full animate-spin-slow" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="3"
              className="text-gray-200 dark:text-gray-700" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="3"
              className="text-brand-500" strokeDasharray="264" strokeDashoffset={264 - (264 * pct / 100)}
              strokeLinecap="round" transform="rotate(-90 50 50)" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <step.icon className={`w-8 h-8 ${step.color} transition-all duration-500`} />
          </div>
        </div>

        <p className="font-semibold text-gray-900 dark:text-gray-100 transition-all duration-500">{step.label}</p>

        {/* Progress bar */}
        {progress?.totalRows > 0 && (
          <div className="w-full max-w-xs mt-3">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div className="bg-brand-500 h-2 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {progress.processedRows} / {progress.totalRows} ({pct}%)
            </p>
          </div>
        )}
      </div>

      {/* Processing steps timeline */}
      <div className="flex justify-between px-4">
        {STEPS.map((s, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
              i < currentStep ? 'bg-green-100 dark:bg-green-900 text-green-500' :
              i === currentStep ? 'bg-brand-100 dark:bg-brand-900 text-brand-600 scale-110' :
              'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600'
            }`}>
              {i < currentStep ? <CheckCircle className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-8 ${i < currentStep ? 'bg-green-300 dark:bg-green-700' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Did you know / Tips */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950 dark:to-indigo-950 rounded-xl p-4 transition-all duration-700">
        {showFact ? (
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
                Did you know? — {fact.category}
              </p>
              <p className="text-sm text-purple-900 dark:text-purple-100 mt-1">{fact.fact}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">
                Pro Tip
              </p>
              <p className="text-sm text-indigo-900 dark:text-indigo-100 mt-1">{tip}</p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 8s linear infinite; }
      `}</style>
    </div>
  );
}
