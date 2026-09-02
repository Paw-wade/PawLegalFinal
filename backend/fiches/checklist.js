const { getSchema } = require('./registry');
const { extractAssocies } = require('./etatCivilRequests');

/** Extrait les noms des gérants / dirigeants selon schema.gerantsSource. */
function extractGerants(schema, data) {
  const src = schema && schema.gerantsSource;
  if (!src || !data) return [];
  const names = [];
  if (src.section) {
    const rows = Array.isArray(data[src.section]) ? data[src.section] : [];
    for (const r of rows) if (r && r[src.field]) names.push(r[src.field]);
  }
  if (Array.isArray(src.fields)) {
    for (const f of src.fields) if (data[f]) names.push(data[f]);
  }
  const seen = new Set();
  return names.map((n) => String(n).trim()).filter((n) => n && !seen.has(n) && seen.add(n));
}

async function ensurePiece(dossierId, { libelle, nature, pourPersonne, note, requestedBy }) {
  const PieceRequest = require('../models/PieceRequest');
  const exists = await PieceRequest.findOne({ dossier: dossierId, nature, pourPersonne: pourPersonne || '', statut: { $ne: 'annulee' } }).lean();
  if (exists) return false;
  await PieceRequest.create({ dossier: dossierId, libelle, nature, pourPersonne: pourPersonne || '', note: note || '', createdBy: requestedBy || null });
  return true;
}

async function ensureFicheRequest(dossierId, typeFiche, pourPersonne, requestedBy) {
  const FicheRequest = require('../models/FicheRequest');
  const schema = getSchema(typeFiche);
  if (!schema) return;
  const exists = await FicheRequest.findOne({ dossier: dossierId, typeFiche, pourPersonne: pourPersonne || '', statut: { $ne: 'annulee' } }).lean();
  if (exists) return;
  await FicheRequest.create({
    dossier: dossierId, typeFiche, pourPersonne: pourPersonne || '', requestedBy: requestedBy || null,
    titre: pourPersonne ? `${schema.titre} — ${pourPersonne}` : schema.titre,
  });
}

/**
 * Génère la checklist de constitution après remplissage d'une fiche de société :
 *  - une fiche d'état civil par associé ;
 *  - une pièce d'identité par associé et par gérant ;
 *  - un casier judiciaire par gérant + une déclaration sur l'honneur par gérant (l'un suffit).
 */
async function ensureConstitutionChecklist(dossierId, schema, data, requestedBy) {
  if (!schema) return;
  const FicheRequest = require('../models/FicheRequest');
  const ec = getSchema('etat_civil');

  const associes = extractAssocies(schema, data);
  const gerants = extractGerants(schema, data);

  // État civil + pièce d'identité par associé.
  for (const nom of associes) {
    if (ec) {
      const exists = await FicheRequest.findOne({ dossier: dossierId, typeFiche: 'etat_civil', pourPersonne: nom, statut: { $ne: 'annulee' } }).lean();
      if (!exists) await FicheRequest.create({ dossier: dossierId, typeFiche: 'etat_civil', titre: `${ec.titre} — ${nom}`, pourPersonne: nom, requestedBy: requestedBy || null });
    }
    await ensurePiece(dossierId, { libelle: `Pièce d'identité — ${nom}`, nature: 'identite', pourPersonne: nom, requestedBy });
  }

  // Pièce d'identité + casier (ou déclaration) par gérant.
  for (const nom of gerants) {
    await ensurePiece(dossierId, { libelle: `Pièce d'identité — ${nom}`, nature: 'identite', pourPersonne: nom, requestedBy });
    await ensurePiece(dossierId, { libelle: `Casier judiciaire — ${nom}`, nature: 'casier', pourPersonne: nom, note: 'À défaut, remplir la déclaration sur l\'honneur.', requestedBy });
    await ensureFicheRequest(dossierId, 'declaration_honneur', nom, requestedBy);
  }

  // Procuration : pour tout associé qui ne serait pas présent le jour de la signature.
  const proc = getSchema('procuration');
  if (proc) {
    const existsProc = await FicheRequest.findOne({ dossier: dossierId, typeFiche: 'procuration', statut: { $ne: 'annulee' } }).lean();
    if (!existsProc) {
      await FicheRequest.create({
        dossier: dossierId, typeFiche: 'procuration', titre: proc.titre,
        message: 'À remplir uniquement si un associé ne peut pas être présent le jour de la signature (procuration donnée à un mandataire). Ajoutez-en une par associé absent.',
        requestedBy: requestedBy || null,
      });
    }
  }
}

module.exports = { ensureConstitutionChecklist, extractGerants };
