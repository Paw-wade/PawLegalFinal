/**
 * OCR / transcription via Gemini (images, PDF scannés, audio).
 * Utilisé par Paw AI (pièces jointes + corpus).
 */
const axios = require('axios');

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_PDF_OCR_MIN_CHARS = 80;
const DEFAULT_PDF_OCR_MIN_BYTES = 12_000;

function getGeminiApiKey() {
  return String(process.env.GEMINI_API_KEY || '').trim();
}

function getGeminiModel() {
  return (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
}

function geminiGenerateUrl() {
  const key = getGeminiApiKey();
  const model = getGeminiModel();
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(key)}`;
}

function parseGeminiTextResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts)
    ? parts
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('\n')
        .trim()
    : '';
}

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {{ prompt: string, maxOutputTokens?: number, timeoutMs?: number, emptyNote: string, errorNote: string }} opts
 */
async function geminiTranscribeBuffer(buffer, mimeType, opts) {
  const key = getGeminiApiKey();
  if (!key) {
    return { text: '', note: opts.errorNote.replace('erreur', 'GEMINI_API_KEY absente') };
  }
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { text: '', note: opts.emptyNote };
  }

  const url = geminiGenerateUrl();
  const maxOutputTokens = opts.maxOutputTokens ?? 4096;
  const timeoutMs = opts.timeoutMs ?? 120000;

  try {
    const res = await axios.post(
      url,
      {
        contents: [
          {
            role: 'user',
            parts: [
              { text: opts.prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: buffer.toString('base64'),
                },
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens,
          temperature: 0.1,
        },
      },
      { timeout: timeoutMs, validateStatus: () => true }
    );

    if (res.status >= 400) {
      const apiMessage = String(res.data?.error?.message || '').trim();
      return {
        text: '',
        note: apiMessage
          ? `${opts.errorNote} (${apiMessage})`
          : opts.errorNote,
      };
    }

    const text = parseGeminiTextResponse(res.data);
    if (!text) {
      return { text: '', note: opts.emptyNote };
    }
    return { text, note: '', ocrUsed: true };
  } catch (err) {
    return {
      text: '',
      note: `${opts.errorNote} (${err.message || 'erreur'})`,
    };
  }
}

/**
 * PDF sans couche texte (scan) : texte extrait par pdf-parse trop court.
 */
function isPdfTextInsufficient(extractedText, bufferByteLength) {
  const text = String(extractedText || '').trim();
  const minChars = Math.max(
    20,
    Number(process.env.LEXIA_PDF_OCR_MIN_CHARS) || DEFAULT_PDF_OCR_MIN_CHARS
  );
  const minBytes = Math.max(
    5000,
    Number(process.env.LEXIA_PDF_OCR_MIN_BYTES) || DEFAULT_PDF_OCR_MIN_BYTES
  );

  if (text.length >= minChars) return false;
  const byteLen = Number(bufferByteLength) || 0;
  if (byteLen >= minBytes) return true;
  if (!text && byteLen > 3000) return true;
  return !text;
}

async function extractImageTextWithGemini(buffer, mimeType) {
  return geminiTranscribeBuffer(buffer, mimeType, {
    prompt:
      'Transcris intégralement le texte visible sur cette image (OCR). ' +
      'Conserve la structure (paragraphes, listes). Si aucun texte n’est lisible, décris brièvement le document en français.',
    maxOutputTokens: 4096,
    timeoutMs: 120000,
    emptyNote: 'Image : aucun texte détecté.',
    errorNote: 'Image : transcription automatique indisponible',
  });
}

async function extractPdfTextWithGemini(buffer) {
  const maxBytes = Math.max(
    1_000_000,
    Number(process.env.LEXIA_PDF_OCR_MAX_BYTES) || 12 * 1024 * 1024
  );
  if (buffer.length > maxBytes) {
    return {
      text: '',
      note: `PDF : trop volumineux pour l’OCR automatique (max ${Math.floor(maxBytes / (1024 * 1024))} Mo).`,
    };
  }

  return geminiTranscribeBuffer(buffer, 'application/pdf', {
    prompt:
      'Ce document PDF est probablement scanné ou une image. Extrais intégralement tout le texte lisible (OCR), ' +
      'page par page si nécessaire, en français ou dans la langue du document. ' +
      'Conserve autant que possible la structure (titres, paragraphes, dates, numéros). ' +
      'Ne commente pas : restitue uniquement le contenu textuel extrait.',
    maxOutputTokens: Math.min(
      8192,
      Math.max(4096, Number(process.env.LEXIA_PDF_OCR_MAX_OUTPUT_TOKENS) || 8192)
    ),
    timeoutMs: Math.max(120000, Number(process.env.LEXIA_PDF_OCR_TIMEOUT_MS) || 180000),
    emptyNote: 'PDF : aucun texte détecté après OCR.',
    errorNote: 'PDF : OCR automatique indisponible',
  });
}

module.exports = {
  getGeminiApiKey,
  parseGeminiTextResponse,
  geminiTranscribeBuffer,
  isPdfTextInsufficient,
  extractImageTextWithGemini,
  extractPdfTextWithGemini,
};
