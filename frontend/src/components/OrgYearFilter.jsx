import { useState, useEffect } from 'react';
import api from '../services/api';

export default function OrgYearFilter({ filters, onChange }) {
  const [orgUnits, setOrgUnits] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    api.getOrgUnits().then(setOrgUnits).catch(() => {});
  }, []);

  const toggleUnit = (id) => {
    const next = selected.includes(id) ? selected.filter((u) => u !== id) : [...selected, id];
    setSelected(next);
    onChange({ ...filters, orgUnits: next.join(',') });
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <select
        className="input w-auto"
        value={filters.year}
        onChange={(e) => onChange({ ...filters, year: parseInt(e.target.value) })}
      >
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>

      <div className="flex flex-wrap gap-2">
        {orgUnits.map((unit) => (
          <button
            key={unit.id}
            onClick={() => toggleUnit(unit.id)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              selected.includes(unit.id)
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-brand-300'
            }`}
          >
            {unit.name}
          </button>
        ))}
      </div>
    </div>
  );
}
