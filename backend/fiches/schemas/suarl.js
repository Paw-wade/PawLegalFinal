/** Schéma fiche SUARL (Société Unipersonnelle à Responsabilité Limitée) — Sénégal. */
const { TXT, VAL_NOMINALE, LIBRE_CONDITIONS, sectionObjet, sectionIdentite, sectionPublication, staticSection } = require('../common');

module.exports = {
  type: 'suarl',
  titre: 'Fiche de renseignements — SUARL',
  sousTitre: 'Société Unipersonnelle à Responsabilité Limitée',
  associesSource: { field: 'associe_unique' },
  gerantsSource: { section: 'gerance', field: 'nom' },
  sections: [
    sectionObjet(),
    sectionIdentite(),
    {
      id: 'capital', titre: 'Capital social',
      fields: [
        { name: 'capital_social', label: 'Capital social (montant cumulé des apports)', type: 'montant', required: true, fullWidth: true },
        { name: 'apport_numeraire', label: 'Apports en numéraire', type: 'montant' },
        { name: 'apport_nature', label: 'Apports en nature', type: 'text', placeholder: 'Description / valeur estimée' },
        { name: 'apport_industrie', label: 'Apports en industrie', type: 'text', placeholder: 'Description / valeur estimée' },
        { name: 'nombre_parts', label: 'Divisé en (nombre de parts sociales)', type: 'number', suffix: 'parts sociales' },
        { name: 'valeur_nominale', label: 'Valeur nominale de la part', type: 'radio', options: VAL_NOMINALE },
      ],
    },
    {
      id: 'associe', titre: 'Associé unique',
      fields: [{ name: 'associe_unique', label: 'Nom de l’associé unique', type: 'text', required: true, fullWidth: true }],
    },
    staticSection('nb', '', TXT.nbIncompat),
    {
      id: 'gerance', titre: 'Gérance', note: 'État civil complet à fournir pour chaque gérant (selon la fiche d’état civil).',
      repeatable: { itemLabel: 'Gérant', fields: [{ name: 'nom', label: 'Nom du gérant', type: 'text', required: true }] },
    },
    {
      id: 'gerance_mode', titre: '',
      fields: [{ name: 'gerance_mode', label: 'En cas de plusieurs gérants, ils agissent', type: 'radio', options: [{ value: 'conjointement', label: 'Conjointement' }, { value: 'separement', label: 'Séparément' }] }],
    },
    staticSection('exercices', 'Exercices sociaux', TXT.exercices),
    {
      id: 'cession', titre: 'Cession de parts sociales',
      fields: [
        { name: 'cession_entre_associes', label: 'Entre associés', type: 'radio', options: LIBRE_CONDITIONS },
        { name: 'cession_conjoints', label: 'Entre conjoints, ascendants et descendants', type: 'radio', options: LIBRE_CONDITIONS },
        { name: 'cession_conditions', label: 'Préciser les conditions de transmission', type: 'textarea', fullWidth: true },
        { name: 'cession_tiers', label: 'À des tiers', type: 'radio', options: [{ value: 'libre', label: 'Libre' }, { value: 'agrement', label: 'Soumise à agrément' }] },
      ],
      note: TXT.agrementSarl,
    },
    {
      id: 'transmission_deces', titre: 'Transmission pour cause de décès',
      fields: [{ name: 'transmission_deces', label: 'En cas de décès de l’associé', type: 'radio', options: [{ value: 'libre', label: 'Le ou les héritiers deviennent librement associés.' }, { value: 'agrement', label: 'Le ou les héritiers deviennent associés après agrément.' }] }],
    },
    sectionPublication(),
    staticSection('pieces', 'Pièces à fournir', TXT.piecesGerants),
    staticSection('formalites', 'Formalités administratives et fiscales', TXT.formalites),
  ],
  signature: true,
};
