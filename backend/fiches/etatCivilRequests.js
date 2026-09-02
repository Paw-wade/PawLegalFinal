const { getSchema } = require('./registry');

/** Extrait les noms des associés d'une fiche de société remplie (selon schema.associesSource). */
function extractAssocies(schema, data) {
  const src = schema && schema.associesSource;
  if (!src || !data) return [];
  // Source à section (liste répétable) : prioritaire, car elle porte aussi un `field`.
  if (src.section) {
    const rows = Array.isArray(data[src.section]) ? data[src.section] : [];
    return rows.map((r) => (r && r[src.field]) || '').map((s) => String(s).trim()).filter(Boolean);
  }
  if (src.field) {
    const v = data[src.field];
    return v ? [String(v).trim()] : [];
  }
  return [];
}

/**
 * Génère une demande de fiche d'état civil par associé de la société remplie
 * (sans doublon : une par personne). Appelé après l'enregistrement d'une fiche.
 */
async function ensureEtatCivilRequestsPerAssocie(dossierId, schema, data, requestedBy) {
  if (!schema || !schema.associesSource) return 0;
  const FicheRequest = require('../models/FicheRequest');
  const ec = getSchema('etat_civil');
  if (!ec) return 0;
  const noms = extractAssocies(schema, data);
  let created = 0;
  for (const nom of noms) {
    const clean = String(nom || '').trim();
    if (!clean) continue;
    const exists = await FicheRequest.findOne({
      dossier: dossierId, typeFiche: 'etat_civil', pourPersonne: clean, statut: { $ne: 'annulee' },
    }).lean();
    if (!exists) {
      await FicheRequest.create({
        dossier: dossierId, typeFiche: 'etat_civil', titre: `${ec.titre} — ${clean}`,
        pourPersonne: clean, requestedBy: requestedBy || null,
      });
      created += 1;
    }
  }
  return created;
}

/**
 * Extrait les associés avec leur e-mail (si le schéma a une source à section).
 * Retourne [{ nom, email }] (email éventuellement vide).
 */
function extractAssociesWithEmail(schema, data) {
  const src = schema && schema.associesSource;
  if (!src || !src.section || !data) return [];
  const rows = Array.isArray(data[src.section]) ? data[src.section] : [];
  return rows
    .map((r) => ({
      nom: String((r && r[src.field]) || '').trim(),
      email: String((r && r.email) || '').trim(),
    }))
    .filter((a) => a.nom);
}

module.exports = { ensureEtatCivilRequestsPerAssocie, extractAssocies, extractAssociesWithEmail };
