const fs = require('fs');
const path = require('path');
const { getSchema } = require('./registry');
const { renderFicheHtml } = require('./renderHtml');
const { htmlToPdf } = require('../utils/htmlToPdf');

let _logoCache; // null = introuvable ; string = dataURI
function getLogoDataUri() {
  if (_logoCache !== undefined) return _logoCache;
  const candidates = [
    process.env.CABINET_LOGO_PATH,
    path.resolve(__dirname, '../../frontend/public/ada-papers-logo.png'),
    path.resolve(__dirname, '../assets/ada-papers-logo.png'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const ext = path.extname(p).slice(1).toLowerCase() || 'png';
        const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        _logoCache = `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
        return _logoCache;
      }
    } catch (e) { /* ignore */ }
  }
  _logoCache = null;
  return _logoCache;
}

/** Génère le PDF d'une fiche remplie (document Mongoose ou objet {typeFiche, data}). */
async function generateFichePdf(fiche, opts = {}) {
  const schema = getSchema(fiche.typeFiche);
  if (!schema) throw new Error('Type de fiche inconnu : ' + fiche.typeFiche);
  const logoDataUri = opts.logoDataUri || getLogoDataUri() || undefined;
  const html = renderFicheHtml(schema, fiche.data || {}, { ...opts, logoDataUri });
  return htmlToPdf(html);
}

module.exports = { generateFichePdf };
