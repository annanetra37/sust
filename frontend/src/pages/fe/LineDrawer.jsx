import { useEffect, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import feApi from '../../services/feApi';
import { useT } from '../../i18n';
import { Modal, ErrorBox, Spinner, DqBadge, IllustrativeBanner, fmt, fmtT, errText } from './common';

// Lineage for one line: inputs → factor (set / version / source) →
// attribution → result → explanation (FE-11 drill-down, FE-27 trail).
export default function LineDrawer({ exposureId, runId, onClose }) {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    feApi.lineage(exposureId, runId).then(setData).catch((err) => setError(errText(err, t('fe.errors.load'))));
  }, [exposureId, runId, t]);

  const e = data?.exposure;
  const c = data?.counterparty;
  const r = data?.result;
  const cur = e?.currency || '';

  const Row = ({ label, value }) => (value == null || value === '' ? null : (
    <div className="flex justify-between gap-3 py-1 border-b last:border-b-0 border-gray-100 dark:border-gray-800 text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-gray-900 dark:text-gray-100 text-right break-all">{value}</span>
    </div>
  ));
  const Step = ({ n, title, children }) => (
    <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{n}. {title}</p>
      {children}
    </section>
  );
  const Arrow = () => <div className="flex justify-center text-gray-300 dark:text-gray-600"><ArrowDown className="w-4 h-4" /></div>;

  return (
    <Modal title={e ? t('fe.lineage.title', { ref: e.facilityRef }) : t('fe.lineage.loading')} onClose={onClose} wide>
      <ErrorBox message={error} />
      {!data && !error && <Spinner />}
      {data && (
        <div className="space-y-2">
          <IllustrativeBanner factorSet={data.factorSet} />
          <Step n={1} title={t('fe.lineage.inputs')}>
            <Row label={t('fe.fields.assetClass')} value={t(`fe.assetClasses.${e.assetClass}`)} />
            <Row label={t('fe.fields.outstanding')} value={`${cur} ${fmt(e.outstanding)}`} />
            <Row label={t('fe.fields.undrawn')} value={e.undrawn != null ? `${cur} ${fmt(e.undrawn)}` : null} />
            <Row label={t('fe.fields.valueAtOrigination')} value={e.valueAtOrigination != null ? `${cur} ${fmt(e.valueAtOrigination)}` : null} />
            <Row label={t('fe.fields.propertyType')} value={e.propertyType} />
            <Row label={t('fe.fields.floorAreaM2')} value={e.floorAreaM2 != null ? `${fmt(e.floorAreaM2)} m²` : null} />
            <Row label={t('fe.fields.energyKwh')} value={e.energyKwh != null ? `${fmt(e.energyKwh)} kWh` : null} />
            <Row label={t('fe.fields.energyLabel')} value={e.energyLabel} />
            <Row label={t('fe.fields.branch')} value={e.branch} />
            <Row label={t('fe.fields.segment')} value={e.segment} />
            {c && (
              <>
                <Row label={t('fe.fields.stableId')} value={c.stableId} />
                <Row label={t('fe.fields.name')} value={c.name} />
                <Row label={t('fe.fields.naceCode')} value={c.naceCode || c.localSectorCode} />
                <Row label={t('fe.fields.revenue')} value={c.revenue != null ? `${c.revenueCurrency || cur} ${fmt(c.revenue)}` : null} />
                <Row label={t('fe.fields.equityPlusDebt')} value={c.equityPlusDebt != null ? `${cur} ${fmt(c.equityPlusDebt)}` : null} />
                {c.emissions?.length > 0 && (
                  <Row label={t('fe.lineage.emissionRecords')} value={c.emissions.map((x) => `${x.year} ${t(`fe.sources.${x.source}`)}${x.verified ? ` ✓ ${t('fe.counterparties.verified')}` : ''}: ${fmtT((x.scope1 || 0) + (x.scope2 || 0))} t`).join(' · ')} />
                )}
              </>
            )}
          </Step>
          <Arrow />
          <Step n={2} title={t('fe.lineage.factor')}>
            {data.factorSet ? (
              <>
                <Row label={t('fe.lineage.set')} value={`${data.factorSet.name} v${data.factorSet.version}`} />
                <Row label={t('fe.lineage.source')} value={data.factorSet.source} />
              </>
            ) : <p className="text-sm text-gray-500">{t('fe.lineage.noSet')}</p>}
            {data.factor?.map((f) => (
              <Row key={f.id} label={`${f.kind} · ${f.key}${f.region ? ` · ${f.region}` : ''}`} value={`${fmt(f.value, 4)} ${f.unit}`} />
            ))}
            {r && !data.factor?.length && r.method && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('fe.lineage.noLibraryFactor')}</p>}
          </Step>
          <Arrow />
          <Step n={3} title={t('fe.lineage.attribution')}>
            <Row label={t('fe.fields.outstanding')} value={`${cur} ${fmt(data.attributionInputs.numerator)}`} />
            <Row label={t(`fe.fields.${data.attributionInputs.denominatorLabel}`)} value={data.attributionInputs.denominator != null ? `${cur} ${fmt(data.attributionInputs.denominator)}` : t('fe.lineage.missing')} />
            <Row label={t('fe.lineage.attributionFactor')} value={r?.attribution != null ? fmt(r.attribution, 4) : '—'} />
          </Step>
          <Arrow />
          <Step n={4} title={t('fe.lineage.result')}>
            {!r && <p className="text-sm text-gray-500">{t('fe.lineage.noRun')}</p>}
            {r && r.exception && <ErrorBox message={r.exception} />}
            {r && !r.exception && (
              <>
                <Row label={t('fe.lineage.financed')} value={`${fmtT(r.financedTotal)} tCO2e`} />
                <Row label={t('fe.lineage.scope1')} value={r.financedScope1 != null ? `${fmtT(r.financedScope1)} tCO2e` : null} />
                <Row label={t('fe.lineage.scope2')} value={r.financedScope2 != null ? `${fmtT(r.financedScope2)} tCO2e` : null} />
                <Row label={t('fe.lineage.undrawn')} value={r.undrawnFinanced != null ? `${fmtT(r.undrawnFinanced)} tCO2e` : null} />
                <div className="flex justify-between gap-3 py-1 text-sm"><span className="text-gray-500 dark:text-gray-400">{t('fe.fields.dq')}</span><DqBadge score={r.dqScore} /></div>
                <Row label={t('fe.lineage.method')} value={r.method} />
                <p className="text-sm text-gray-800 dark:text-gray-200 mt-2 p-2 rounded bg-gray-50 dark:bg-gray-800">{r.explanation}</p>
              </>
            )}
          </Step>
          {data.run && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 break-all pt-1">
              {t('fe.lineage.runInfo', { id: data.run.id.slice(0, 8), date: new Date(data.run.createdAt).toLocaleString(), method: data.run.methodologyVersion })} · {t('fe.calc.inputsHash')}: {data.run.inputsHash.slice(0, 16)}…
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
