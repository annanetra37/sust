import { useState } from 'react';
import S1Dashboard from './S1Dashboard';
import E1Dashboard from './E1Dashboard';

export default function Analytics() {
  const [view, setView] = useState('environmental');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'environmental' ? 'bg-white shadow-sm text-esg-e' : 'text-gray-500'}`}
            onClick={() => setView('environmental')}
          >Environmental</button>
          <button
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'social' ? 'bg-white shadow-sm text-esg-s' : 'text-gray-500'}`}
            onClick={() => setView('social')}
          >Social</button>
        </div>
      </div>
      {view === 'environmental' ? <E1Dashboard /> : <S1Dashboard />}
    </div>
  );
}
