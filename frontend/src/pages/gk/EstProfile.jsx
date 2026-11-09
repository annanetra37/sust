import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Trash2 } from 'lucide-react';
import gkApi from '../../services/gkApi';
import { ErrorBox, Note, Tone, errText, useLoad } from './ui';
import ProfileForm, { profileFromEst, profilePayload } from './ProfileForm';

function ChangeNotice({ notice, t }) {
  if (!notice) return null;
  if (!notice.changed) return <Note>{t('gk.profile.noApplicabilityChange')}</Note>;
  return (
    <Note tone="warning">
      <p className="font-medium">{t('gk.profile.changeNotice')}</p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {notice.becameApplicable.map((c) => <li key={c.criterionId}><Tone tone="info">{t('gk.profile.nowApplicable')}</Tone> <span className="font-mono">{c.code}</span> {c.title}</li>)}
        {notice.becameNotApplicable.map((c) => <li key={c.criterionId}><Tone tone="neutral">{t('gk.profile.nowNotApplicable')}</Tone> <span className="font-mono">{c.code}</span> {c.title} — {c.reasons.join(' ')}</li>)}
        {notice.typeChanged.map((c) => <li key={c.criterionId}><Tone tone="warning">{t('gk.profile.typeChange', { from: t(`gk.type.${c.from}`), to: t(`gk.type.${c.to}`) })}</Tone> <span className="font-mono">{c.code}</span> {c.title}</li>)}
      </ul>
    </Note>
  );
}

export default function ProfileTab({ est, reloadEst, t }) {
  const navigate = useNavigate();
  const [f, setF] = useState(() => profileFromEst(est));
  const [notice, setNotice] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const clients = useLoad(() => gkApi.clients(), []);
  const brands = (clients.data || []).find((c) => c.id === est.clientId)?.brands || [];

  const save = async () => {
    setBusy(true); setErr(''); setNotice(null);
    try {
      const r = await gkApi.updateEstablishment(est.id, profilePayload(f));
      setNotice(r.changeNotice);
      reloadEst();
    } catch (ex) { setErr(errText(ex)); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm(t('gk.profile.confirmDelete', { name: est.name }))) return;
    try { await gkApi.deleteEstablishment(est.id); navigate('/gk/clients'); } catch (ex) { setErr(errText(ex)); }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <Note>{t('gk.clients.branchRule')}</Note>
      <ChangeNotice notice={notice} t={t} />
      <ErrorBox message={err} />
      <div className="card">
        <ProfileForm value={f} onChange={setF} brands={brands} t={t} />
        <div className="flex flex-wrap justify-between gap-2 mt-6">
          <button className="btn-danger inline-flex items-center gap-1.5" onClick={del}><Trash2 className="w-4 h-4" />{t('gk.profile.delete')}</button>
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={save} disabled={busy || !f.name.trim()}><Save className="w-4 h-4" />{t('gk.profile.save')}</button>
        </div>
      </div>
    </div>
  );
}
