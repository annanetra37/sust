import { Routes, Route } from 'react-router-dom';
import ModuleGate from '../../components/ModuleGate';

// Placeholder — routes for the financed_emissions module are implemented here.
export default function FeModule() {
  return (
    <ModuleGate module="financed_emissions">
      <Routes>
        <Route index element={<div className="card">Coming soon</div>} />
      </Routes>
    </ModuleGate>
  );
}
