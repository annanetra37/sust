import { Routes, Route, Navigate } from 'react-router-dom';
import ModuleGate from '../../components/ModuleGate';
import { useT } from '../../i18n';
import Portfolio from './Portfolio';
import Clients from './Clients';
import CriteriaLibrary from './CriteriaLibrary';
import Certificates from './Certificates';
import Establishment from './Establishment';
import { FeeFootnote } from './ui';

// Green Key Readiness module (hotels) — routes under /gk/*.
export default function GkModule() {
  const { t } = useT();
  return (
    <ModuleGate module="green_key">
      <div className="max-w-7xl mx-auto">
        <Routes>
          <Route index element={<Portfolio />} />
          <Route path="clients" element={<Clients />} />
          <Route path="criteria" element={<CriteriaLibrary />} />
          <Route path="certificates" element={<Certificates />} />
          <Route path="establishments/:id" element={<Establishment />} />
          <Route path="establishments/:id/:tab" element={<Establishment />} />
          <Route path="*" element={<Navigate to="/gk" replace />} />
        </Routes>
        <FeeFootnote t={t} />
      </div>
    </ModuleGate>
  );
}
