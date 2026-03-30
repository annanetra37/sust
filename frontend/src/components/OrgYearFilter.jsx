import { useState, useEffect } from 'react';
import api from '../services/api';
import { InfoTip } from './HelpSystem';

export default function OrgYearFilter({ filters, onChange }) {
  const [orgUnits, setOrgUnits] = useState([]);
  const [years, setYears] = useState([]);
  const [selected, setSelected] = useState([]);
  const [allSelected, setAllSelected] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    Promise.all([api.getOrgUnits(), api.getDataYears()]).then(([units, yrs]) => {
      setOrgUnits(units);
      setYears(yrs);
      // Auto-select the most recent year with data
      if (yrs.length > 0) {
        const bestYear = yrs[0]; // years are sorted desc
        if (bestYear !== filters.year) {
          onChange({ ...filters, year: bestYear });
        }
      }
      setInitialized(true);
    }).catch(() => setInitialized(true));
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

  if (!initialized) return null;

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="flex items-center gap-1.5">
        <select
          className="input w-auto"
          value={filters.year}
          onChange={(e) => onChange({ ...filters, year: parseInt(e.target.value) })}
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
          {years.length === 0 && <option value={filters.year}>{filters.year}</option>}
        </select>
        <InfoTip>Only years with uploaded data are shown.</InfoTip>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={selectAll}
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            allSelected
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-brand-300'
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
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-brand-300'
            }`}
          >
            {unit.name}
          </button>
        ))}
      </div>
    </div>
  );
}
