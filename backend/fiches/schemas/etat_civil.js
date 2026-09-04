/** Fiche d'identification - personne physique (bloc état civil). */
module.exports = {
  type: 'etat_civil',
  titre: "Fiche d'identification - personne physique",
  sousTitre: '',
  sections: [
    {
      id: 'identite', titre: 'Identité',
      fields: [
        { name: 'nom', label: 'Nom', type: 'text', required: true },
        { name: 'prenoms', label: "Prénoms (dans l'ordre de l'état civil)", type: 'text', required: true },
        { name: 'date_lieu_naissance', label: 'Date et lieu de naissance', type: 'text', fullWidth: true },
        { name: 'nationalite', label: 'Nationalité', type: 'text' },
      ],
    },
    {
      id: 'coordonnees', titre: 'Coordonnées',
      fields: [
        { name: 'adresse_principale', label: 'Adresse principale', type: 'text', fullWidth: true },
        { name: 'adresse_secondaire', label: 'Adresse secondaire', type: 'text', fullWidth: true },
        { name: 'telephone1', label: 'Téléphone', type: 'text' },
        { name: 'telephone2', label: 'Téléphone (2)', type: 'text' },
        { name: 'email', label: 'Adresse mail', type: 'text', fullWidth: true },
      ],
    },
    {
      id: 'activite', titre: 'Activité',
      fields: [
        { name: 'profession', label: 'Profession', type: 'text' },
        { name: 'fonction_actuelle', label: 'Fonction actuelle', type: 'text' },
        { name: 'fonction_precedente', label: "Fonction précédemment occupée (si différente de l'actuelle)", type: 'text', fullWidth: true },
      ],
    },
    {
      id: 'pieces', titre: "Pièces d'identité",
      fields: [
        { name: 'cni_numero', label: "Numéro carte d'identité", type: 'text' },
        { name: 'cni_delivrance', label: 'Date de délivrance (CNI)', type: 'text' },
        { name: 'passeport_numero', label: 'Numéro passeport', type: 'text' },
        { name: 'passeport_delivrance', label: 'Date de délivrance (passeport)', type: 'text' },
      ],
    },
    {
      id: 'famille', titre: 'Situation familiale',
      fields: [
        { name: 'statut_matrimonial', label: 'Statut matrimonial', type: 'radio', options: [
          { value: 'celibataire', label: 'Célibataire' }, { value: 'marie', label: 'Marié(e)' }, { value: 'veuf', label: 'Veuf(ve)' }, { value: 'divorce', label: 'Divorcé(e)' },
        ] },
        { name: 'regime_matrimonial', label: 'Régime matrimonial', type: 'radio', options: [
          { value: 'separation', label: 'Séparation' }, { value: 'communaute', label: 'Communauté' },
        ] },
        { name: 'conjoint_nom', label: 'Prénoms et nom du conjoint', type: 'text', fullWidth: true },
        { name: 'conjoint_fonction', label: 'Fonction du conjoint', type: 'text' },
        { name: 'conjoint_nationalite', label: 'Nationalité du conjoint', type: 'text' },
        { name: 'pere_nom', label: 'Prénoms et nom du père (si étranger)', type: 'text' },
        { name: 'pere_fonction', label: 'Fonction du père (si étranger)', type: 'text' },
        { name: 'mere_nom', label: 'Prénoms et nom de la mère (si étranger)', type: 'text' },
        { name: 'mere_fonction', label: 'Fonction de la mère (si étranger)', type: 'text' },
      ],
    },
    {
      id: 'operation', titre: "Opération",
      fields: [
        { name: 'nature_operation', label: "Nature de l'opération", type: 'text', fullWidth: true },
        { name: 'montant_operation', label: "Montant de l'opération", type: 'montant' },
        { name: 'mode_paiement', label: 'Mode de paiement', type: 'radio', options: [
          { value: 'especes', label: 'Espèces' }, { value: 'cheque', label: 'Chèque' }, { value: 'virement', label: 'Virement' },
        ] },
        { name: 'date_paiement', label: 'Date de paiement', type: 'text', autoToday: true },
        { name: 'origine_fonds', label: 'Origine des fonds', type: 'textarea', fullWidth: true },
      ],
    },
    {
      id: 'nb', titre: '',
      static: "NB : Cette fiche tient lieu de déclaration sur l'honneur et engage la responsabilité du déclarant.",
    },
  ],
  signature: true,
};
