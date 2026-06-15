#!/usr/bin/env node
/**
 * Fix biodiversity.wizard and water.wizard sections in es.json
 * to match the flat-key structure used in en.json.
 */

const fs = require('fs');
const path = require('path');

const esPath = path.join(__dirname, 'es.json');
const enPath = path.join(__dirname, 'en.json');

// Read both files
const es = JSON.parse(fs.readFileSync(esPath, 'utf8'));
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// ─── Replace biodiversity.wizard ────────────────────────────────────────────
// The en.json uses flat keys like: locateTitle, siteName, driver_landUseChange_title, etc.
// The es.json currently uses nested objects like: step1.title, drivers.landUseChange.title, etc.
// We need to replace es biodiversity.wizard with the flat-key Spanish translations.

es.biodiversity.wizard = {
  locateTitle: "¿Dónde opera usted?",
  locateSubtitle: "Comencemos mapeando sus sitios operativos. Verificaremos si alguno se encuentra cerca de áreas ecológicamente sensibles.",
  locateInfoTitle: en.biodiversity.wizard.locateInfoTitle, // keep English if no Spanish provided — but let's check
  locateInfoBody: en.biodiversity.wizard.locateInfoBody,
  siteName: "Nombre del sitio",
  siteNamePlaceholder: "ej. Fábrica principal Madrid",
  country: "País",
  countryPlaceholder: "ej. España",
  city: "Ciudad / Dirección",
  cityPlaceholder: "ej. Madrid",
  siteType: "Tipo de sitio",
  siteLabel: "Sitio {n}",
  addSite: "Agregar otro sitio",
  removeSite: "Eliminar",
  evaluateTitle: "¿Cómo es el entorno?",
  evaluateSubtitle: "Comprendamos el entorno natural de cada uno de sus sitios.",
  evalNearNature: "¿Su sitio está ubicado en o junto a un bosque, humedal o reserva natural?",
  evalUsesWater: "¿Su empresa utiliza agua de fuentes naturales (ríos, lagos, aguas subterráneas)?",
  evalProducesWaste: "¿Su empresa produce residuos que podrían afectar la naturaleza cercana?",
  ecosystemType: "¿Qué tipo de ecosistema hay cerca?",
  assessTitle: "¿Qué podría afectar a la naturaleza?",
  assessSubtitle: "Identifiquemos qué podría impactar la biodiversidad cerca de sus sitios.",
  prepareTitle: "¿Cuál es su plan?",
  prepareSubtitle: "¡Gran progreso! Ahora documentemos su respuesta a los impactos identificados.",
  suggestedActions: "Acciones sugeridas",
  existingActions: "¿Qué está haciendo ya para proteger la naturaleza?",
  existingActionsPlaceholder: "ej. Tenemos una política de cero deforestación, monitoreamos la calidad del agua trimestralmente...",
  targets: "¿Qué objetivos ha establecido?",
  targetsPlaceholder: "ej. Cero deforestación neta para 2030, reducción del 50% en contaminación del agua...",
  resultsTitle: "Su puntuación de biodiversidad",
  resultsSubtitle: "¡Felicitaciones! Ha completado su primera evaluación de biodiversidad.",
  sitesAssessedLabel: "Sitios evaluados",
  impactsLabel: "Factores identificados",
  actionsLabel: "Acciones documentadas",
  whatThisMeansTitle: "Qué significa esto para su informe",
  whatThisMeansBody: "Sus datos de biodiversidad alimentan las divulgaciones GRI 101 (Biodiversidad) y ESRS E4 (Biodiversidad y Ecosistemas). Esta evaluación es su punto de partida para comprender y gestionar sus impactos relacionados con la naturaleza.",
  downloadReport: "Descargar informe de evaluación",
  goToDashboard: "Guardar e ir al panel",
  yes: "Sí",
  no: "No",
  unsure: "No estoy seguro",
  back: "Atrás",
  next: "Siguiente",
  cancel: "Cancelar",
  stepName_locate: "Localizar",
  stepName_evaluate: "Evaluar",
  stepName_assess: "Analizar",
  stepName_prepare: "Planificar",
  stepName_results: "Resultados",
  siteType_factory: "Fábrica",
  siteType_office: "Oficina",
  siteType_warehouse: "Almacén",
  siteType_retail: "Tienda",
  siteType_dataCenter: "Centro de datos",
  siteType_other: "Otro",
  ecosystem_forest: "Bosque",
  ecosystem_wetland: "Humedal",
  ecosystem_grassland: "Pradera",
  ecosystem_marine: "Marino",
  ecosystem_urban: "Urbano",
  ecosystem_agricultural: "Agrícola",
  driver_landUseChange_title: "Cambio de uso de tierra/mar",
  driver_landUseChange_desc: "¿Su empresa ha construido sobre, convertido o despejado tierras naturales?",
  driver_landUseChange_suggestion: "Considere la restauración del hábitat o la compensación de la conversión de tierras.",
  driver_resourceExploitation_title: "Explotación de recursos",
  driver_resourceExploitation_desc: "¿Su empresa extrae materiales de la naturaleza (minería, tala, pesca)?",
  driver_resourceExploitation_suggestion: "Considere políticas de abastecimiento sostenible y reducción de los volúmenes de extracción.",
  driver_climateChange_title: "Cambio climático",
  driver_climateChange_desc: "¿Su empresa contribuye significativamente a las emisiones de gases de efecto invernadero?",
  driver_climateChange_suggestion: "Considere vincular sus datos de emisiones E1 y establecer objetivos de reducción.",
  driver_pollution_title: "Contaminación",
  driver_pollution_desc: "¿Su sitio libera sustancias al agua, aire o suelo?",
  driver_pollution_suggestion: "Considere monitorear la calidad de las descargas y establecer objetivos de reducción.",
  driver_invasiveSpecies_title: "Especies invasoras",
  driver_invasiveSpecies_desc: "¿Su empresa ha introducido especies no nativas en alguna zona?",
  driver_invasiveSpecies_suggestion: "Considere realizar inventarios de especies e implementar medidas de bioseguridad."
};

// ─── Replace water.wizard ───────────────────────────────────────────────────
// The en.json uses flat keys like: step1Title, municipal, step2Title, etc.
// The es.json currently uses a different flat-key scheme (sourcesTitle, sourceMunicipal, etc.)
// We need to match the en.json key names with Spanish values.

es.water.wizard = {
  step1Title: "¿De dónde proviene su agua?",
  step1Subtitle: "Registremos su consumo de agua – es más fácil de lo que piensa. La mayoría de las empresas ya tienen estos datos en sus facturas de servicios.",
  step1Explain: "Si no sabe de dónde proviene su agua, consulte sus facturas – la mayoría de las empresas usan agua municipal (terceros).",
  municipal: "Municipal / Terceros",
  surfaceWater: "Agua superficial",
  groundwater: "Agua subterránea",
  seawater: "Agua de mar",
  rainwater: "Agua de lluvia",
  step2Title: "¿Cuánta agua utiliza?",
  step2Subtitle: "Ingrese sus volúmenes de agua para cada fuente. ¿No tiene cifras exactas? Las estimaciones sirven por ahora.",
  withdrawalLabel: "Extracción",
  dischargeLabel: "Descarga",
  consumptionCalc: "Consumo = Extracción - Descarga",
  unitLabel: "Unidad",
  unitM3: "m³",
  unitLitres: "litros",
  unitGallons: "galones",
  estimatesOk: "¿No tiene cifras exactas? No hay problema – las estimaciones sirven por ahora. Puede refinarlas después.",
  step3Title: "¿Recicla agua?",
  step3Subtitle: "El reciclaje de agua significa reutilizar agua tratada en sus operaciones en lugar de extraer agua fresca.",
  recycleExplain: "El agua reciclada reduce su huella ambiental y se ve excelente en su informe de sostenibilidad.",
  recycleYes: "Sí, reciclamos agua",
  recycleNo: "No, aún no",
  recycleVolume: "¿Cuánta agua recicla por año?",
  step4Title: "Su huella hídrica",
  step4Subtitle: "¡Excelente trabajo! Aquí tiene un resumen de su consumo de agua.",
  whatThisMeans: "Qué significa esto para su informe",
  gri303Explain: "Sus datos de agua alimentan las divulgaciones GRI 303 (Agua y Efluentes) y ESRS E3 (Agua y Recursos Marinos). Estos son indicadores clave que los inversores y reguladores examinan para comprender su impacto ambiental.",
  addMoreDetail: "Agregar más detalle",
  goToDashboard: "Ir al panel",
  back: "Atrás",
  next: "Siguiente"
};

// ─── Write the file ─────────────────────────────────────────────────────────
const output = JSON.stringify(es, null, 2);

// Validate it's valid JSON by re-parsing
try {
  JSON.parse(output);
  console.log('JSON validation: PASSED');
} catch (e) {
  console.error('JSON validation: FAILED', e.message);
  process.exit(1);
}

fs.writeFileSync(esPath, output + '\n', 'utf8');
console.log('es.json updated successfully.');

// ─── Verify structure matches en.json ───────────────────────────────────────
const esReloaded = JSON.parse(fs.readFileSync(esPath, 'utf8'));

// Check biodiversity.wizard keys match
const enBioKeys = Object.keys(en.biodiversity.wizard).sort();
const esBioKeys = Object.keys(esReloaded.biodiversity.wizard).sort();
const bioMissing = enBioKeys.filter(k => !esBioKeys.includes(k));
const bioExtra = esBioKeys.filter(k => !enBioKeys.includes(k));

console.log('\n--- biodiversity.wizard key comparison ---');
console.log(`en.json keys: ${enBioKeys.length}`);
console.log(`es.json keys: ${esBioKeys.length}`);
if (bioMissing.length) console.log('Missing in es:', bioMissing);
else console.log('No missing keys in es.');
if (bioExtra.length) console.log('Extra in es:', bioExtra);
else console.log('No extra keys in es.');

// Check water.wizard keys match
const enWaterKeys = Object.keys(en.water.wizard).sort();
const esWaterKeys = Object.keys(esReloaded.water.wizard).sort();
const waterMissing = enWaterKeys.filter(k => !esWaterKeys.includes(k));
const waterExtra = esWaterKeys.filter(k => !enWaterKeys.includes(k));

console.log('\n--- water.wizard key comparison ---');
console.log(`en.json keys: ${enWaterKeys.length}`);
console.log(`es.json keys: ${esWaterKeys.length}`);
if (waterMissing.length) console.log('Missing in es:', waterMissing);
else console.log('No missing keys in es.');
if (waterExtra.length) console.log('Extra in es:', waterExtra);
else console.log('No extra keys in es.');

// Verify all values are strings (flat structure, no nested objects)
function checkFlat(obj, prefix) {
  let ok = true;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'string') {
      console.log(`ERROR: ${prefix}.${k} is ${typeof v}, expected string`);
      ok = false;
    }
  }
  return ok;
}

console.log('\n--- Flat structure check ---');
const bioFlat = checkFlat(esReloaded.biodiversity.wizard, 'biodiversity.wizard');
const waterFlat = checkFlat(esReloaded.water.wizard, 'water.wizard');
if (bioFlat && waterFlat) {
  console.log('All values are strings (flat structure). PASSED.');
} else {
  console.log('FAILED: Some values are not strings.');
  process.exit(1);
}

console.log('\nDone!');
