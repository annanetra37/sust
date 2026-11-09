import { Field, Check, Note } from './ui';

// Establishment profile fields (GK-02), shared by "new establishment" and the Profile tab.
export const emptyProfile = () => ({
  name: '', category: 'hotels_hostels', country: 'AM', city: '', rooms: '', beds: '', employees: '', seasonal: false,
  facilities: { restaurant: false, animals: false, outsourcedHousekeeping: false, pool: false, meetingSpaceM2: '' },
  criteriaVersion: '2026-2031', priorPeriods: 0, transition: false, dispensation: false, brandId: '',
});

export function profileFromEst(e) {
  return {
    name: e.name, category: e.category, country: e.country, city: e.city || '', rooms: e.rooms ?? '', beds: e.beds ?? '', employees: e.employees ?? '',
    seasonal: e.seasonal, facilities: { ...emptyProfile().facilities, ...(e.facilities || {}), meetingSpaceM2: e.facilities?.meetingSpaceM2 ?? '' },
    criteriaVersion: e.criteriaVersion, priorPeriods: e.priorPeriods, transition: e.transition, dispensation: e.dispensation, brandId: e.brandId || '',
  };
}

export function profilePayload(f) {
  const n = (v) => (v === '' || v == null ? null : Number(v));
  return {
    name: f.name, category: f.category, country: f.country, city: f.city, rooms: n(f.rooms), beds: n(f.beds), employees: n(f.employees),
    seasonal: f.seasonal, facilities: { ...f.facilities, meetingSpaceM2: n(f.facilities.meetingSpaceM2) },
    criteriaVersion: f.criteriaVersion, priorPeriods: n(f.priorPeriods) ?? 0, transition: f.transition, dispensation: f.dispensation,
    brandId: f.brandId || null,
  };
}

const CATEGORIES = ['hotels_hostels', 'small_accommodations', 'campsites', 'other'];
const FACILITIES = ['restaurant', 'animals', 'outsourcedHousekeeping', 'pool'];

export default function ProfileForm({ value, onChange, brands = [], t }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const setF = (k, v) => onChange({ ...value, facilities: { ...value.facilities, [k]: v } });
  return (
    <div className="space-y-5">
      <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-2">
        <Field label={t('gk.profile.name')} className="sm:col-span-2"><input className="input" value={value.name} onChange={(e) => set('name', e.target.value)} required /></Field>
        <Field label={t('gk.profile.category')}>
          <select className="input" value={value.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`gk.category.${c}`)}</option>)}
          </select>
        </Field>
        {brands.length > 0 && (
          <Field label={t('gk.profile.brand')}>
            <select className="input" value={value.brandId} onChange={(e) => set('brandId', e.target.value)}>
              <option value="">{t('gk.profile.noBrand')}</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        )}
        <Field label={t('gk.profile.country')} hint={t('gk.profile.countryHint')}><input className="input uppercase" maxLength={2} value={value.country} onChange={(e) => set('country', e.target.value.toUpperCase())} /></Field>
        <Field label={t('gk.profile.city')}><input className="input" value={value.city} onChange={(e) => set('city', e.target.value)} /></Field>
      </div>
      <Note tone="neutral">{t('gk.profile.categoryCheck')}</Note>

      <div className="grid [&>*]:min-w-0 gap-3 grid-cols-3">
        <Field label={t('gk.profile.rooms')}><input type="number" min="0" className="input" value={value.rooms} onChange={(e) => set('rooms', e.target.value)} /></Field>
        <Field label={t('gk.profile.beds')}><input type="number" min="0" className="input" value={value.beds} onChange={(e) => set('beds', e.target.value)} /></Field>
        <Field label={t('gk.profile.employees')}><input type="number" min="0" className="input" value={value.employees} onChange={(e) => set('employees', e.target.value)} /></Field>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-3">{t('gk.profile.employeesHint')}</p>

      <fieldset>
        <legend className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{t('gk.profile.facilities')}</legend>
        <div className="grid [&>*]:min-w-0 gap-2 sm:grid-cols-2">
          <Check label={t('gk.profile.seasonal')} checked={value.seasonal} onChange={(v) => set('seasonal', v)} />
          {FACILITIES.map((f) => <Check key={f} label={t(`gk.facility.${f}`)} checked={value.facilities[f]} onChange={(v) => setF(f, v)} />)}
        </div>
        <Field label={t('gk.facility.meetingSpaceM2')} className="mt-3 sm:w-1/2"><input type="number" min="0" className="input" value={value.facilities.meetingSpaceM2} onChange={(e) => setF('meetingSpaceM2', e.target.value)} /></Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{t('gk.profile.certification')}</legend>
        <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-2">
          <Field label={t('gk.profile.criteriaVersion')}>
            <select className="input" value={value.criteriaVersion} onChange={(e) => set('criteriaVersion', e.target.value)}>
              <option value="2026-2031">2026–2031</option>
              <option value="2022-2026">2022–2026 ({t('gk.profile.legacy')})</option>
            </select>
          </Field>
          <Field label={t('gk.profile.priorPeriods')} hint={t('gk.profile.priorPeriodsHint')}><input type="number" min="0" className="input" value={value.priorPeriods} onChange={(e) => set('priorPeriods', e.target.value)} /></Field>
        </div>
        <Check label={t('gk.profile.transition')} hint={t('gk.profile.transitionHint')} checked={value.transition} onChange={(v) => set('transition', v)} />
        <Check label={t('gk.profile.dispensation')} hint={t('gk.profile.dispensationHint')} checked={value.dispensation} onChange={(v) => set('dispensation', v)} />
      </fieldset>
    </div>
  );
}
