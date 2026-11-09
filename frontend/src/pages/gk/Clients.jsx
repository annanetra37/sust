import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Building2, Hotel, Tag, MapPin, X } from 'lucide-react';
import gkApi from '../../services/gkApi';
import { useT } from '../../i18n';
import { Loading, ErrorBox, Modal, Field, Note, errText, useLoad } from './ui';
import ProfileForm, { emptyProfile, profilePayload } from './ProfileForm';

const CLIENT_TYPES = ['group', 'owner', 'operator'];

function ClientForm({ initial, onClose, onSaved, t }) {
  const [f, setF] = useState(initial ? { name: initial.name, clientType: initial.clientType, country: initial.country || '' } : { name: '', clientType: 'group', country: 'AM' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true); setErr('');
    try {
      const out = initial ? await gkApi.updateClient(initial.id, f) : await gkApi.createClient(f);
      onSaved(out);
    } catch (ex) { setErr(errText(ex)); } finally { setBusy(false); }
  };
  return (
    <Modal title={initial ? t('gk.clients.edit') : t('gk.clients.new')} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('gk.cancel')}</button><button className="btn-primary" disabled={busy || !f.name.trim()} onClick={save}>{t('gk.save')}</button></>}
    >
      <form onSubmit={save} className="space-y-3">
        <ErrorBox message={err} />
        <Field label={t('gk.clients.name')}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-2">
          <Field label={t('gk.clients.type')}>
            <select className="input" value={f.clientType} onChange={(e) => setF({ ...f, clientType: e.target.value })}>
              {CLIENT_TYPES.map((c) => <option key={c} value={c}>{t(`gk.clientType.${c}`)}</option>)}
            </select>
          </Field>
          <Field label={t('gk.profile.country')}><input className="input uppercase" maxLength={2} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase() })} /></Field>
        </div>
      </form>
    </Modal>
  );
}

function EstablishmentCreate({ client, onClose, onSaved, t }) {
  const [f, setF] = useState({ ...emptyProfile(), country: client.country || 'AM' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    try { onSaved(await gkApi.createEstablishment({ ...profilePayload(f), clientId: client.id })); } catch (ex) { setErr(errText(ex)); } finally { setBusy(false); }
  };
  return (
    <Modal title={t('gk.clients.newEstablishment', { client: client.name })} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('gk.cancel')}</button><button className="btn-primary" disabled={busy || !f.name.trim()} onClick={save}>{t('gk.create')}</button></>}
    >
      <div className="space-y-4">
        <Note>{t('gk.clients.branchRule')}</Note>
        <ErrorBox message={err} />
        <ProfileForm value={f} onChange={setF} brands={client.brands} t={t} />
      </div>
    </Modal>
  );
}

export default function Clients() {
  const { t } = useT();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useLoad(() => gkApi.clients(), []);
  const [modal, setModal] = useState(null);
  const [brandName, setBrandName] = useState({});
  const [err, setErr] = useState('');

  const addBrand = async (client) => {
    const name = (brandName[client.id] || '').trim();
    if (!name) return;
    try { await gkApi.createBrand(client.id, { name }); setBrandName({ ...brandName, [client.id]: '' }); reload(); } catch (ex) { setErr(errText(ex)); }
  };
  const del = async (fn, msg) => {
    if (!window.confirm(msg)) return;
    try { await fn(); reload(); } catch (ex) { setErr(errText(ex)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('gk.clients.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('gk.clients.subtitle')}</p>
        </div>
        <button className="btn-primary inline-flex items-center gap-1.5" onClick={() => setModal({ kind: 'client' })}><Plus className="w-4 h-4" />{t('gk.clients.new')}</button>
      </div>
      <Note>{t('gk.clients.branchRule')}</Note>
      <ErrorBox message={error || err} />
      {loading ? <Loading /> : data && data.length === 0 ? (
        <div className="card text-center py-12">
          <Hotel className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-gray-700 dark:text-gray-300">{t('gk.clients.empty')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(data || []).map((c) => (
            <div key={c.id} className="card !p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Building2 className="w-4 h-4 shrink-0" /><span className="truncate">{c.name}</span></h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t(`gk.clientType.${c.clientType}`)}{c.country ? ` · ${c.country}` : ''} · {t('gk.clients.estN', { n: c.establishments.length })}</p>
                </div>
                <div className="flex gap-1">
                  <button className="btn-secondary !px-2 !py-1.5" onClick={() => setModal({ kind: 'client', client: c })} aria-label={t('gk.edit')}><Pencil className="w-4 h-4" /></button>
                  <button className="btn-secondary !px-2 !py-1.5 text-red-600" onClick={() => del(() => gkApi.deleteClient(c.id), t('gk.clients.confirmDelete', { name: c.name }))} aria-label={t('gk.delete')}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                <Tag className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                <span className="text-xs text-gray-500 dark:text-gray-400">{t('gk.clients.brands')}:</span>
                {c.brands.length === 0 && <span className="text-xs text-gray-400">{t('gk.clients.noBrands')}</span>}
                {c.brands.map((b) => (
                  <span key={b.id} className="badge bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 gap-1">
                    {b.name}
                    <button onClick={() => del(() => gkApi.deleteBrand(b.id), t('gk.clients.confirmDeleteBrand', { name: b.name }))} aria-label={t('gk.delete')}><X className="w-3 h-3" /></button>
                  </span>
                ))}
                <input className="input !w-36 !py-1 text-xs" placeholder={t('gk.clients.brandPlaceholder')} value={brandName[c.id] || ''} onChange={(e) => setBrandName({ ...brandName, [c.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addBrand(c)} />
                <button className="text-xs text-brand-700 dark:text-brand-300 hover:underline" onClick={() => addBrand(c)}>{t('gk.add')}</button>
              </div>

              <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
                {c.establishments.map((e) => (
                  <li key={e.id} className="py-2 flex items-center justify-between gap-2">
                    <Link to={`/gk/establishments/${e.id}`} className="min-w-0 flex items-center gap-2 text-sm text-brand-700 dark:text-brand-300 hover:underline">
                      <Hotel className="w-4 h-4 shrink-0" /><span className="truncate">{e.name}</span>
                    </Link>
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 shrink-0"><MapPin className="w-3 h-3" />{e.city || e.country}</span>
                  </li>
                ))}
              </ul>
              <button className="btn-secondary mt-3 inline-flex items-center gap-1.5 text-sm" onClick={() => setModal({ kind: 'est', client: c })}><Plus className="w-4 h-4" />{t('gk.clients.addEstablishment')}</button>
            </div>
          ))}
        </div>
      )}
      {modal?.kind === 'client' && <ClientForm initial={modal.client} t={t} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'est' && <EstablishmentCreate client={modal.client} t={t} onClose={() => setModal(null)} onSaved={(e) => navigate(`/gk/establishments/${e.id}`)} />}
    </div>
  );
}
