const { getSchema } = require('./registry');
const { renderFichePdfKit } = require('./renderFichePdfKit');

/** Génère le PDF d'une fiche remplie (document Mongoose ou objet {typeFiche, data}).
 * Rendu pdfkit pur Node — aucune dépendance système (pas de Chromium requis). */
async function generateFichePdf(fiche, opts = {}) {
  const schema = getSchema(fiche.typeFiche);
  if (!schema) throw new Error('Type de fiche inconnu : ' + fiche.typeFiche);
  return renderFichePdfKit(schema, fiche.data || {}, opts);
}

module.exports = { generateFichePdf };
