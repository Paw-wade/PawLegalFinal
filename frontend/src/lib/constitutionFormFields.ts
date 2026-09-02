/**
 * Rubriques du formulaire initial de demande de création d'entreprise
 * (miroir de DemandeWizard.getSpecificFields pour constitution_societe_*).
 * Sert à afficher la fiche de demande COMPLÈTE côté admin, y compris les
 * champs laissés vides (« — non renseigné »).
 */
export interface ConstitutionField { name: string; label: string }

export const CONSTITUTION_FORM_FIELDS: Record<string, ConstitutionField[]> = {
  constitution_societe_senegal: [
    { name: 'denomination_prevue', label: 'Dénomination sociale ou nom commercial envisagé' },
    { name: 'forme_juridique_sn', label: 'Forme juridique envisagée (Sénégal)' },
    { name: 'siege_prevu_sn', label: 'Siège ou ville d’implantation prévue' },
    { name: 'activite_principale', label: 'Activité principale' },
    { name: 'nombre_associes_sn', label: 'Nombre d’associés / fondateurs' },
    { name: 'capital_social', label: 'Capital social (montant cumulé des apports)' },
    { name: 'apport_numeraire', label: 'Apport en numéraire' },
    { name: 'montant_apport_numeraire', label: 'Montant de l’apport en numéraire' },
    { name: 'apport_nature', label: 'Apport en nature' },
    { name: 'montant_apport_nature', label: 'Valeur estimée de l’apport en nature' },
    { name: 'apport_industrie', label: 'Apport en industrie' },
    { name: 'montant_apport_industrie', label: 'Valeur estimée de l’apport en industrie' },
    { name: 'ouverture_compte_bancaire', label: 'Souhaite ouvrir un compte bancaire professionnel' },
  ],
  constitution_societe_france: [
    { name: 'denomination_prevue', label: 'Dénomination sociale envisagée' },
    { name: 'forme_juridique_fr', label: 'Forme juridique envisagée (France)' },
    { name: 'departement_siege', label: 'Département ou ville du siège social' },
    { name: 'activite_principale', label: 'Activité principale' },
    { name: 'nombre_associes_fr', label: 'Nombre d’associés / associés uniques' },
    { name: 'capital_social', label: 'Capital social (montant cumulé des apports)' },
    { name: 'apport_numeraire', label: 'Apport en numéraire' },
    { name: 'montant_apport_numeraire', label: 'Montant de l’apport en numéraire' },
    { name: 'apport_nature', label: 'Apport en nature' },
    { name: 'montant_apport_nature', label: 'Valeur estimée de l’apport en nature' },
    { name: 'apport_industrie', label: 'Apport en industrie' },
    { name: 'montant_apport_industrie', label: 'Valeur estimée de l’apport en industrie' },
    { name: 'ouverture_compte_bancaire', label: 'Souhaite ouvrir un compte bancaire professionnel' },
  ],
};

/**
 * Fusionne les valeurs saisies (champsFormulaire) avec la liste complète des
 * rubriques du formulaire pour le type de dossier donné. Retourne toutes les
 * rubriques (remplies + vides), puis les éventuelles rubriques supplémentaires
 * stockées mais hors formulaire (ex. « forme juridique recommandée »).
 */
export function buildConstitutionFields(
  type: string,
  champs: Array<{ nom?: string; libelle?: string; valeur?: string }> | undefined
): Array<{ label: string; value: string; empty?: boolean }> {
  const schema = CONSTITUTION_FORM_FIELDS[type];
  const list = Array.isArray(champs) ? champs : [];
  if (!schema) {
    return list.map((c) => ({ label: c.libelle || c.nom || '', value: (c.valeur ?? '').toString() }));
  }
  const byNom = new Map<string, string>();
  const byLabel = new Map<string, string>();
  list.forEach((c) => {
    if (c.nom) byNom.set(c.nom, (c.valeur ?? '').toString());
    if (c.libelle) byLabel.set(c.libelle.trim(), (c.valeur ?? '').toString());
  });

  const out: Array<{ label: string; value: string; empty?: boolean }> = [];
  const usedLabels = new Set<string>();
  const usedNoms = new Set<string>();
  for (const f of schema) {
    let v = byNom.has(f.name) ? byNom.get(f.name) : byLabel.get(f.label.trim());
    usedNoms.add(f.name);
    usedLabels.add(f.label.trim());
    const filled = v !== undefined && String(v).trim() !== '';
    out.push({ label: f.label, value: filled ? String(v) : '— non renseigné', empty: !filled });
  }
  // Rubriques stockées hors formulaire (ex. recommandation validée) : on les ajoute à la fin.
  list.forEach((c) => {
    const lbl = (c.libelle || c.nom || '').trim();
    const already = (c.nom && usedNoms.has(c.nom)) || usedLabels.has(lbl);
    if (!already && (c.valeur ?? '').toString().trim() !== '') {
      out.push({ label: c.libelle || c.nom || '', value: String(c.valeur) });
    }
  });
  return out;
}
