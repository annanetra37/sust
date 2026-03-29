import { useState, useEffect } from 'react';
import api from '../services/api';
import { InfoTip } from './HelpSystem';

export default function OrgYearFilter({ filters, onChange }) {
  const [orgUnits, setOrgUnits] = useState([]);
  const [years, setYears] = useState([]);
  const [selected, setSelected] = useState([]);
  const [allSelected, setAllSelected] = useState(true);

  useEffect(() => {
    Promise.all([api.getOrgUnits(), api.getDataYears()]).then(([units, yrs]) => {
      setOrgUnits(units);
      setYears(yrs);
      // Default to most recent year with data
      if (yrs.length > 0 && !filters.year) {
        onChange({ ...filters, year: yrs[0] });
      }
    }).catch(() => {});
  }, []);

  const toggleUnit = (id) => {
    const next = selected.includes(id) ? selected.filter((u) => u !== id) : [...selected, id];
    setSelected(next);
    setAllSelected(next.length === 0);
    onChange({ ...filters, orgUnits: next.join(',') });
  };

  const selectAll = () => {
    setSelected([]);
    setAllSelected(true);
    onChange({ ...filters, orgUnits: '' });
  };

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="flex items-center gap-1.5">
        <select
          className="input w-auto"
          value={filters.year}
          onChange={(e) => onChange({ ...filters, year: parseInt(e.target.value) })}
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <InfoTip>Only years with uploaded data are shown.</InfoTip>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={selectAll}
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            allSelected
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-brand-300'
          }`}
        >
          All Units
        </button>
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
