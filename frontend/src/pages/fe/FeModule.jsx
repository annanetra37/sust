import { Routes, Route, Navigate } from 'react-router-dom';
import ModuleGate from '../../components/ModuleGate';
import { FeSelectionProvider } from './common';
import Overview from './Overview';
import Portfolios from './Portfolios';
import Intake from './Intake';
import Counterparties from './Counterparties';
import Calculations from './Calculations';
import Review from './Review';
import Reports from './Reports';
import Factors from './Factors';

// Financed Emissions module (PCAF Part A) — mounted at /fe/*.
export default function FeModule() {
  return (
    <ModuleGate module="financed_emissions">
      <FeSelectionProvider>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="portfolios" element={<Portfolios />} />
          <Route path="intake" element={<Intake />} />
          <Route path="counterparties" element={<Counterparties />} />
          <Route path="calculations" element={<Calculations />} />
          <Route path="review" element={<Review />} />
          <Route path="reports" element={<Reports />} />
          <Route path="factors" element={<Factors />} />
          <Route path="*" element={<Navigate to="/fe" replace />} />
        </Routes>
      </FeSelectionProvider>
    </ModuleGate>
  );
}
