/**
 * Schéma de la fiche de renseignements SARL (Sénégal), fidèle au document papier.
 * Ce schéma est la source de vérité : il pilote le formulaire en ligne ET le PDF généré.
 *
 * Types de champ : text, textarea, number, montant, percent, date, radio, checkboxes, select.
 * Sections : { fields } (normale), { static } (texte fixe), { repeatable } (bloc répétable).
 */
const JOURNAUX = [
  'Le Soleil', 'JAL', 'Edja Lex', 'Bulletin de la Chambre de Commerce',
  'Les Petites Affiches', "L'Acte", "l'insertion", 'Leg Info', 'ENAP',
  "l'Iris", 'Tara Annonces Légales',
];

module.exports = {
  type: 'sarl',
  titre: 'Fiche de renseignements — SARL',
  sousTitre: 'Société à Responsabilité Limitée',
  associesSource: { section: 'repartition', field: 'nom' },
  gerantsSource: { section: 'gerance', field: 'nom' },
  sections: [
    {
      id: 'objet',
      titre: 'Objet social (activités)',
      fields: [
        { name: 'objet_social', label: 'Objet social (activités)', type: 'textarea', required: true, fullWidth: true },
      ],
    },
    {
      id: 'identite',
      titre: 'Identité de la société',
      fields: [
        { name: 'denomination', label: 'Dénomination', type: 'text', required: true },
        { name: 'sigle', label: 'En abrégé (sigle)', type: 'text', required: false },
        { name: 'duree', label: 'Durée (99 ans maximum)', type: 'text', required: false, placeholder: 'Ex. 99 ans' },
        { name: 'siege_social', label: 'Siège social', type: 'text', required: true, default: 'DAKAR (Sénégal)' },
      ],
    },
    {
      id: 'capital',
      titre: 'Capital social',
      fields: [
        { name: 'capital_social', label: 'Capital social (montant cumulé des apports)', type: 'montant', required: true, fullWidth: true },
        { name: 'apport_numeraire', label: 'Apports en numéraire', type: 'montant', required: false },
        { name: 'apport_nature', label: 'Apports en nature', type: 'text', required: false, placeholder: 'Description / valeur estimée' },
        { name: 'apport_industrie', label: 'Apports en industrie', type: 'text', required: false, placeholder: 'Description / valeur estimée' },
        { name: 'nombre_parts', label: 'Divisé en (nombre de parts sociales)', type: 'number', required: false, suffix: 'parts sociales' },
        {
          name: 'valeur_nominale', label: 'Valeur nominale de la part', type: 'radio', required: false,
          options: [
            { value: '5000', label: '5 000 F CFA' },
            { value: '10000', label: '10 000 F CFA' },
          ],
        },
      ],
    },
    {
      id: 'repartition',
      titre: 'Associés et répartition du capital',
      note: 'Ajoutez une ligne par associé : chaque associé listé recevra sa fiche d’identité à remplir et devra fournir sa pièce d’identité.',
      repeatable: {
        itemLabel: 'Associé',
        fields: [
          { name: 'nom', label: 'Nom de l’associé', type: 'text', required: true },
          { name: 'pourcentage', label: 'Part (%)', type: 'percent', required: true },
        ],
      },
    },
    {
      id: 'nb_incompatibilites',
      titre: '',
      static:
        "NB : suivant l’art. 9 de l’Acte Uniforme sur les Sociétés Commerciales et le GIE, l’exercice de l’activité commerciale est incompatible avec certaines fonctions ou professions (fonctionnaires, officiers ministériels, expert-comptable agréé, courtier maritime, conseil juridique).",
    },
    {
      id: 'gerance',
      titre: 'Gérance',
      note: 'État civil complet à fournir pour chaque gérant (selon la fiche d’état civil).',
      repeatable: {
        itemLabel: 'Gérant',
        fields: [
          { name: 'nom', label: 'Nom du gérant', type: 'text', required: true },
        ],
      },
    },
    {
      id: 'gerance_mode',
      titre: '',
      fields: [
        {
          name: 'gerance_mode', label: 'En cas de plusieurs gérants, ils agissent', type: 'radio', required: false,
          options: [
            { value: 'conjointement', label: 'Conjointement' },
            { value: 'separement', label: 'Séparément' },
          ],
        },
      ],
    },
    {
      id: 'exercices',
      titre: 'Exercices sociaux',
      static:
        "Du 1er janvier au 31 décembre. Exceptionnellement, l’exercice social des sociétés constituées à partir du mois de juin d’une année est prolongé jusqu’au 31 décembre de l’année suivante.",
    },
    {
      id: 'cession',
      titre: 'Cession de parts sociales',
      fields: [
        {
          name: 'cession_entre_associes', label: 'Entre associés', type: 'radio', required: false,
          options: [
            { value: 'libre', label: 'Libre' },
            { value: 'conditions', label: 'Transmission soumise à conditions' },
          ],
        },
        {
          name: 'cession_conjoints', label: 'Entre conjoints, ascendants et descendants', type: 'radio', required: false,
          options: [
            { value: 'libre', label: 'Libre' },
            { value: 'conditions', label: 'Transmission soumise à conditions' },
          ],
        },
        { name: 'cession_conditions', label: 'Préciser les conditions de transmission', type: 'textarea', required: false, fullWidth: true },
        {
          name: 'cession_tiers', label: 'À des tiers', type: 'radio', required: false,
          options: [
            { value: 'libre', label: 'Libre' },
            { value: 'agrement', label: 'Soumise à agrément' },
          ],
        },
      ],
      note:
        "Procédure d’agrément (art. 319 AUSCGIE) : la transmission n’est possible qu’avec le consentement de la majorité des associés non cédants représentant les trois quarts des parts sociales, déduction faite des parts de l’associé cédant. Le projet de cession est notifié par l’associé cédant à la société et à chacun des autres associés.",
    },
    {
      id: 'transmission_deces',
      titre: 'Transmission pour cause de décès',
      fields: [
        {
          name: 'transmission_deces', label: 'En cas de décès d’un associé', type: 'radio', required: false,
          options: [
            { value: 'libre', label: 'Le ou les héritiers deviennent librement associés.' },
            { value: 'agrement', label: 'Le ou les héritiers deviennent associés après agrément des autres associés.' },
          ],
        },
      ],
    },
    {
      id: 'publication',
      titre: 'Publication (journal d’annonces légales)',
      fields: [
        {
          name: 'journaux', label: 'Choisir le(s) journal(aux)', type: 'checkboxes', required: false,
          options: JOURNAUX.map((j) => ({ value: j, label: j })),
        },
      ],
    },
    {
      id: 'pieces',
      titre: 'Pièces à fournir',
      static:
        "1. Chaque associé fournit une copie de sa pièce d’identité ou de son passeport. Si l’associé est une société : les statuts et la dernière délibération du conseil d’administration ou de l’AGO décidant de la participation et désignant les dirigeants.\n" +
        "2. Pour chaque gérant : un extrait de casier judiciaire pour l’immatriculation au Registre du Commerce et du Crédit Mobilier (RCCM). Les nationaux l’obtiennent au greffe du tribunal ; les étrangers fournissent l’extrait de leur pays puis s’adressent au greffe de la Cour d’Appel de Dakar.",
    },
    {
      id: 'formalites',
      titre: 'Formalités administratives et fiscales',
      static:
        "Les formalités de constitution sont effectuées à l’APIX (Guichet Unique), regroupant le Greffe (immatriculation au Registre du Commerce), le Bureau de Recouvrement (enregistrement des statuts), l’Administration Fiscale (NINEA et Déclaration d’Existence) et l’Inspection du Travail (déclaration d’établissement). Après accomplissement des formalités, sont remis au client : la déclaration d’immatriculation, le NINEA, le récépissé de la déclaration d’existence, les copies authentiques des statuts et de la déclaration de régularité et de conformité, et les publications.",
    },
  ],
  signature: true,
};
