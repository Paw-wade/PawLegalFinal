/** Schéma fiche SASU (Société par Actions Simplifiée Unipersonnelle) - Sénégal. */
const { TXT, VAL_NOMINALE, sectionObjet, sectionIdentite, sectionPublication, staticSection } = require('../common');

const VAL_NOMINALE_SAS = [...VAL_NOMINALE, { value: 'autre', label: 'Autre (à préciser)' }];

module.exports = {
  type: 'sasu',
  titre: 'Fiche de renseignements - SASU',
  sousTitre: 'Société par Actions Simplifiée Unipersonnelle',
  associesSource: { field: 'associe_unique' },
  gerantsSource: { fields: ['president_nom', 'dg_nom'] },
  sections: [
    sectionObjet(),
    sectionIdentite(),
    {
      id: 'capital', titre: 'Capital social (librement fixé)',
      fields: [
        { name: 'capital_social', label: 'Capital social (montant cumulé des apports)', type: 'montant', required: true, fullWidth: true },
        { name: 'apport_numeraire', label: 'Apports en numéraire', type: 'montant' },
        { name: 'apport_nature', label: 'Apports en nature', type: 'text', placeholder: 'Description / valeur estimée' },
        { name: 'nombre_actions', label: 'Divisé en (nombre d’actions)', type: 'number', suffix: 'actions' },
        { name: 'valeur_nominale', label: 'Valeur nominale de l’action', type: 'radio', options: VAL_NOMINALE_SAS },
        { name: 'valeur_nominale_autre', label: 'Si « Autre », préciser la valeur nominale', type: 'montant' },
        { name: 'alienabilite', label: 'Actions', type: 'radio', options: [{ value: 'alienable', label: 'Aliénables' }, { value: 'inalienable', label: 'Inaliénables' }] },
        { name: 'inalienabilite_duree', label: 'Si inaliénables, pendant combien d’années', type: 'text', placeholder: 'Ex. 10 ans' },
      ],
    },
    {
      id: 'associe', titre: 'Associé unique',
      fields: [{ name: 'associe_unique', label: 'Nom de l’associé unique', type: 'text', required: true, fullWidth: true }],
    },
    staticSection('exercices', 'Exercices sociaux', TXT.exercices),
    {
      id: 'direction', titre: 'Direction de la société',
      fields: [
        { name: 'direction_structure', label: 'Structure de direction', type: 'radio', options: [{ value: 'president', label: 'SASU avec Président de société' }, { value: 'president_dg', label: 'SASU avec Président et Directeur Général' }] },
        { name: 'president_nom', label: 'Président - identité', type: 'text' },
        { name: 'dg_nom', label: 'Directeur Général - identité (le cas échéant)', type: 'text' },
        { name: 'pouvoirs', label: 'Pouvoirs à l’égard des tiers', type: 'radio', options: [{ value: 'plenitude', label: 'Plénitude de pouvoirs' }, { value: 'limitation', label: 'Limitation de pouvoirs' }] },
        { name: 'pouvoirs_limitation', label: 'Préciser en cas de limitation de pouvoirs', type: 'textarea', fullWidth: true },
      ],
    },
    sectionPublication(),
    staticSection('pieces', 'Pièces à fournir', TXT.piecesDirigeants),
    staticSection('formalites', 'Formalités administratives et fiscales', TXT.formalites),
  ],
  signature: true,
};
