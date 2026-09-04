/** Schéma fiche SA avec Conseil d'Administration (PCA + DG) - Sénégal. */
const { TXT, sectionObjet, sectionIdentite, sectionPublication, staticSection } = require('../common');

const VAL_NOMINALE_SA = [
  { value: '5000', label: '5 000 F CFA' },
  { value: '10000', label: '10 000 F CFA ou plus' },
  { value: 'autre', label: 'Autre (montant nominal à préciser)' },
];

module.exports = {
  type: 'sa_ca',
  titre: "Fiche de renseignements - SA (Conseil d'Administration)",
  sousTitre: "Société Anonyme avec Conseil d'Administration (PCA et Directeur Général)",
  associesSource: { section: 'repartition', field: 'nom' },
  gerantsSource: { section: 'administrateurs', field: 'nom', fields: ['pca', 'dg'] },
  sections: [
    sectionObjet(),
    sectionIdentite(),
    {
      id: 'capital', titre: 'Capital social',
      note: 'Minimum 10 000 000 F CFA, libérable au minimum au quart (2 500 000 F CFA) à la constitution.',
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
      id: 'nb_actionnaires', titre: '',
      fields: [{ name: 'nombre_actionnaires', label: 'Nombre d’actionnaires', type: 'number', sizesSection: 'repartition' }],
    },
    {
      id: 'repartition', titre: 'Actionnaires et répartition du capital',
      note: 'Ajoutez une ligne par actionnaire : chacun recevra sa fiche d’identité à remplir et devra fournir sa pièce d’identité. Renseignez son e-mail : à la validation, un lien personnel lui sera envoyé automatiquement pour compléter ses documents.',
      repeatable: { itemLabel: 'Actionnaire', fields: [{ name: 'nom', label: 'Nom de l’actionnaire', type: 'text', required: true }, { name: 'pourcentage', label: 'Part (%)', type: 'percent', required: true }, { name: 'email', label: 'E-mail (pour l’inviter)', type: 'text', required: false, placeholder: 'email@exemple.com' }] },
    },
    {
      id: 'liberation', titre: 'Libération du capital',
      repeatable: { itemLabel: 'Actionnaire', fields: [{ name: 'nom', label: 'Nom de l’actionnaire', type: 'text', required: true }, { name: 'montant', label: 'Montant libéré', type: 'montant', required: true }] },
    },
    {
      id: 'commissaires', titre: 'Commissaires aux comptes',
      note: 'Obligatoire.',
      fields: [
        { name: 'commissaire_titulaire', label: 'Titulaire', type: 'text' },
        { name: 'commissaire_suppleant', label: 'Suppléant', type: 'text' },
      ],
    },
    staticSection('exercices', 'Exercices sociaux', TXT.exercices),
    {
      id: 'administration', titre: 'Mode d’administration',
      fields: [
        { name: 'pca', label: 'Président du Conseil d’Administration - identité', type: 'text' },
        { name: 'dg', label: 'Directeur Général - identité', type: 'text' },
      ],
    },
    {
      id: 'administrateurs', titre: 'Administrateurs',
      repeatable: { itemLabel: 'Administrateur', fields: [{ name: 'nom', label: 'Nom et prénom', type: 'text', required: true }] },
    },
    sectionPublication(),
    staticSection('pieces', 'Pièces à fournir', TXT.piecesActionnaires),
    staticSection('formalites', 'Formalités administratives et fiscales', TXT.formalites),
  ],
  signature: true,
};
