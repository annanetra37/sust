import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import {
  TreePine, MapPin, Ruler, CheckCircle2, Plus, AlertTriangle,
  ChevronRight, ChevronLeft, Sparkles, Download, Building2, Globe,
  HelpCircle, Leaf, Droplets, Bug, Factory, Trash2, CloudRain,
  Trees, Mountain, Fish, Building, Wheat,
} from 'lucide-react';
import { InfoTip } from '../components/HelpSystem';
import { useT } from '../i18n';
import useFeature from '../hooks/useFeature';
import FeatureLock from '../components/FeatureLock';
import clsx from 'clsx';

const LEAP_PHASES = ['locate', 'evaluate', 'assess', 'prepare'];

const STATUS_BADGE = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  complete: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  verified: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
};

const DRIVER_KEYS = ['landUseChange', 'resourceExploitation', 'climateChange', 'pollution', 'invasiveSpecies'];

const SITE_TYPES = ['Factory', 'Office', 'Warehouse', 'Retail Store', 'Data Center', 'Other'];

const ECOSYSTEM_TYPES = [
  { key: 'forest', Icon: Trees },
  { key: 'wetland', Icon: Droplets },
  { key: 'grassland', Icon: Mountain },
  { key: 'marine', Icon: Fish },
  { key: 'urban', Icon: Building },
  { key: 'agricultural', Icon: Wheat },
];

const DRIVER_DEFS = [
  { key: 'landUseChange', Icon: MapPin },
  { key: 'resourceExploitation', Icon: Droplets },
  { key: 'climateChange', Icon: CloudRain },
  { key: 'pollution', Icon: Factory },
  { key: 'invasiveSpecies', Icon: Bug },
];

const WIZARD_STEPS = ['locate', 'evaluate', 'assess', 'prepare', 'results'];

const EMPTY_SITE = () => ({
  name: '',
  country: '',
  city: '',
  siteType: 'Factory',
});

/* ---------- confetti CSS ---------- */
const confettiCSS = `
@keyframes confetti-fall {
  0% { transform: translateY(-100%) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}
@keyframes confetti-sway {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(15px); }
  75% { transform: translateX(-15px); }
}
.confetti-piece {
  position: fixed;
  top: -10px;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  animation: confetti-fall linear forwards, confetti-sway ease-in-out infinite;
  z-index: 1000;
  pointer-events: none;
}
`;

function ConfettiEffect() {
  const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    bg: colors[i % colors.length],
    delay: `${Math.random() * 2}s`,
    duration: `${2 + Math.random() * 3}s`,
    swayDuration: `${1 + Math.random() * 2}s`,
    size: `${6 + Math.random() * 8}px`,
    borderRadius: Math.random() > 0.5 ? '50%' : '2px',
  }));

  return (
    <>
      <style>{confettiCSS}</style>
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: p.left,
            backgroundColor: p.bg,
            width: p.size,
            height: p.size,
            borderRadius: p.borderRadius,
            animationDelay: p.delay,
            animationDuration: `${p.duration}, ${p.swayDuration}`,
          }}
        />
      ))}
    </>
  );
}

/* ---------- Step progress indicator ---------- */
function StepProgress({ currentStep, t }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {WIZARD_STEPS.map((step, idx) => {
        const isCompleted = idx < currentStep;
        const isCurrent = idx === currentStep;
        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={clsx(
                  'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300',
                  isCompleted && 'bg-emerald-500 text-white shadow-md shadow-emerald-200 dark:shadow-emerald-900',
                  isCurrent && 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500 shadow-md',
                  !isCompleted && !isCurrent && 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500',
                )}
              >
                {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
              </div>
              <span
                className={clsx(
                  'text-xs mt-1.5 font-medium transition-colors duration-300',
                  isCurrent ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-400 dark:text-gray-500',
                )}
              >
                {t(`biodiversity.wizard.stepLabel.${step}`)}
              </span>
            </div>
            {idx < WIZARD_STEPS.length - 1 && (
              <div
                className={clsx(
                  'w-12 sm:w-20 h-0.5 mx-1 sm:mx-2 mt-[-18px] transition-colors duration-300',
                  idx < currentStep ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Wizard step wrapper with transitions ---------- */
function StepWrapper({ children, direction }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="transition-all duration-400 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : `translateX(${direction === 'forward' ? '24px' : '-24px'})`,
      }}
    >
      {children}
    </div>
  );
}

/* ---------- Tri-state toggle (Yes / No / Not sure) ---------- */
function TriToggle({ value, onChange, t }) {
  const options = [
    { key: 'yes', label: t('biodiversity.wizard.yes'), color: 'emerald' },
    { key: 'no', label: t('biodiversity.wizard.no'), color: 'red' },
    { key: 'notSure', label: t('biodiversity.wizard.notSure'), color: 'amber' },
  ];

  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={clsx(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border',
            value === opt.key
              ? opt.color === 'emerald'
                ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                : opt.color === 'red'
                  ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700'
                  : 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
              : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}


export default function E4Dashboard() {
  const { t } = useT();
  const feature = useFeature('biodiversity');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [years] = useState(() => {
    const cur = new Date().getFullYear();
    return [cur, cur - 1, cur - 2, cur - 3];
  });

  /* ----- Wizard state ----- */
  const [wizardActive, setWizardActive] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [stepDirection, setStepDirection] = useState('forward');
  const [wizardSaving, setWizardSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Step 1 - Sites
  const [wizardSites, setWizardSites] = useState([EMPTY_SITE()]);

  // Step 2 - Evaluate (per site)
  const [siteEvals, setSiteEvals] = useState([{
    nearNature: '',
    usesNaturalWater: '',
    producesWaste: '',
    ecosystemType: '',
  }]);

  // Step 3 - Drivers
  const [driverAnswers, setDriverAnswers] = useState({
    landUseChange: '',
    resourceExploitation: '',
    climateChange: '',
    pollution: '',
    invasiveSpecies: '',
  });

  // Step 4 - Plan
  const [existingPolicies, setExistingPolicies] = useState('');
  const [targets, setTargets] = useState('');

  const loadDashboard = useCallback(() => {
    setLoading(true);
    api.getBiodiversityDashboard(year)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => {
    if (!feature.allowed) return;
    loadDashboard();
  }, [year, feature.allowed, loadDashboard]);

  /* ----- Wizard navigation ----- */
  const goNext = () => {
    setStepDirection('forward');
    setWizardStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  };
  const goBack = () => {
    setStepDirection('back');
    setWizardStep((s) => Math.max(s - 1, 0));
  };

  const addSite = () => {
    setWizardSites((prev) => [...prev, EMPTY_SITE()]);
    setSiteEvals((prev) => [...prev, { nearNature: '', usesNaturalWater: '', producesWaste: '', ecosystemType: '' }]);
  };

  const removeSite = (idx) => {
    if (wizardSites.length <= 1) return;
    setWizardSites((prev) => prev.filter((_, i) => i !== idx));
    setSiteEvals((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSite = (idx, field, value) => {
    setWizardSites((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const updateEval = (idx, field, value) => {
    setSiteEvals((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
  };

  const updateDriver = (key, value) => {
    setDriverAnswers((prev) => ({ ...prev, [key]: value }));
  };

  /* ----- Step validation ----- */
  const canProceed = () => {
    if (wizardStep === 0) {
      return wizardSites.every((s) => s.name.trim() && s.country.trim());
    }
    if (wizardStep === 1) {
      return siteEvals.every((e) => e.nearNature && e.usesNaturalWater && e.producesWaste && e.ecosystemType);
    }
    if (wizardStep === 2) {
      return Object.values(driverAnswers).every((v) => v !== '');
    }
    return true;
  };

  /* ----- Compute summary for step 4/5 ----- */
  const computeSummary = () => {
    const impactedDrivers = Object.entries(driverAnswers)
      .filter(([, v]) => v === 'yes')
      .map(([k]) => k);

    const sensitiveSites = wizardSites.filter((_, i) => siteEvals[i]?.nearNature === 'yes');

    const suggestedActions = impactedDrivers.map((dk) => {
      const actions = {
        landUseChange: t('biodiversity.wizard.action.landUseChange'),
        resourceExploitation: t('biodiversity.wizard.action.resourceExploitation'),
        climateChange: t('biodiversity.wizard.action.climateChange'),
        pollution: t('biodiversity.wizard.action.pollution'),
        invasiveSpecies: t('biodiversity.wizard.action.invasiveSpecies'),
      };
      return { driver: dk, action: actions[dk] || dk };
    });

    return { impactedDrivers, sensitiveSites, suggestedActions };
  };

  /* ----- Final submission ----- */
  const handleFinish = async () => {
    setWizardSaving(true);
    try {
      for (const site of wizardSites) {
        await api.createSite({
          name: site.name,
          country: site.country,
          city: site.city,
          siteType: site.siteType,
        });
      }

      const assessmentData = {
        year,
        sites: wizardSites.map((s, i) => ({
          name: s.name,
          country: s.country,
          city: s.city,
          siteType: s.siteType,
          evaluation: siteEvals[i],
        })),
        drivers: driverAnswers,
        policies: existingPolicies,
        targets,
      };
      await api.createBiodiversityAssessment(assessmentData);

      setWizardActive(false);
      setWizardStep(0);
      loadDashboard();
    } catch {
      // stay on page; errors handled by api layer
    } finally {
      setWizardSaving(false);
    }
  };

  const startWizard = () => {
    setWizardActive(true);
    setWizardStep(0);
    setStepDirection('forward');
    setShowConfetti(false);
  };

  /* ----- Go to results step (step 5) with confetti ----- */
  const goToResults = () => {
    setStepDirection('forward');
    setWizardStep(4);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 5000);
  };

  if (!feature.allowed) {
    return (
      <div className="max-w-4xl mx-auto">
        <FeatureLock feature="biodiversity" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const assessments = data?.assessments || [];
  const sites = data?.sites || [];
  const leapProgress = data?.leapProgress || [];
  const drivers = data?.drivers || {};
  const hasData = data && (assessments.length > 0 || sites.length > 0);

  /* ============================================================
     WIZARD RENDER
     ============================================================ */
  const renderWizard = () => {
    const summary = computeSummary();

    /* --- Step 1: Locate --- */
    const renderStep1 = () => (
      <StepWrapper key="step-1" direction={stepDirection}>
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mx-auto mb-3">
              <MapPin className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              {t('biodiversity.wizard.step1.title')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {t('biodiversity.wizard.step1.description')}
            </p>
          </div>

          <div className="space-y-4">
            {wizardSites.map((site, idx) => (
              <div
                key={idx}
                className="card bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-500" />
                    {t('biodiversity.wizard.step1.siteNumber', { n: idx + 1 })}
                  </span>
                  {wizardSites.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSite(idx)}
                      className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
                    >
                      {t('biodiversity.wizard.remove')}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {t('biodiversity.wizard.step1.siteName')} *
                    </label>
                    <input
                      type="text"
                      value={site.name}
                      onChange={(e) => updateSite(idx, 'name', e.target.value)}
                      className="input w-full"
                      placeholder={t('biodiversity.wizard.step1.siteNamePlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {t('biodiversity.wizard.step1.country')} *
                    </label>
                    <input
                      type="text"
                      value={site.country}
                      onChange={(e) => updateSite(idx, 'country', e.target.value)}
                      className="input w-full"
                      placeholder={t('biodiversity.wizard.step1.countryPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {t('biodiversity.wizard.step1.city')}
                    </label>
                    <input
                      type="text"
                      value={site.city}
                      onChange={(e) => updateSite(idx, 'city', e.target.value)}
                      className="input w-full"
                      placeholder={t('biodiversity.wizard.step1.cityPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {t('biodiversity.wizard.step1.siteType')}
                    </label>
                    <select
                      value={site.siteType}
                      onChange={(e) => updateSite(idx, 'siteType', e.target.value)}
                      className="input w-full"
                    >
                      {SITE_TYPES.map((st) => (
                        <option key={st} value={st}>{t(`biodiversity.wizard.siteTypes.${st}`)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addSite}
            className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
          >
            <Plus className="w-4 h-4" /> {t('biodiversity.wizard.step1.addAnother')}
          </button>
        </div>
      </StepWrapper>
    );

    /* --- Step 2: Evaluate --- */
    const renderStep2 = () => (
      <StepWrapper key="step-2" direction={stepDirection}>
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center mx-auto mb-3">
              <Globe className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              {t('biodiversity.wizard.step2.title')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {t('biodiversity.wizard.step2.description')}
            </p>
          </div>

          <div className="space-y-6">
            {wizardSites.map((site, idx) => (
              <div
                key={idx}
                className="card bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm"
              >
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-500" />
                  {site.name || t('biodiversity.wizard.step1.siteNumber', { n: idx + 1 })}
                </h4>

                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                      <TreePine className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      {t('biodiversity.wizard.step2.nearNature')}
                    </p>
                    <TriToggle
                      value={siteEvals[idx]?.nearNature}
                      onChange={(v) => updateEval(idx, 'nearNature', v)}
                      t={t}
                    />
                  </div>
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                      <Droplets className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      {t('biodiversity.wizard.step2.usesNaturalWater')}
                    </p>
                    <TriToggle
                      value={siteEvals[idx]?.usesNaturalWater}
                      onChange={(v) => updateEval(idx, 'usesNaturalWater', v)}
                      t={t}
                    />
                  </div>
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                      <Trash2 className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      {t('biodiversity.wizard.step2.producesWaste')}
                    </p>
                    <TriToggle
                      value={siteEvals[idx]?.producesWaste}
                      onChange={(v) => updateEval(idx, 'producesWaste', v)}
                      t={t}
                    />
                  </div>

                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      {t('biodiversity.wizard.step2.ecosystemType')}
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {ECOSYSTEM_TYPES.map(({ key, Icon }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => updateEval(idx, 'ecosystemType', key)}
                          className={clsx(
                            'flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-medium transition-all duration-200',
                            siteEvals[idx]?.ecosystemType === key
                              ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750',
                          )}
                        >
                          <Icon className="w-5 h-5" />
                          {t(`biodiversity.wizard.ecosystems.${key}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </StepWrapper>
    );

    /* --- Step 3: Assess --- */
    const renderStep3 = () => (
      <StepWrapper key="step-3" direction={stepDirection}>
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              {t('biodiversity.wizard.step3.title')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {t('biodiversity.wizard.step3.description')}
            </p>
          </div>

          <div className="space-y-4">
            {DRIVER_DEFS.map(({ key, Icon }) => (
              <div
                key={key}
                className="card bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-0.5">
                        {t(`biodiversity.wizard.drivers.${key}.title`)}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t(`biodiversity.wizard.drivers.${key}.description`)}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <TriToggle
                      value={driverAnswers[key]}
                      onChange={(v) => updateDriver(key, v)}
                      t={t}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </StepWrapper>
    );

    /* --- Step 4: Prepare --- */
    const renderStep4 = () => (
      <StepWrapper key="step-4" direction={stepDirection}>
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-950 flex items-center justify-center mx-auto mb-3">
              <Leaf className="w-7 h-7 text-violet-600 dark:text-violet-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              {t('biodiversity.wizard.step4.title')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {t('biodiversity.wizard.step4.description')}
            </p>
          </div>

          {/* Summary of findings */}
          <div className="card bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {t('biodiversity.wizard.step4.summaryTitle')}
            </h4>
            <div className="space-y-2 text-sm">
              <p className="text-gray-600 dark:text-gray-400">
                {t('biodiversity.wizard.step4.sitesAssessed', { count: wizardSites.length })}
              </p>
              {summary.sensitiveSites.length > 0 && (
                <p className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {t('biodiversity.wizard.step4.sensitiveSitesFound', { count: summary.sensitiveSites.length })}
                </p>
              )}
              <p className="text-gray-600 dark:text-gray-400">
                {t('biodiversity.wizard.step4.driversIdentified', { count: summary.impactedDrivers.length })}
              </p>
            </div>
          </div>

          {/* Suggested actions */}
          {summary.suggestedActions.length > 0 && (
            <div className="card bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                {t('biodiversity.wizard.step4.suggestedActions')}
              </h4>
              <div className="space-y-3">
                {summary.suggestedActions.map(({ driver, action }) => (
                  <div key={driver} className="flex items-start gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <ChevronRight className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {t(`biodiversity.wizard.drivers.${driver}.title`)}:
                      </span>{' '}
                      <span className="text-gray-600 dark:text-gray-400">{action}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Policies & targets */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('biodiversity.wizard.step4.existingPolicies')}
              </label>
              <textarea
                value={existingPolicies}
                onChange={(e) => setExistingPolicies(e.target.value)}
                className="input w-full min-h-[80px] resize-y"
                placeholder={t('biodiversity.wizard.step4.policiesPlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('biodiversity.wizard.step4.targets')}
              </label>
              <textarea
                value={targets}
                onChange={(e) => setTargets(e.target.value)}
                className="input w-full min-h-[80px] resize-y"
                placeholder={t('biodiversity.wizard.step4.targetsPlaceholder')}
              />
            </div>
          </div>
        </div>
      </StepWrapper>
    );

    /* --- Step 5: Results --- */
    const renderStep5 = () => (
      <StepWrapper key="step-5" direction={stepDirection}>
        <div className="max-w-2xl mx-auto text-center">
          {showConfetti && <ConfettiEffect />}

          <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {t('biodiversity.wizard.step5.title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-8">
            {t('biodiversity.wizard.step5.description')}
          </p>

          {/* Result cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="card bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mb-1">{wizardSites.length}</div>
              <div className="text-xs text-emerald-600 dark:text-emerald-400">{t('biodiversity.wizard.step5.sitesAssessed')}</div>
            </div>
            <div className="card bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-300 mb-1">{summary.impactedDrivers.length}</div>
              <div className="text-xs text-amber-600 dark:text-amber-400">{t('biodiversity.wizard.step5.driversIdentified')}</div>
            </div>
            <div className="card bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 mb-1">{summary.sensitiveSites.length}</div>
              <div className="text-xs text-blue-600 dark:text-blue-400">{t('biodiversity.wizard.step5.sensitiveSites')}</div>
            </div>
          </div>

          {/* Explanation text */}
          <div className="card bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 text-left mb-8">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-gray-400" />
              {t('biodiversity.wizard.step5.aboutTitle')}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              {t('biodiversity.wizard.step5.aboutText')}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              className="btn-primary flex items-center gap-2 px-6 py-2.5"
              onClick={handleFinish}
              disabled={wizardSaving}
            >
              {wizardSaving ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  {t('biodiversity.wizard.step5.saving')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  {t('biodiversity.wizard.step5.goToDashboard')}
                </>
              )}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              onClick={() => {
                /* lightweight download of the summary as text */
                const lines = [
                  'TNFD-LEAP Biodiversity Assessment Report',
                  '=========================================',
                  '',
                  `Date: ${new Date().toLocaleDateString()}`,
                  `Sites assessed: ${wizardSites.length}`,
                  '',
                  'Sites:',
                  ...wizardSites.map((s, i) => `  ${i + 1}. ${s.name} (${s.siteType}) - ${s.city ? s.city + ', ' : ''}${s.country}`),
                  '',
                  'Drivers of biodiversity loss identified:',
                  ...summary.impactedDrivers.map((d) => `  - ${t(`biodiversity.wizard.drivers.${d}.title`)}`),
                  '',
                  'Sensitive sites (near nature):',
                  ...(summary.sensitiveSites.length > 0
                    ? summary.sensitiveSites.map((s) => `  - ${s.name}`)
                    : ['  None']),
                  '',
                  'Suggested actions:',
                  ...summary.suggestedActions.map(({ driver, action }) => `  - ${t(`biodiversity.wizard.drivers.${driver}.title`)}: ${action}`),
                  '',
                  'Existing policies:',
                  existingPolicies || '  (none provided)',
                  '',
                  'Targets:',
                  targets || '  (none provided)',
                ];
                const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'biodiversity-assessment-report.txt';
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="w-4 h-4" />
              {t('biodiversity.wizard.step5.downloadReport')}
            </button>
          </div>
        </div>
      </StepWrapper>
    );

    const stepRenderers = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];

    return (
      <div className="card py-8 px-4 sm:px-8">
        <StepProgress currentStep={wizardStep} t={t} />

        <div className="min-h-[400px]">
          {stepRenderers[wizardStep]()}
        </div>

        {/* Navigation */}
        {wizardStep < 4 && (
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 max-w-2xl mx-auto">
            <button
              type="button"
              onClick={wizardStep === 0 ? () => setWizardActive(false) : goBack}
              className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {wizardStep === 0 ? t('biodiversity.wizard.cancel') : t('biodiversity.wizard.back')}
            </button>
            <button
              type="button"
              onClick={wizardStep === 3 ? goToResults : goNext}
              disabled={!canProceed()}
              className={clsx(
                'btn-primary flex items-center gap-2 px-5 py-2 transition-all duration-200',
                !canProceed() && 'opacity-50 cursor-not-allowed',
              )}
            >
              {wizardStep === 3 ? t('biodiversity.wizard.seeResults') : t('biodiversity.wizard.next')}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('biodiversity.title')}</h1>
          <p className="text-gray-500">{t('biodiversity.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input py-2 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {!hasData ? (
        wizardActive ? (
          renderWizard()
        ) : (
          /* Empty state - entry point */
          <div className="card text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mx-auto mb-4">
              <TreePine className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{t('biodiversity.title')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto mb-6">
              {t('biodiversity.noAssessments')}
            </p>
            <div className="card max-w-xl mx-auto text-left bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('biodiversity.tnfdLeap')}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {t('biodiversity.wizard.intro')}
              </p>
              <div className="flex items-center gap-2 mb-4">
                {LEAP_PHASES.map((phase, idx) => (
                  <div key={phase} className="flex items-center gap-1">
                    <span className="w-8 h-8 rounded-lg bg-emerald-200 dark:bg-emerald-800 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      {phase[0].toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-600 dark:text-gray-400">{t(`biodiversity.${phase}`)}</span>
                    {idx < LEAP_PHASES.length - 1 && <span className="text-gray-300 dark:text-gray-600 mx-1">&rarr;</span>}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={startWizard}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> {t('biodiversity.startAssessment')}
              </button>
            </div>
          </div>
        )
      ) : (
        <>
          {/* Hero KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('biodiversity.sitesAssessed')}</span>
                <InfoTip>{t('biodiversity.sitesAssessed')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">{stats.sitesAssessed || 0}</span>
            </div>
            <div className="stat-card">
              <MapPin className="w-5 h-5 text-red-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('biodiversity.protectedAreas')}</span>
                <InfoTip>{t('biodiversity.protectedAreas')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">{stats.protectedAreaSites || 0}</span>
            </div>
            <div className="stat-card">
              <Ruler className="w-5 h-5 text-amber-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('biodiversity.totalLandArea')}</span>
                <InfoTip>{t('biodiversity.totalLandArea')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {(stats.totalLandArea || 0).toLocaleString()} <span className="text-sm font-normal text-gray-400">{t('biodiversity.hectares')}</span>
              </span>
            </div>
            <div className="stat-card">
              <CheckCircle2 className="w-5 h-5 text-blue-500" />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{t('biodiversity.assessmentCompletion')}</span>
                <InfoTip>{t('biodiversity.assessmentCompletion')}</InfoTip>
              </div>
              <span className="text-2xl font-bold">
                {stats.completionPct != null ? `${stats.completionPct.toFixed(0)}%` : '0%'}
              </span>
            </div>
          </div>

          {/* TNFD-LEAP Progress */}
          {leapProgress.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4">{t('biodiversity.tnfdLeap')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      {LEAP_PHASES.map((phase) => (
                        <th key={phase} className="text-center py-2 px-3 text-gray-500 font-medium">
                          {t(`biodiversity.${phase}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leapProgress.map((site, idx) => (
                      <tr key={site.siteId || idx} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{site.siteName}</td>
                        {LEAP_PHASES.map((phase) => {
                          const status = site[phase]; // 'done', 'in-progress', 'not-started'
                          return (
                            <td key={phase} className="py-2 px-3 text-center">
                              {status === 'done' ? (
                                <span className="inline-flex w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900 items-center justify-center">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                </span>
                              ) : status === 'in-progress' ? (
                                <span className="inline-flex w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900 items-center justify-center">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                </span>
                              ) : (
                                <span className="inline-flex w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center">
                                  <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sensitive Sites */}
          {sites.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-500" />
                {t('biodiversity.sensitiveSites')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('biodiversity.protectedAreas')}</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">{t('biodiversity.totalLandArea')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((site, idx) => (
                      <tr key={site.id || idx} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{site.name}</td>
                        <td className="py-2 px-3">
                          {site.nearProtectedArea ? (
                            <span className="badge bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1 inline" />
                              {site.protectedAreaName || t('biodiversity.protectedAreas')}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-gray-600 dark:text-gray-400">
                          {(site.landArea || 0).toLocaleString()} {t('biodiversity.hectares')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Assessments */}
          {assessments.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4">{t('biodiversity.assessments')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.status')}</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assessments.map((a, idx) => (
                      <tr key={a.id || idx} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{a.siteName || a.name}</td>
                        <td className="py-2 px-3">
                          <span className={clsx('badge text-xs', STATUS_BADGE[a.status] || STATUS_BADGE.draft)}>
                            {t(`biodiversity.${a.status}`) || a.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-500">
                          {a.updatedAt ? new Date(a.updatedAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Direct Drivers Heatmap */}
          {Object.keys(drivers).length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4">{t('biodiversity.directDrivers')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">{t('common.name')}</th>
                      {DRIVER_KEYS.map((dk) => (
                        <th key={dk} className="text-center py-2 px-3 text-gray-500 font-medium text-xs">
                          {t(`biodiversity.${dk}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(drivers).map(([siteName, driverFlags]) => (
                      <tr key={siteName} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{siteName}</td>
                        {DRIVER_KEYS.map((dk) => (
                          <td key={dk} className="py-2 px-3 text-center">
                            {driverFlags[dk] ? (
                              <span className="inline-block w-4 h-4 rounded bg-red-400 dark:bg-red-600" title={t(`biodiversity.${dk}`)} />
                            ) : (
                              <span className="inline-block w-4 h-4 rounded bg-gray-100 dark:bg-gray-800" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
