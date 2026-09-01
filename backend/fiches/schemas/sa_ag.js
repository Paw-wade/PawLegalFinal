/** Schéma fiche SA avec Administrateur Général — Sénégal. */
const { TXT, VAL_NOMINALE, sectionObjet, sectionIdentite, sectionPublication, staticSection } = require('../common');

const VAL_NOMINALE_SA = [
  { value: '5000', label: '5 000 F CFA' },
  { value: '10000', label: '10 000 F CFA ou plus' },
  { value: 'autre', label: 'Autre (montant nominal à préciser)' },
];

module.exports = {
  type: 'sa_ag',
  titre: 'Fiche de renseignements — SA (Administrateur Général)',
  sousTitre: 'Société Anonyme avec Administrateur Général',
  associesSource: { section: 'souscription', field: 'nom' },
  sections: [
    sectionObjet(),
    sectionIdentite(),
    {
      id: 'capital', titre: 'Capital social',
      note: 'Minimum 10 000 000 F CFA, libérable au minimum au quart (1/4) à la constitution ; le reste dans un délai de 3 ans.',
      fields: [
        { name: 'capital_social', label: 'Capital social (montant cumulé des apports)', type: 'montant', required: true, fullWidth: true },
        { name: 'apport_numeraire', label: 'Apports en numéraire', type: 'montant' },
        { name: 'apport_nature', label: 'Apports en nature', type: 'text', placeholder: 'Description / valeur estimée' },
        { name: 'nombre_actions', label: 'Divisé en (nombre d’actions)', type: 'number', suffix: 'actions' },
        { name: 'valeur_nominale', label: 'Valeur nominale de l’action', type: 'radio', options: VAL_NOMINALE_SA },
        { name: 'valeur_nominale_autre', label: 'Si « Autre », préciser la valeur nominale', type: 'montant' },
      ],
    },
    {
      id: 'souscription', titre: 'Souscription du capital',
      repeatable: { itemLabel: 'Actionnaire', fields: [{ name: 'nom', label: 'Nom de l’actionnaire', type: 'text', required: true }, { name: 'montant', label: 'Montant souscrit', type: 'montant', required: true }] },
    },
    {
      id: 'liberation', titre: 'Libération du capital',
      repeatable: { itemLabel: 'Actionnaire', fields: [{ name: 'nom', label: 'Nom de l’actionnaire', type: 'text', required: true }, { name: 'montant', label: 'Montant libéré', type: 'montant', required: true }] },
    },
    {
      id: 'commissaires', titre: 'Commissaires aux comptes',
      note: 'Obligatoire — choisis parmi les experts-comptables du Sénégal.',
      fields: [
        { name: 'commissaire_titulaire', label: 'Titulaire', type: 'text' },
        { name: 'commissaire_suppleant', label: 'Suppléant', type: 'text' },
      ],
    },
    staticSection('exercices', 'Exercices sociaux', TXT.exercices),
    {
      id: 'administration', titre: 'Mode d’administration',
      fields: [
        { name: 'mode_admin', label: 'Structure', type: 'radio', options: [{ value: 'ag', label: 'SA avec Administrateur Général' }, { value: 'ag_aga', label: 'SA avec Administrateur Général et Administrateur Général Adjoint' }] },
        { name: 'administrateur_general', label: 'Administrateur Général — identité', type: 'text' },
        { name: 'administrateur_general_adjoint', label: 'Administrateur Général Adjoint — identité (le cas échéant)', type: 'text' },
      ],
    },
    sectionPublication(),
    staticSection('pieces', 'Pièces à fournir', TXT.piecesActionnaires),
    staticSection('formalites', 'Formalités administratives et fiscales', TXT.formalites),
  ],
  signature: true,
};
