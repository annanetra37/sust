/**
 * Document Data Extraction Engine
 *
 * Autonomous extraction pipeline:
 *   1. PDF  → pdf-parse for text extraction
 *   2. Images (JPG/PNG) → sharp preprocessing + tesseract.js OCR
 *   3. Raw text → mode-specific pattern extractors
 *   4. Structured emission data output
 *
 * Supports modes: Travel, Stay, Energy, Company Vehicle
 */

const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');

// ─── Text Extraction Layer ──────────────────────────────────

async function extractTextFromPDF(buffer) {
  const result = await pdfParse(buffer);
  return result.text || '';
}

async function extractTextFromImage(buffer) {
  // Preprocess image for better OCR accuracy
  const processed = await sharp(buffer)
    .greyscale()
    .normalize()
    .sharpen()
    .resize({ width: 2400, withoutEnlargement: true })
    .png()
    .toBuffer();

  const { data } = await Tesseract.recognize(processed, 'eng', {
    logger: () => {},
  });

  return data.text || '';
}

async function extractText(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  if (ext === '.pdf' || mime === 'application/pdf') {
    return extractTextFromPDF(file.buffer);
  }

  if (['.jpg', '.jpeg', '.png'].includes(ext) || mime.startsWith('image/')) {
    return extractTextFromImage(file.buffer);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

// ─── Pattern Matching Utilities ─────────────────────────────

function findNumber(text, patterns, fallback = null) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseFloat(match[1].replace(/,/g, '').replace(/\s/g, ''));
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return fallback;
}

function findString(text, patterns, fallback = null) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return fallback;
}

function findCurrency(text) {
  const currencyMap = {
    '$': 'USD', 'USD': 'USD', 'US$': 'USD',
    '€': 'EUR', 'EUR': 'EUR',
    '£': 'GBP', 'GBP': 'GBP',
    'CHF': 'CHF', 'SEK': 'SEK', 'NOK': 'NOK', 'DKK': 'DKK',
    'CAD': 'CAD', 'AUD': 'AUD', 'JPY': 'JPY', 'CNY': 'CNY',
    'AED': 'AED', 'SAR': 'SAR', 'INR': 'INR',
  };

  for (const [symbol, code] of Object.entries(currencyMap)) {
    if (text.includes(symbol)) return code;
  }
  return 'USD';
}

function findDate(text) {
  const patterns = [
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/,
    /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
    /(\w+ \d{1,2},?\s*\d{4})/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const d = new Date(m[0]);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

// ─── Emission Factor Lookup ─────────────────────────────────

const EMISSION_FACTORS = {
  // Travel (per km)
  flight_short: 0.156,      // kg CO2e per passenger-km
  flight_long: 0.195,
  flight_domestic: 0.133,
  train: 0.037,
  bus: 0.089,
  taxi: 0.149,
  car_rental: 0.171,

  // Stay (per night)
  hotel: 20.6,               // kg CO2e per room-night

  // Energy
  electricity_kwh: 0.233,    // kg CO2e per kWh (grid average)
  natural_gas_kwh: 0.184,
  natural_gas_m3: 2.0,
  diesel_litre: 2.68,
  petrol_litre: 2.31,
  lpg_litre: 1.56,
  heating_oil_litre: 2.54,

  // Company Vehicle (per km or litre)
  vehicle_petrol_km: 0.171,
  vehicle_diesel_km: 0.168,
  vehicle_hybrid_km: 0.112,
  vehicle_electric_km: 0.047,
  vehicle_petrol_litre: 2.31,
  vehicle_diesel_litre: 2.68,
};

// ─── Mode-Specific Extractors ───────────────────────────────

function extractTravel(text, fileName) {
  const lower = text.toLowerCase();
  const result = {
    sourceFile: fileName,
    items: [],
  };

  // Detect transport type
  let transportType = 'flight';
  if (/\b(train|rail|railway|sncf|amtrak|eurostar)\b/i.test(text)) transportType = 'train';
  else if (/\b(bus|coach|greyhound)\b/i.test(text)) transportType = 'bus';
  else if (/\b(taxi|uber|lyft|cab|ride)\b/i.test(text)) transportType = 'taxi';
  else if (/\b(car\s*rental|rent.?a.?car|hertz|avis|enterprise)\b/i.test(text)) transportType = 'car_rental';

  // Detect flight haul type
  let flightType = 'flight_short';
  if (transportType === 'flight') {
    if (/\b(intercontinental|long.?haul|international)\b/i.test(text)) flightType = 'flight_long';
    else if (/\b(domestic|short.?haul|regional)\b/i.test(text)) flightType = 'flight_short';
  }

  // Extract departure / arrival
  const departure = findString(text, [
    /(?:from|depart(?:ure|ing)?|origin)[:\s]+([A-Z][a-zA-Z\s]{2,30})/i,
    /([A-Z]{3})\s*(?:→|->|to|—)\s*[A-Z]{3}/,
  ]);

  const arrival = findString(text, [
    /(?:to|arriv(?:al|ing)?|destination)[:\s]+([A-Z][a-zA-Z\s]{2,30})/i,
    /[A-Z]{3}\s*(?:→|->|to|—)\s*([A-Z]{3})/,
  ]);

  // Extract distance
  let distance = findNumber(text, [
    /(\d[\d,]*\.?\d*)\s*(?:km|kilometers|kilometres)/i,
    /(?:distance|mileage)[:\s]*(\d[\d,]*\.?\d*)/i,
    /(\d[\d,]*\.?\d*)\s*(?:mi(?:les)?)\b/i,
  ]);

  // Convert miles to km if needed
  if (!distance && /miles?\b/i.test(text)) {
    const miles = findNumber(text, [/(\d[\d,]*\.?\d*)\s*mi/i]);
    if (miles) distance = miles * 1.60934;
  }

  // Estimate distance from flight if not found
  if (!distance && transportType === 'flight') {
    distance = /long.?haul|intercontinental/i.test(text) ? 8000 : 1500;
  }

  // Extract passenger count
  const passengers = findNumber(text, [
    /(\d+)\s*(?:passenger|pax|travell?er)/i,
    /(?:passenger|pax|travell?er)s?\s*[:\s]*(\d+)/i,
  ], 1);

  // Extract amount paid
  const amount = findNumber(text, [
    /(?:total|amount|price|fare|cost|charge|paid|due|balance)[:\s]*[\$€£]?\s*(\d[\d,]*\.?\d*)/i,
    /[\$€£]\s*(\d[\d,]*\.?\d*)/,
    /(\d[\d,]*\.?\d*)\s*(?:USD|EUR|GBP|CHF)/i,
  ]);

  const currency = findCurrency(text);
  const factorKey = transportType === 'flight' ? flightType : transportType;
  const factor = EMISSION_FACTORS[factorKey] || 0.156;
  const totalDistance = (distance || 0) * (passengers || 1);
  const emissions = (totalDistance * factor) / 1000; // convert kg to tonnes

  result.items.push({
    subType: transportType === 'flight' ? `${flightType.replace('_', ' ')}` : transportType,
    transportType,
    departure,
    arrival,
    distance: totalDistance,
    passengers,
    unit: 'km',
    quantity: totalDistance,
    emissionFactor: factor,
    emissions: parseFloat(emissions.toFixed(4)),
    scope: 'Scope 3',
    currency,
    amount,
    date: findDate(text),
    confidence: distance ? 0.85 : amount ? 0.6 : 0.4,
  });

  return result;
}

function extractStay(text, fileName) {
  const result = { sourceFile: fileName, items: [] };

  // Extract hotel/accommodation details
  const hotelName = findString(text, [
    /(?:hotel|property|accommodation|resort|inn|lodge)[:\s]*([A-Z][a-zA-Za-z\s&']{2,40})/i,
    /(?:staying at|checked into|reservation at)[:\s]*([A-Z][a-zA-Za-z\s&']{2,40})/i,
  ]);

  // Extract number of nights
  let nights = findNumber(text, [
    /(\d+)\s*(?:night|nuit|nacht)/i,
    /(?:night|nuit|nacht)s?\s*[:\s]*(\d+)/i,
    /(?:duration|stay|length)[:\s]*(\d+)/i,
  ], 1);

  // Try to compute from check-in / check-out dates
  if (nights === 1) {
    const checkin = findString(text, [/(?:check.?in|arrival|from)[:\s]*([\d\/\-\.]+\s*\w*\s*\d{4}?)/i]);
    const checkout = findString(text, [/(?:check.?out|departure|to)[:\s]*([\d\/\-\.]+\s*\w*\s*\d{4}?)/i]);
    if (checkin && checkout) {
      const d1 = new Date(checkin);
      const d2 = new Date(checkout);
      if (!isNaN(d1) && !isNaN(d2) && d2 > d1) {
        nights = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
      }
    }
  }

  // Number of rooms
  const rooms = findNumber(text, [
    /(\d+)\s*(?:room|chambre|zimmer)/i,
    /(?:room|chambre|zimmer)s?\s*[:\s]*(\d+)/i,
  ], 1);

  const amount = findNumber(text, [
    /(?:total|amount|price|rate|cost|charge|paid|due|balance)[:\s]*[\$€£]?\s*(\d[\d,]*\.?\d*)/i,
    /[\$€£]\s*(\d[\d,]*\.?\d*)/,
    /(\d[\d,]*\.?\d*)\s*(?:USD|EUR|GBP)/i,
  ]);

  const currency = findCurrency(text);
  const totalNights = nights * rooms;
  const emissions = (totalNights * EMISSION_FACTORS.hotel) / 1000;

  result.items.push({
    subType: 'Hotel Stay',
    hotelName,
    nights,
    rooms,
    unit: 'nights',
    quantity: totalNights,
    emissionFactor: EMISSION_FACTORS.hotel,
    emissions: parseFloat(emissions.toFixed(4)),
    scope: 'Scope 3',
    currency,
    amount,
    date: findDate(text),
    confidence: nights > 1 ? 0.85 : amount ? 0.7 : 0.5,
  });

  return result;
}

function extractEnergy(text, fileName) {
  const result = { sourceFile: fileName, items: [] };

  // Detect energy type
  const energyPatterns = [
    { type: 'electricity', re: /\b(electric(?:ity)?|power|kwh|kilowatt)\b/i, unit: 'kWh', factor: EMISSION_FACTORS.electricity_kwh },
    { type: 'natural_gas', re: /\b(natural\s*gas|gas\s*usage|methane|therms?|ccf|mcf)\b/i, unit: 'kWh', factor: EMISSION_FACTORS.natural_gas_kwh },
    { type: 'diesel', re: /\b(diesel|gasoil|gas\s*oil)\b/i, unit: 'litres', factor: EMISSION_FACTORS.diesel_litre },
    { type: 'petrol', re: /\b(petrol|gasoline|unleaded)\b/i, unit: 'litres', factor: EMISSION_FACTORS.petrol_litre },
    { type: 'lpg', re: /\b(lpg|propane|butane|liquefied)\b/i, unit: 'litres', factor: EMISSION_FACTORS.lpg_litre },
    { type: 'heating_oil', re: /\b(heating\s*oil|fuel\s*oil|kerosene)\b/i, unit: 'litres', factor: EMISSION_FACTORS.heating_oil_litre },
  ];

  let detectedType = null;
  for (const ep of energyPatterns) {
    if (ep.re.test(text)) { detectedType = ep; break; }
  }

  if (!detectedType) detectedType = energyPatterns[0]; // default to electricity

  // Extract usage quantity
  let quantity = findNumber(text, [
    /(\d[\d,]*\.?\d*)\s*(?:kwh|kw\.?h|kilowatt.?hours?)/i,
    /(\d[\d,]*\.?\d*)\s*(?:lit(?:re|er)s?|ltr|gal(?:lon)?s?)/i,
    /(\d[\d,]*\.?\d*)\s*(?:m[³3]|cubic\s*met(?:re|er)s?)/i,
    /(?:usage|consumption|quantity|volume|reading|meter)[:\s]*(\d[\d,]*\.?\d*)/i,
    /(?:current|new)\s*(?:reading|meter)[:\s]*(\d[\d,]*\.?\d*)/i,
  ]);

  // Handle meter readings (new - old)
  const newReading = findNumber(text, [/(?:current|new|present)\s*(?:reading|meter)[:\s]*(\d[\d,]*\.?\d*)/i]);
  const oldReading = findNumber(text, [/(?:previous|old|prior|last)\s*(?:reading|meter)[:\s]*(\d[\d,]*\.?\d*)/i]);
  if (newReading && oldReading && newReading > oldReading) {
    quantity = newReading - oldReading;
  }

  // If unit is m³ for gas, convert to kWh (1 m³ ≈ 11.1 kWh)
  if (/m[³3]|cubic/i.test(text) && detectedType.type === 'natural_gas') {
    quantity = (quantity || 0) * 11.1;
  }

  // Gallons to litres
  if (/gal(?:lon)?s?\b/i.test(text)) {
    quantity = (quantity || 0) * 3.785;
  }

  const amount = findNumber(text, [
    /(?:total|amount|price|cost|charge|paid|due|balance|payable)[:\s]*[\$€£]?\s*(\d[\d,]*\.?\d*)/i,
    /[\$€£]\s*(\d[\d,]*\.?\d*)/,
    /(\d[\d,]*\.?\d*)\s*(?:USD|EUR|GBP)/i,
  ]);

  const currency = findCurrency(text);
  const emissions = ((quantity || 0) * detectedType.factor) / 1000;

  // Billing period
  const period = findString(text, [
    /(?:billing|invoice|statement)\s*(?:period|date)[:\s]*(.{10,40})/i,
    /(?:period|from|for)[:\s]*([\d\/\-\.\s\w]{10,40})/i,
  ]);

  result.items.push({
    subType: detectedType.type.replace(/_/g, ' '),
    energyType: detectedType.type,
    unit: detectedType.unit,
    quantity: quantity || 0,
    emissionFactor: detectedType.factor,
    emissions: parseFloat(emissions.toFixed(4)),
    scope: detectedType.type === 'electricity' ? 'Scope 2' : 'Scope 1',
    currency,
    amount,
    billingPeriod: period,
    date: findDate(text),
    confidence: quantity ? 0.9 : amount ? 0.5 : 0.3,
  });

  return result;
}

function extractCompanyVehicle(text, fileName) {
  const result = { sourceFile: fileName, items: [] };

  // Detect fuel type
  let fuelType = 'petrol';
  if (/\b(diesel|gasoil)\b/i.test(text)) fuelType = 'diesel';
  else if (/\b(hybrid|hev|phev)\b/i.test(text)) fuelType = 'hybrid';
  else if (/\b(electric|ev|bev|tesla|charging)\b/i.test(text)) fuelType = 'electric';

  // Extract distance
  const distance = findNumber(text, [
    /(\d[\d,]*\.?\d*)\s*(?:km|kilometers|kilometres)/i,
    /(?:mileage|odometer|distance|km)[:\s]*(\d[\d,]*\.?\d*)/i,
    /(\d[\d,]*\.?\d*)\s*(?:mi(?:les)?)\b/i,
  ]);

  // Convert miles
  let distanceKm = distance;
  if (distance && /miles?\b/i.test(text) && !/km/i.test(text)) {
    distanceKm = distance * 1.60934;
  }

  // Extract fuel quantity
  const fuelQty = findNumber(text, [
    /(\d[\d,]*\.?\d*)\s*(?:lit(?:re|er)s?|ltr|L\b)/i,
    /(\d[\d,]*\.?\d*)\s*(?:gal(?:lon)?s?)/i,
    /(?:volume|quantity|fuel|filled)[:\s]*(\d[\d,]*\.?\d*)/i,
  ]);

  // Gallons to litres
  let fuelLitres = fuelQty;
  if (fuelQty && /gal(?:lon)?s?\b/i.test(text)) {
    fuelLitres = fuelQty * 3.785;
  }

  // Vehicle info
  const vehicleReg = findString(text, [
    /(?:reg(?:istration)?|plate|license|tag)[:\s#]*([A-Z0-9\-\s]{4,12})/i,
  ]);

  const amount = findNumber(text, [
    /(?:total|amount|price|cost|charge|paid|due)[:\s]*[\$€£]?\s*(\d[\d,]*\.?\d*)/i,
    /[\$€£]\s*(\d[\d,]*\.?\d*)/,
  ]);

  const currency = findCurrency(text);

  // Calculate emissions: prefer fuel-based, fallback to distance-based
  let emissions = 0;
  let unit = 'km';
  let quantity = 0;
  let factor = 0;

  if (fuelLitres) {
    factor = EMISSION_FACTORS[`vehicle_${fuelType}_litre`] || EMISSION_FACTORS.vehicle_petrol_litre;
    emissions = (fuelLitres * factor) / 1000;
    unit = 'litres';
    quantity = fuelLitres;
  } else if (distanceKm) {
    factor = EMISSION_FACTORS[`vehicle_${fuelType}_km`] || EMISSION_FACTORS.vehicle_petrol_km;
    emissions = (distanceKm * factor) / 1000;
    unit = 'km';
    quantity = distanceKm;
  }

  result.items.push({
    subType: `Company Vehicle (${fuelType})`,
    fuelType,
    vehicleRegistration: vehicleReg,
    distance: distanceKm,
    fuelQuantity: fuelLitres,
    unit,
    quantity,
    emissionFactor: factor,
    emissions: parseFloat(emissions.toFixed(4)),
    scope: 'Scope 1',
    currency,
    amount,
    date: findDate(text),
    confidence: fuelLitres ? 0.9 : distanceKm ? 0.8 : amount ? 0.5 : 0.3,
  });

  return result;
}

// ─── Main Extraction Entry Point ────────────────────────────

const MODE_EXTRACTORS = {
  Travel: extractTravel,
  Stay: extractStay,
  Energy: extractEnergy,
  'Company Vehicle': extractCompanyVehicle,
};

async function extractDocument(file, mode) {
  const rawText = await extractText(file);

  if (!rawText || rawText.trim().length < 10) {
    return {
      sourceFile: file.originalname,
      items: [],
      rawText: '',
      error: 'Could not extract readable text from document',
      confidence: 0,
    };
  }

  // Clean up OCR artifacts
  const text = rawText
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')     // collapse whitespace
    .replace(/\n{3,}/g, '\n\n');   // collapse blank lines

  const extractor = MODE_EXTRACTORS[mode];
  if (!extractor) {
    throw new Error(`Unknown extraction mode: ${mode}. Supported: ${Object.keys(MODE_EXTRACTORS).join(', ')}`);
  }

  const result = extractor(text, file.originalname);
  result.rawText = text.substring(0, 2000); // store first 2000 chars for audit
  result.mode = mode;

  // Overall confidence is average of item confidences
  result.confidence = result.items.length > 0
    ? parseFloat((result.items.reduce((s, i) => s + (i.confidence || 0), 0) / result.items.length).toFixed(2))
    : 0;

  return result;
}

module.exports = { extractDocument, extractText };
