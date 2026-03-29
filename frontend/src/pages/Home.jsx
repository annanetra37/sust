import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Leaf, Users2, Shield, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { HelpBanner, InfoTip } from '../components/HelpSystem';

const PILLARS = [
  {
    key: 'E', title: 'Environmental', icon: Leaf, color: 'esg-e', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200',
    description: 'Climate impact, pollution, water usage, biodiversity, and circular economy metrics.',
    items: [
      { id: 'E1', name: 'Climate Change', desc: 'GHG emissions, carbon footprint, SBTi targets', path: '/dashboard/E/environmental-1', active: true },
      { id: 'E2', name: 'Pollution', desc: 'Air, water, soil pollution tracking', badge: 'Under Development' },
      { id: 'E3', name: 'Water & Marine Resources', desc: 'Water consumption and discharge', badge: 'Under Development' },
      { id: 'E4', name: 'Biodiversity & Ecosystems', desc: 'Impact on natural habitats', badge: 'Under Development' },
      { id: 'E5', name: 'Circular Economy', desc: 'Waste management and resource efficiency', badge: 'Upgrade for Enterprise' },
    ],
  },
  {
    key: 'S', title: 'Social', icon: Users2, color: 'esg-s', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200',
    description: 'Workforce composition, diversity, training, and community impact metrics.',
    items: [
      { id: 'S1', name: 'Own Workforce', desc: 'Employee demographics, training, turnover, diversity', path: '/dashboard/S/social-1', active: true },
      { id: 'S2', name: 'Workers in Value Chain', desc: 'Supply chain labor practices', badge: 'Under Development' },
      { id: 'S3', name: 'Affected Communities', desc: 'Community engagement and impact', badge: 'Under Development' },
      { id: 'S4', name: 'Consumers & End-Users', desc: 'Product safety and data privacy', badge: 'Upgrade for Enterprise' },
    ],
  },
  {
    key: 'G', title: 'Governance', icon: Shield, color: 'esg-g', bgColor: 'bg-amber-50', borderColor: 'border-amber-200',
    description: 'Board composition, leadership structure, and corporate governance practices.',
    items: [
      { id: 'G1', name: 'Board Composition & Leadership', desc: 'Board diversity, independence, governance structure', badge: 'Upgrade for Enterprise' },
    ],
  },
];

export default function Home() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState({ E: true, S: true, G: false });

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
          <span className="text-2xl font-bold text-gray-700">ESRS</span>
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
                {pillar.items.map((item) => (
                  <div key={item.id} className={clsx('flex items-center gap-3 p-3 rounded-lg border', item.active ? 'border-gray-200 hover:border-brand-300 hover:bg-brand-50/30' : 'border-gray-100 bg-gray-50')}>
                    <span className={clsx('w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold', item.active ? `${pillar.bgColor} text-${pillar.color}` : 'bg-gray-100 text-gray-400')}>
                      {item.id}
                    </span>
                    <div className="flex-1">
                      <p className={clsx('font-medium text-sm', item.active ? 'text-gray-900' : 'text-gray-400')}>{item.name}</p>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                    </div>
                    {item.active ? (
                      <Link to={item.path} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium">
                        Open <ArrowRight className="w-4 h-4" />
                      </Link>
                    ) : (
                      <span className="badge bg-gray-100 text-gray-500">{item.badge}</span>
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
