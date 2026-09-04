/**
 * Etapes par defaut selon la categorie du dossier.
 * Injectees a la creation si aucune etape n'est fournie.
 */

const ETAPES_CONSTITUTION_SOCIETE = [
  'Onboarding du client',
  'Qualification du projet',
  'Pieces manquantes',
  'Verification et validation des pieces',
  'Proposition de Devis',
  'Validation du devis',
  'Paiement et Depot du Capital',
  'Redaction des actes constitutifs',
  'Validation des actes par le client',
  'Signature des statuts et actes',
  'Preparation du dossier immatriculation',
  'Depot / Immatriculation',
  'Suivi du dossier',
  'Reception des documents de la societe',
  'Remise des documents au client',
  'Ouverture du compte bancaire',
  'Formalites post-creation',
  'Cloture du dossier',
];

/**
 * Retourne le tableau d etapes par defaut pour une categorie donnee.
 * Retourne un tableau vide si la categorie n a pas d etapes predefinies.
 * @param {string} categorie
 * @param {string|null} createdById
 * @returns {Array<{id:string, label:string, ordre:number, addedAt:Date, addedBy:string|null}>}
 */
function getDefaultEtapes(categorie, createdById = null) {
  let labels = [];
  if (categorie === 'constitution_societe') {
    labels = ETAPES_CONSTITUTION_SOCIETE;
  }
  return labels.map((label, idx) => ({
    id: `default_${idx + 1}`,
    label,
    ordre: idx,
    addedAt: new Date(),
    addedBy: createdById || null,
  }));
}

module.exports = { getDefaultEtapes };
