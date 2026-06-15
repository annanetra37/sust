#!/usr/bin/env node
/**
 * Fix biodiversity.wizard and water.wizard in sv.json
 * to match the flat-key structure used in en.json,
 * with proper Swedish translations.
 */

const fs = require('fs');
const path = require('path');

const svPath = path.join(__dirname, 'sv.json');
const enPath = path.join(__dirname, 'en.json');

// Read both files
const sv = JSON.parse(fs.readFileSync(svPath, 'utf8'));
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// ── biodiversity.wizard ──────────────────────────────────────────────
sv.biodiversity.wizard = {
  locateTitle: "Var bedriver ni verksamhet?",
  locateSubtitle: "Låt oss börja med att kartlägga era verksamhetsplatser. Vi kontrollerar om några ligger nära ekologiskt känsliga områden.",
  locateInfoTitle: "Varför är detta viktigt?",
  locateInfoBody: "Detta hjälper oss att identifiera vilka av era platser som kan ha påverkan på biologisk mångfald – de flesta företag har 2–5 platser att bedöma.",
  siteName: "Platsnamn",
  siteNamePlaceholder: "t.ex. Huvudfabriken Stockholm",
  country: "Land",
  countryPlaceholder: "t.ex. Sverige",
  city: "Stad / Adress",
  cityPlaceholder: "t.ex. Stockholm",
  siteType: "Platstyp",
  siteLabel: "Plats {n}",
  addSite: "Lägg till ytterligare en plats",
  removeSite: "Ta bort plats",
  evaluateTitle: "Hur ser omgivningen ut?",
  evaluateSubtitle: "Låt oss förstå den naturliga omgivningen vid var och en av era platser.",
  evalNearNature: "Ligger er plats i eller intill en skog, våtmark eller naturreservat?",
  evalUsesWater: "Använder ert företag vatten från naturliga källor (floder, sjöar, grundvatten)?",
  evalProducesWaste: "Producerar ert företag avfall som kan påverka den omgivande naturen?",
  ecosystemType: "Vilken typ av ekosystem finns i närheten?",
  assessTitle: "Vad kan påverka naturen?",
  assessSubtitle: "Låt oss identifiera vad som kan påverka den biologiska mångfalden nära era platser.",
  prepareTitle: "Vad är er plan?",
  prepareSubtitle: "Bra framsteg! Låt oss nu dokumentera ert svar på de identifierade påverkningarna.",
  suggestedActions: "Föreslagna åtgärder",
  existingActions: "Vad gör ni redan för att skydda naturen?",
  existingActionsPlaceholder: "t.ex. Vi har en policy mot avskogning, vi övervakar vattenkvaliteten kvartalsvis...",
  targets: "Vilka mål har ni satt upp?",
  targetsPlaceholder: "t.ex. Noll nettoskogsskövling till 2030, 50% minskning av vattenföroreningar...",
  resultsTitle: "Ert resultat för biologisk mångfald",
  resultsSubtitle: "Grattis! Ni har genomfört er första bedömning av biologisk mångfald.",
  sitesAssessedLabel: "Bedömda platser",
  impactsLabel: "Identifierade påverkningar",
  actionsLabel: "Dokumenterade åtgärder",
  whatThisMeansTitle: "Vad detta betyder för er rapport",
  whatThisMeansBody: "Era data om biologisk mångfald matas in i GRI 101 (Biologisk mångfald) och ESRS E4 (Biologisk mångfald och ekosystem). Denna bedömning är er utgångspunkt för att förstå och hantera era naturrelaterade påverkningar.",
  downloadReport: "Ladda ner bedömningsrapport",
  goToDashboard: "Spara och gå till instrumentpanelen",
  yes: "Ja",
  no: "Nej",
  unsure: "Inte säker",
  back: "Tillbaka",
  next: "Nästa",
  cancel: "Avbryt",
  stepName_locate: "Lokalisera",
  stepName_evaluate: "Utvärdera",
  stepName_assess: "Bedöma",
  stepName_prepare: "Planera",
  stepName_results: "Resultat",
  siteType_factory: "Fabrik",
  siteType_office: "Kontor",
  siteType_warehouse: "Lager",
  siteType_retail: "Butik",
  siteType_dataCenter: "Datacenter",
  siteType_other: "Övrigt",
  ecosystem_forest: "Skog",
  ecosystem_wetland: "Våtmark",
  ecosystem_grassland: "Gräsmark",
  ecosystem_marine: "Marin",
  ecosystem_urban: "Urban",
  ecosystem_agricultural: "Jordbruk",
  driver_landUseChange_title: "Förändring av markanvändning",
  driver_landUseChange_desc: "Har ert företag byggt på, omvandlat eller röjt naturmark?",
  driver_landUseChange_suggestion: "Överväg habitatåterställning eller kompensation för markomvandling.",
  driver_resourceExploitation_title: "Resursexploatering",
  driver_resourceExploitation_desc: "Utvinner ert företag material från naturen (gruvdrift, skogsbruk, fiske)?",
  driver_resourceExploitation_suggestion: "Överväg hållbara inköpspolicyer och minskning av utvinningsvolymer.",
  driver_climateChange_title: "Klimatförändring",
  driver_climateChange_desc: "Bidrar ert företag väsentligt till utsläpp av växthusgaser?",
  driver_climateChange_suggestion: "Överväg att koppla till era E1-utsläppsdata och sätta reduktionsmål.",
  driver_pollution_title: "Föroreningar",
  driver_pollution_desc: "Släpper er plats ut ämnen i vatten, luft eller mark?",
  driver_pollution_suggestion: "Överväg att övervaka utsläppskvaliteten och sätta reduktionsmål.",
  driver_invasiveSpecies_title: "Invasiva arter",
  driver_invasiveSpecies_desc: "Har ert företag infört icke-inhemska arter i något område?",
  driver_invasiveSpecies_suggestion: "Överväg artinventeringar och implementering av biosäkerhetsåtgärder."
};

// ── water.wizard ─────────────────────────────────────────────────────
sv.water.wizard = {
  step1Title: "Varifrån kommer ert vatten?",
  step1Subtitle: "Låt oss spåra er vattenanvändning – det är enklare än ni tror. De flesta företag har redan dessa uppgifter i sina driftfakturor.",
  step1Explain: "Om ni inte vet varifrån ert vatten kommer, kontrollera era driftfakturor – de flesta företag använder kommunalt vatten (tredjepartsvatten).",
  municipal: "Kommunalt / Tredje part",
  surfaceWater: "Ytvatten",
  groundwater: "Grundvatten",
  seawater: "Havsvatten",
  rainwater: "Regnvatten",
  step2Title: "Hur mycket vatten använder ni?",
  step2Subtitle: "Ange era vattenvolymer för varje källa. Har ni inte exakta siffror? Uppskattningar fungerar för tillfället.",
  withdrawalLabel: "Uttag",
  dischargeLabel: "Utsläpp",
  consumptionCalc: "Förbrukning = Uttag - Utsläpp",
  unitLabel: "Enhet",
  unitM3: "m³",
  unitLitres: "liter",
  unitGallons: "galloner",
  estimatesOk: "Har ni inte exakta siffror? Det går bra – uppskattningar fungerar för tillfället. Ni kan förfina senare.",
  step3Title: "Återvinner ni vatten?",
  step3Subtitle: "Vattenåtervinning innebär att återanvända renat vatten i er verksamhet istället för att ta ut nytt vatten.",
  recycleExplain: "Återvunnet vatten minskar ert miljöavtryck och ser bra ut i er hållbarhetsrapport.",
  recycleYes: "Ja, vi återvinner vatten",
  recycleNo: "Nej, inte ännu",
  recycleVolume: "Hur mycket vatten återvinner ni per år?",
  step4Title: "Ert vattenavtryck",
  step4Subtitle: "Bra jobbat! Här är en sammanfattning av er vattenanvändning.",
  whatThisMeans: "Vad detta betyder för er rapport",
  gri303Explain: "Era vattendata matas in i GRI 303 (Vatten och avlopp) och ESRS E3 (Vatten och marina resurser). Dessa är nyckeltal som investerare och tillsynsmyndigheter granskar för att förstå er miljöpåverkan.",
  addMoreDetail: "Lägg till mer detalj",
  goToDashboard: "Gå till instrumentpanelen",
  back: "Tillbaka",
  next: "Nästa"
};

// ── Write the result ─────────────────────────────────────────────────
const output = JSON.stringify(sv, null, 2);

// Validate by re-parsing
try {
  JSON.parse(output);
  console.log('JSON validation: PASSED');
} catch (e) {
  console.error('JSON validation: FAILED', e.message);
  process.exit(1);
}

fs.writeFileSync(svPath, output + '\n', 'utf8');
console.log('sv.json updated successfully.');

// ── Verify structural match ──────────────────────────────────────────
const svReloaded = JSON.parse(fs.readFileSync(svPath, 'utf8'));

function getKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(...getKeys(v, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

const enBioKeys = getKeys(en.biodiversity.wizard).sort();
const svBioKeys = getKeys(svReloaded.biodiversity.wizard).sort();
const enWaterKeys = getKeys(en.water.wizard).sort();
const svWaterKeys = getKeys(svReloaded.water.wizard).sort();

console.log('\n--- biodiversity.wizard key comparison ---');
console.log('en keys:', enBioKeys.length, '| sv keys:', svBioKeys.length);

const missingBioInSv = enBioKeys.filter(k => !svBioKeys.includes(k));
const extraBioInSv = svBioKeys.filter(k => !enBioKeys.includes(k));
if (missingBioInSv.length) console.log('Missing in sv:', missingBioInSv);
if (extraBioInSv.length) console.log('Extra in sv:', extraBioInSv);
if (!missingBioInSv.length && !extraBioInSv.length) console.log('MATCH: All keys identical');

console.log('\n--- water.wizard key comparison ---');
console.log('en keys:', enWaterKeys.length, '| sv keys:', svWaterKeys.length);

const missingWaterInSv = enWaterKeys.filter(k => !svWaterKeys.includes(k));
const extraWaterInSv = svWaterKeys.filter(k => !enWaterKeys.includes(k));
if (missingWaterInSv.length) console.log('Missing in sv:', missingWaterInSv);
if (extraWaterInSv.length) console.log('Extra in sv:', extraWaterInSv);
if (!missingWaterInSv.length && !extraWaterInSv.length) console.log('MATCH: All keys identical');

// Overall verdict
const allGood = !missingBioInSv.length && !extraBioInSv.length && !missingWaterInSv.length && !extraWaterInSv.length;
console.log('\n' + (allGood ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
process.exit(allGood ? 0 : 1);
