/**
 * Document Data Extraction Engine
 *
 * Pipeline:
 *   1. PDF → pdf-parse for text. If empty (scanned PDF), convert to images + OCR
 *   2. Images (JPG/PNG) → sharp preprocessing + tesseract.js OCR
 *   3. Multi-language support: English, German, French, Spanish, etc.
 */

const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');

// ─── Text Extraction Layer ──────────────────────────────────

async function extractTextFromPDF(buffer) {
  try {
    const result = await pdfParse(buffer);
    const text = (result.text || '').trim();

    // If pdf-parse found meaningful text (more than just whitespace/headers), use it
    if (text.length > 50) {
      console.log(`[DocExtract] PDF text extraction: ${text.length} chars from ${result.numpages} pages`);
      return text;
    }

    // Scanned PDF — no text layer. Fall back to OCR on the first few pages.
    console.log(`[DocExtract] PDF has little/no text (${text.length} chars, ${result.numpages} pages). Falling back to OCR...`);
    return await ocrPdfBuffer(buffer);
  } catch (err) {
    console.error('[DocExtract] PDF parse error, trying OCR fallback:', err.message);
    // Try OCR as last resort
    try {
      return await ocrPdfBuffer(buffer);
    } catch (ocrErr) {
      console.error('[DocExtract] OCR fallback also failed:', ocrErr.message);
      return '';
    }
  }
}

async function ocrPdfBuffer(buffer) {
  // Convert PDF to images using sharp (it can read first page of PDF)
  // For multi-page, we try pages 0-5
  const texts = [];

  for (let page = 0; page < 6; page++) {
    try {
      const imgBuffer = await sharp(buffer, { page })
        .greyscale()
        .normalize()
        .sharpen()
        .resize({ width: 2400, withoutEnlargement: true })
        .png()
        .toBuffer();

      const { data } = await Tesseract.recognize(imgBuffer, 'eng+deu+fra+spa', {
        logger: () => {},
      });

      if (data.text && data.text.trim().length > 10) {
        texts.push(data.text.trim());
        console.log(`[DocExtract] OCR page ${page}: ${data.text.trim().length} chars, confidence: ${data.confidence}%`);
      }
    } catch {
      // No more pages or page processing failed
      break;
    }
  }

  const combined = texts.join('\n\n');
  console.log(`[DocExtract] OCR total: ${combined.length} chars from ${texts.length} pages`);
  return combined;
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

  // Multi-language OCR: English + German + French + Spanish
  const { data } = await Tesseract.recognize(processed, 'eng+deu+fra+spa', {
    logger: () => {},
  });

  console.log(`[DocExtract] Image OCR: ${(data.text || '').length} chars, confidence: ${data.confidence}%`);
  return data.text || '';
}

async function extractText(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  console.log(`[DocExtract] Processing: ${file.originalname} (${ext}, ${mime}, ${(file.size / 1024).toFixed(0)} KB)`);

  if (ext === '.pdf' || mime === 'application/pdf') {
    return extractTextFromPDF(file.buffer);
  }

  if (['.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.webp'].includes(ext) || mime.startsWith('image/')) {
    return extractTextFromImage(file.buffer);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

module.exports = { extractDocument: null, extractText };
// Note: extractDocument is no longer used directly — AI extraction is in aiEtl.js
