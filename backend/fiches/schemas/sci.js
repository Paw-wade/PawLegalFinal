/** Schéma fiche SCI (Société Civile Immobilière) - Sénégal (COCC art. 765 à 810). */
const { TXT, VAL_NOMINALE, sectionObjet, sectionIdentite, sectionPublication, staticSection } = require('../common');

const RESP =
  "Dans ses rapports avec ses coassociés, chaque associé n’est tenu des dettes sociales que dans la proportion du nombre de parts qu’il possède. Vis-à-vis des créanciers, chaque associé est tenu des dettes et engagements sociaux à parts égales, sans qu’il soit tenu compte de leurs apports ; toutefois les créanciers ne peuvent poursuivre un associé qu’après avoir vainement poursuivi la société.";
const TRANSM =
  "Transmission de parts (art. 787 COCC) : toute cession est soumise à une majorité - entre associés, conjoints, ascendants et descendants : majorité absolue ; à des tiers : majorité des trois quarts. La majorité se calcule selon le nombre d’associés (art. 796 COCC).";
const DECES =
  "En cas de décès d’un associé ou de dissolution de communauté entre époux, la société continue entre les associés survivants et les ayants droit ou héritiers de l’associé décédé, éventuellement le conjoint survivant, avec l’agrément des associés survivants.";
const PIECES_SCI =
  "Chaque associé fournit une copie de sa pièce d’identité ou de son passeport. Si l’associé est une société : les statuts et la dernière délibération du conseil d’administration ou de l’AGO décidant de la participation et désignant les dirigeants. Après accomplissement des formalités, sont remis au client : le NINEA, le récépissé de la déclaration d’existence, la déclaration d’établissement, la copie authentique des statuts et les journaux d’annonces légales.";

module.exports = {
  type: 'sci',
  titre: 'Fiche de renseignements - SCI',
  sousTitre: 'Société Civile Immobilière (COCC, art. 765 à 810)',
  associesSource: { section: 'repartition', field: 'nom' },
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
      id: 'nb_associes', titre: '',
      fields: [{ name: 'nombre_associes', label: 'Nombre d’associés', type: 'number', sizesSection: 'repartition' }],
    },
    {
      id: 'repartition', titre: 'Associés et répartition du capital',
      note: 'Ajoutez une ligne par associé : chaque associé listé recevra sa fiche d’identité à remplir et devra fournir sa pièce d’identité. Renseignez son e-mail : à la validation, un lien personnel lui sera envoyé automatiquement pour compléter ses documents.',
      repeatable: { itemLabel: 'Associé', fields: [{ name: 'nom', label: 'Nom de l’associé', type: 'text', required: true }, { name: 'pourcentage', label: 'Part (%)', type: 'percent', required: true }, { name: 'email', label: 'E-mail (pour l’inviter)', type: 'text', required: false, placeholder: 'email@exemple.com' }] },
    },
    staticSection('responsabilite', 'Responsabilité des associés', RESP),
    staticSection('transmission', 'Transmission de parts sociales', TRANSM),
    staticSection('deces', 'Transmission pour cause de décès', DECES),
    {
      id: 'gerance', titre: 'Gérance', note: 'État civil complet à fournir pour chaque gérant (selon la fiche d’état civil).',
      repeatable: { itemLabel: 'Gérant', fields: [{ name: 'nom', label: 'Nom du gérant', type: 'text', required: true }] },
    },
    {
      id: 'gerance_mode', titre: '',
      fields: [{ name: 'gerance_mode', label: 'En cas de plusieurs gérants, ils agissent', type: 'radio', options: [{ value: 'conjointement', label: 'Conjointement' }, { value: 'separement', label: 'Séparément' }] }],
    },
    staticSection('exercices', 'Exercices sociaux', TXT.exercices),
    sectionPublication(),
    staticSection('pieces', 'Pièces à fournir', PIECES_SCI),
  ],
  signature: true,
};
