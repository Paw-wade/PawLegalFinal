/** Éléments réutilisés par plusieurs schémas de fiches (source commune). */

const JOURNAUX = [
  'Le Soleil', 'JAL', 'Edja Lex', 'Bulletin de la Chambre de Commerce',
  'Les Petites Affiches', "L'Acte", "l'insertion", 'Leg Info', 'ENAP',
  "l'Iris", 'Tara Annonces Légales',
];

const TXT = {
  exercices:
    "Du 1er janvier au 31 décembre. Exceptionnellement, l’exercice social des sociétés constituées à partir du mois de juin d’une année est prolongé jusqu’au 31 décembre de l’année suivante.",
  nbIncompat:
    "NB : suivant l’art. 9 de l’Acte Uniforme sur les Sociétés Commerciales et le GIE, l’exercice de l’activité commerciale est incompatible avec certaines fonctions ou professions (fonctionnaires, officiers ministériels, expert-comptable agréé, courtier maritime, conseil juridique).",
  formalites:
    "Les formalités de constitution sont effectuées à l’APIX (Guichet Unique), regroupant le Greffe (immatriculation au Registre du Commerce), le Bureau de Recouvrement (enregistrement des statuts), l’Administration Fiscale (NINEA et Déclaration d’Existence) et l’Inspection du Travail (déclaration d’établissement). Après accomplissement des formalités, sont remis au client : la déclaration d’immatriculation, le NINEA, le récépissé de la déclaration d’existence, les copies authentiques des statuts et de la déclaration de régularité et de conformité, et les publications.",
  piecesGerants:
    "1. Chaque associé fournit une copie de sa pièce d’identité ou de son passeport. Si l’associé est une société : les statuts et la dernière délibération du conseil d’administration ou de l’AGO décidant de la participation et désignant les dirigeants.\n" +
    "2. Pour chaque gérant : un extrait de casier judiciaire pour l’immatriculation au RCCM. Les nationaux l’obtiennent au greffe du tribunal ; les étrangers fournissent l’extrait de leur pays puis s’adressent au greffe de la Cour d’Appel de Dakar.",
  piecesDirigeants:
    "1. Chaque associé fournit une copie de sa pièce d’identité ou de son passeport. Si l’associé est une société : les statuts et la dernière délibération du conseil d’administration ou de l’AGO décidant de la participation et désignant les dirigeants.\n" +
    "2. Pour chaque dirigeant : un extrait de casier judiciaire pour l’immatriculation au RCCM. Les nationaux l’obtiennent au greffe du tribunal ; les étrangers fournissent l’extrait de leur pays puis s’adressent au greffe de la Cour d’Appel de Dakar.",
  piecesActionnaires:
    "1. Chaque actionnaire fournit une copie de sa pièce d’identité ou de son passeport. Si l’actionnaire est une société : les statuts et la dernière délibération du conseil d’administration ou de l’AGO décidant de la participation et désignant les dirigeants.\n" +
    "2. Extrait de casier judiciaire (moins de 3 mois) pour chaque dirigeant, pour l’immatriculation au RCCM.\n" +
    "3. Documents portant acceptation des commissaires aux comptes nommés.",
  agrementSarl:
    "Procédure d’agrément (art. 319 AUSCGIE) : la transmission n’est possible qu’avec le consentement de la majorité des associés non cédants représentant les trois quarts des parts sociales, déduction faite des parts de l’associé cédant. Le projet de cession est notifié par l’associé cédant à la société et à chacun des autres associés.",
  agrementSas:
    "En cas d’agrément : toute cession d’actions à un tiers non associé est soumise à l’agrément préalable de la collectivité des associés (majorité à préciser dans les statuts). L’associé cédant notifie son projet (identité du cessionnaire, nombre d’actions, prix). Un droit de préemption peut jouer au profit des associés. En cas de refus d’agrément, la société fait acquérir les actions (associé, tiers agréé, ou rachat) dans le délai légal.",
};

const VAL_NOMINALE = [
  { value: '5000', label: '5 000 F CFA' },
  { value: '10000', label: '10 000 F CFA' },
];

const LIBRE_CONDITIONS = [
  { value: 'libre', label: 'Libre' },
  { value: 'conditions', label: 'Transmission soumise à conditions' },
];

// Sections réutilisables (retournent un objet section).
const sectionObjet = () => ({
  id: 'objet', titre: 'Objet social (activités)',
  fields: [{ name: 'objet_social', label: 'Objet social (activités)', type: 'textarea', required: true, fullWidth: true }],
});

const sectionIdentite = () => ({
  id: 'identite', titre: 'Identité de la société',
  fields: [
    { name: 'denomination', label: 'Dénomination', type: 'text', required: true },
    { name: 'sigle', label: 'En abrégé (sigle)', type: 'text' },
    { name: 'duree', label: 'Durée (99 ans maximum)', type: 'text', placeholder: 'Ex. 99 ans' },
    { name: 'siege_social', label: 'Siège social', type: 'text', required: true, default: 'DAKAR (Sénégal)' },
  ],
});

const sectionPublication = () => ({
  id: 'publication', titre: 'Publication (journal d’annonces légales)',
  fields: [{ name: 'journaux', label: 'Choisir le(s) journal(aux)', type: 'checkboxes', options: JOURNAUX.map((j) => ({ value: j, label: j })) }],
});

const staticSection = (id, titre, texte) => ({ id, titre, static: texte });

module.exports = { JOURNAUX, TXT, VAL_NOMINALE, LIBRE_CONDITIONS, sectionObjet, sectionIdentite, sectionPublication, staticSection };
