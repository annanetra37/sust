import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Leaf, Users2, Shield, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { HelpBanner, InfoTip } from '../components/HelpSystem';
import api from '../services/api';

const PILLARS = [
  {
    key: 'E', title: 'Environmental', icon: Leaf, color: 'esg-e', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200',
    description: 'Climate impact, pollution, water usage, biodiversity, and circular economy metrics.',
    items: [
      { id: 'ENV', name: 'Climate & Emissions', desc: 'GHG emissions (Scope 1/2/3), carbon footprint, decarbonization targets', path: '/dashboard/E/environmental-1', active: true, standards: 'ESRS E1 · GRI 305 · TCFD · CDP' },
      { id: 'ENV', name: 'Pollution & Waste', desc: 'Air, water, soil pollution and waste management tracking', badge: 'Under Development', standards: 'ESRS E2 · GRI 306' },
      { id: 'ENV', name: 'Water Resources', desc: 'Water consumption, discharge, and stress area assessment', badge: 'Under Development', standards: 'ESRS E3 · GRI 303' },
      { id: 'ENV', name: 'Biodiversity', desc: 'Impact on ecosystems, habitats, and protected areas', badge: 'Under Development', standards: 'ESRS E4 · GRI 304' },
      { id: 'ENV', name: 'Circular Economy', desc: 'Resource efficiency, material flows, and product lifecycle', badge: 'Upgrade for Enterprise', standards: 'ESRS E5 · GRI 301' },
    ],
  },
  {
    key: 'S', title: 'Social', icon: Users2, color: 'esg-s', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200',
    description: 'Workforce composition, diversity, training, and community impact metrics.',
    items: [
      { id: 'SOC', name: 'Workforce & Employees', desc: 'Employee demographics, DEI, training hours, turnover rates', path: '/dashboard/S/social-1', active: true, standards: 'ESRS S1 · GRI 401-405 · SASB' },
      { id: 'SOC', name: 'Supply Chain Labor', desc: 'Working conditions and labor rights across the value chain', badge: 'Under Development', standards: 'ESRS S2 · GRI 414' },
      { id: 'SOC', name: 'Community Impact', desc: 'Local community engagement, indigenous rights, social investment', badge: 'Under Development', standards: 'ESRS S3 · GRI 413' },
      { id: 'SOC', name: 'Consumer Protection', desc: 'Product safety, data privacy, and responsible marketing', badge: 'Upgrade for Enterprise', standards: 'ESRS S4 · GRI 416-418' },
    ],
  },
  {
    key: 'G', title: 'Governance', icon: Shield, color: 'esg-g', bgColor: 'bg-amber-50', borderColor: 'border-amber-200',
    description: 'Board composition, leadership structure, and corporate governance practices.',
    items: [
      { id: 'GOV', name: 'Board & Leadership', desc: 'Board diversity, independence, executive compensation', badge: 'Upgrade for Enterprise', standards: 'ESRS G1 · GRI 405 · TCFD' },
      { id: 'GOV', name: 'Ethics & Compliance', desc: 'Anti-corruption, whistleblowing, political contributions', badge: 'Upgrade for Enterprise', standards: 'ESRS G1 · GRI 205-206' },
    ],
  },
];

export default function Home() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState({ E: true, S: true, G: false });
  const [standard, setStandard] = useState('');

  useEffect(() => {
    api.getEsgStandard().then((d) => setStandard(d.standard)).catch(() => {});
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.firstName}</h1>
        <p className="text-gray-500 mt-1">ESG Data Management & Reporting Platform</p>
      </div>

      <HelpBanner
        id="home-welcome"
        title="Welcome to the Triple I ESG Portal"
        variant="tip"
      >
        Start by uploading workforce data (S1) or emissions data (E1) using the modules below.
        Our AI will automatically clean and structure your data, no matter the format or language.
        Click the chat bubble in the bottom-right corner anytime to ask your AI assistant for help.
      </HelpBanner>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">Credits Available</span>
            <InfoTip title="What are credits?">Credits are consumed when you process data. Excel uploads cost 1 credit per row. Document extractions cost 2 credits per document. Your balance is shown here.</InfoTip>
          </div>
          <span className="text-2xl font-bold text-brand-700">{user?.company?.creditBalance ?? 0}</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">Active Modules</span>
            <InfoTip title="ESG Modules">Currently E1 (Climate Change) and S1 (Own Workforce) are active. Other modules (E2-E5, S2-S4, G1) are coming soon or available with Enterprise.</InfoTip>
          </div>
          <span className="text-2xl font-bold text-esg-e">2 of 10</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">Reporting Standard</span>
            <InfoTip title="Reporting Standard">The ESG standard used for compliance reports. ESRS (European Sustainability Reporting Standards) is the default for CSRD. Change this in Settings.</InfoTip>
          </div>
          <span className="text-2xl font-bold text-gray-700">{standard || '—'}</span>
        </div>
      </div>

      {/* ESG Pillars */}
      {PILLARS.map((pillar) => {
        const isExpanded = expanded[pillar.key];
        return (
          <div key={pillar.key} className={clsx('card border-l-4', pillar.borderColor)}>
            <button
              onClick={() => setExpanded((p) => ({ ...p, [pillar.key]: !p[pillar.key] }))}
              className="w-full flex items-center gap-3"
            >
              <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', pillar.bgColor)}>
                <pillar.icon className={clsx('w-5 h-5', `text-${pillar.color}`)} />
              </div>
              <div className="flex-1 text-left">
                <h2 className="font-semibold text-lg">{pillar.title}</h2>
                <p className="text-sm text-gray-500">{pillar.description}</p>
              </div>
              {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {isExpanded && (
              <div className="mt-4 grid gap-3">
                {pillar.items.map((item, idx) => (
                  <div key={item.name + idx} className={clsx('flex items-center gap-3 p-3 rounded-lg border', item.active ? 'border-gray-200 hover:border-brand-300 hover:bg-brand-50/30' : 'border-gray-100 bg-gray-50')}>
                    <span className={clsx('w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0', item.active ? `${pillar.bgColor} text-${pillar.color}` : 'bg-gray-100 text-gray-400')}>
                      {item.id.charAt(0)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={clsx('font-medium text-sm', item.active ? 'text-gray-900' : 'text-gray-400')}>{item.name}</p>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                      {item.standards && (
                        <p className="text-[10px] text-gray-300 mt-0.5">{item.standards}</p>
                      )}
                    </div>
                    {item.active ? (
                      <Link to={item.path} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium shrink-0">
                        Open <ArrowRight className="w-4 h-4" />
                      </Link>
                    ) : (
                      <span className="badge bg-gray-100 text-gray-500 shrink-0">{item.badge}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
