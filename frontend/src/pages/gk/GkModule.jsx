import { Routes, Route } from 'react-router-dom';
import ModuleGate from '../../components/ModuleGate';

// Placeholder — routes for the green_key module are implemented here.
export default function GkModule() {
  return (
    <ModuleGate module="green_key">
      <Routes>
        <Route index element={<div className="card">Coming soon</div>} />
      </Routes>
    </ModuleGate>
  );
}
