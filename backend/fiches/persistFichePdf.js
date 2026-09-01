const fs = require('fs');
const path = require('path');
const { generateFichePdf } = require('./generate');
const { persistDocumentForDossier, BACKEND_ROOT } = require('../utils/pieceUpload');

/**
 * Génère le PDF d'une fiche remplie et l'enregistre comme Document rattaché au dossier
 * (best-effort : l'appelant ignore les échecs, la fiche restant régénérable à la demande).
 * Retourne le Document créé.
 */
async function persistFichePdfAsDocument(fiche, dossier, ownerUserId) {
  const buf = await generateFichePdf(fiche, { reference: (dossier && dossier.numero) || '' });
  const dir = path.join(BACKEND_ROOT, 'uploads', 'documents');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `fiche-${fiche.typeFiche}-${Date.now()}.pdf`;
  const p = path.join(dir, filename);
  fs.writeFileSync(p, buf);
  const file = {
    path: p, filename,
    originalname: `${String(fiche.titre || 'fiche').replace(/[\\/:*?"<>|]/g, '-')}.pdf`,
    mimetype: 'application/pdf', size: buf.length,
  };
  return persistDocumentForDossier(file, {
    dossierId: (dossier && dossier._id) || dossier, ownerUserId,
    nom: fiche.titre || 'Fiche', reason: 'Document généré à partir de la fiche remplie.',
  });
}

module.exports = { persistFichePdfAsDocument };
