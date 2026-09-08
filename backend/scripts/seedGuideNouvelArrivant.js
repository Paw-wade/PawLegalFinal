/**
 * Seed du guide "Nouvel arrivant - Etudiant international en France"
 * Usage : node backend/scripts/seedGuideNouvelArrivant.js
 * Relancer sans risque : upsert par slug.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const GuideConfig = require('../models/GuideConfig');

const STEPS = [
  {
    order: 1,
    titre: 'Valider le visa VLS-TS',
    description:
      "Si vous etes arrive avec un Visa de Long Sejour valant Titre de Sejour (VLS-TS, mention \"VLSTS\" sur la vignette), vous devez le valider en ligne pour qu'il ait la valeur d'un titre de sejour. La validation se fait via un compte ANEF : creation du compte (par e-mail ou FranceConnect), saisie du numero de visa, des dates de validite, de la date d'entree en France et de l'adresse de residence, puis paiement de la taxe.",
    deadline:
      "Dans les 3 mois suivant l'arrivee en France. Passe ce delai, vous etes en situation irreguliere.",
    cost: '60 euros (taxe etudiant), payable en ligne par carte bancaire ou par timbre electronique achete en bureau de tabac.',
    links: [
      {
        label: 'Administration Etrangers en France (ANEF)',
        url: 'https://administration-etrangers-en-france.interieur.gouv.fr/particuliers/#/',
      },
    ],
    warningNote: "Exception : les mineurs titulaires d'un visa mention \"mineur scolarise\" n'ont pas a valider leur visa. Ce visa ne vaut pas titre de sejour autonome et ne necessite aucune demarche de validation sur l'ANEF.",
    special: '',
    banqueOptions: [],
  },
  {
    order: 2,
    titre: 'Payer la CVEC (Contribution Vie Etudiante et de Campus)',
    description:
      "Creer un compte et regler la CVEC avant l'inscription administrative dans l'etablissement. Une attestation numerotee est delivree immediatement apres paiement. Ce numero sera demande par l'universite lors de l'inscription.",
    deadline:
      "Avant la rentree / avant l'inscription administrative. Sans cette attestation, l'inscription est refusee.",
    cost: '105 euros par an (certains boursiers en sont exoneres).',
    links: [{ label: 'cvec.etudiant.gouv.fr', url: 'https://cvec.etudiant.gouv.fr' }],
    warningNote: '',
    special: '',
    banqueOptions: [],
  },
  {
    order: 3,
    titre: "S'inscrire a la securite sociale etudiante",
    description:
      "Les etudiants hors UE/EEE/Suisse doivent s'affilier a l'Assurance Maladie francaise. Cette inscription est transitoire : elle permet d'obtenir un acces provisoire en attendant la validation complete du dossier, puis de creer un compte Ameli definitif.\n\nL'inscription se fait en ligne (francais, anglais, espagnol) apres l'inscription dans l'etablissement. Pieces a preparer : piece d'identite ou VLS-TS valide, certificat de scolarite, RIB, acte de naissance traduit si hors UE.\n\nApres le depot des documents, ils seront verifies. Vous serez informe de l'avancee de votre dossier depuis votre espace personnel et par mail. Si une piece est non conforme ou a deposer, vous serez automatiquement avise par mail. Sans reponse a nos sollicitations, votre dossier sera clos au bout de 2 relances.\n\nVotre attestation de droits provisoire, avec votre NIA (Numero d'Identification d'Attente), sera disponible apres validation des documents et sous 2 conditions :\n- Des que la date de debut de votre scolarite sera atteinte\n- Lorsque votre regularite de sejour sera averee si vous etes concerne\n\nUne fois votre dossier complet, votre NIA sera soumis a validation afin d'obtenir un NIR definitif. Votre espace personnel sera alors clos. Vous recevrez un imprime de demande de carte vitale des l'obtention de votre NIR et pourrez ensuite creer votre compte Ameli.\n\nDes que votre compte Ameli est cree, declarez un medecin traitant. Sans medecin traitant designe, vos remboursements sont reduits (30 % au lieu de 70 % pour les consultations chez un specialiste). La declaration se fait depuis votre espace Ameli ou lors de votre premiere consultation. Pour trouver un medecin qui accepte de nouveaux patients, consultez Doctolib.",
    deadline:
      "Des que possible apres l'inscription dans l'etablissement. Compter 8 a 12 semaines de traitement.",
    cost: 'Gratuit.',
    links: [
      { label: 'etudiant-etranger.ameli.fr', url: 'https://etudiant-etranger.ameli.fr' },
      { label: 'Creer mon compte Ameli', url: 'https://www.ameli.fr' },
      { label: 'Trouver un medecin traitant (Doctolib)', url: 'https://www.doctolib.fr' },
    ],
    warningNote:
      "Les etudiants UE/EEE/Suisse munis d'une Carte Europeenne d'Assurance Maladie (CEAM) valide n'ont aucune demarche a faire ici.",
    special: '',
    banqueOptions: [],
  },
  {
    order: 4,
    titre: 'Ouvrir un compte bancaire francais',
    description:
      "Ouvrir un compte aupres d'une banque francaise (en agence ou en ligne). Un RIB francais est necessaire pour la CAF, les remboursements de securite sociale, le paiement du loyer et de nombreuses demarches ulterieures. Documents generalement demandes : passeport, justificatif de domicile, certificat de scolarite.",
    deadline: "Des que possible apres l'arrivee.",
    cost: '',
    links: [],
    promoNote: "Profitez de nos offres de parrainage et gagnez jusqu'a 150 euros de prime a l'ouverture de votre compte bancaire.",
    warningNote: '',
    special: 'banque',
    banqueOptions: [
      {
        nom: 'BNP Paribas',
        type: 'formulaire',
        url: '',
        label: '',
      },
      {
        nom: 'Boursobank',
        type: 'lien',
        url: 'https://bour.so/p/Ys706JvrfwI',
        label: 'Ouvrir via parrainage',
      },
      {
        nom: 'Revolut',
        type: 'lien',
        url: 'https://revolut.com/referral/?referral-code=papaab_ok_lnog!SEP1-26-AR&geo-redirect',
        label: 'Ouvrir via parrainage',
      },
    ],
  },
  {
    order: 5,
    titre: 'Souscrire une mutuelle complementaire',
    description:
      "L'Assurance Maladie (securite sociale) rembourse en moyenne 70 % des soins courants. La mutuelle complementaire prend en charge le reste (ticket moderateur, depassements d'honoraires, optique, dentaire). Sans mutuelle, les frais non rembourses restent a votre charge.\n\nPlusieurs options existent pour les etudiants :\n- LMDE, SMENO, Heyme, MEP : mutuelles dediees aux etudiants, avec des tarifs adaptes\n- Mutuelle de l'etablissement : certaines universites negocient des contrats collectifs avantageux\n- Complementaire Sante Solidaire (CSS) : gratuite ou quasi-gratuite pour les boursiers et etudiants aux revenus modestes (a verifier aupres de la CAF)\n\nLa souscription est possible des l'obtention du numero de securite sociale provisoire (NIA). La mutuelle peut etre exigee par certaines ecoles ou pour l'obtention d'un logement CROUS.",
    deadline: "Des l'obtention du NIA (Numero d'Identification d'Attente). Ne pas attendre le NIR definitif.",
    cost: "Variable : de 0 euro/mois (CSS) a environ 30-60 euros/mois selon la formule choisie.",
    links: [
      { label: 'Complementaire Sante Solidaire (CSS)', url: 'https://www.complementaire-sante-solidaire.gouv.fr' },
      { label: 'LMDE', url: 'https://www.lmde.com' },
    ],
    warningNote:
      "Les boursiers CROUS sur criteres sociaux peuvent beneficier de la CSS gratuitement ou a 1 euro/mois. Verifiez votre eligibilite avant de souscrire une mutuelle payante.",
    special: '',
    banqueOptions: [],
  },
  {
    order: 6,
    titre: "Chercher un logement et demander l'aide au logement (APL)",
    description:
      "1. Demander la Garantie Visale (caution locative gratuite) avant de commencer les visites, si le bailleur l'accepte.\n2. Une fois le logement trouve, deposer un dossier CAF pour l'APL des le premier mois.",
    deadline: '',
    cost: '',
    links: [
      { label: 'Garantie Visale', url: 'https://www.visale.fr' },
      { label: "Demande d'APL (CAF)", url: 'https://www.caf.fr' },
    ],
    warningNote:
      "Depuis la loi de finances 2026, les etudiants hors UE/EEE/Suisse doivent etre boursiers CROUS sur criteres sociaux pour percevoir l'APL. Les non-boursiers non-UE en sont exclus depuis le 1er juillet 2026.",
    special: '',
    banqueOptions: [],
  },
  {
    order: 7,
    titre: "Finaliser l'inscription administrative a l'etablissement",
    description:
      "Presenter a l'etablissement l'ensemble des pieces requises : attestation CVEC, VLS-TS valide (ou recepisse), justificatif de domicile, releves de notes et diplomes selon le niveau d'inscription. Cette etape conditionne la delivrance de la carte d'etudiant.",
    deadline: "Selon le calendrier propre a chaque etablissement.",
    cost: '',
    links: [],
    warningNote: '',
    special: '',
    banqueOptions: [],
  },
  {
    order: 8,
    titre: 'Anticiper le renouvellement du titre de sejour',
    description:
      "Deposer la demande de renouvellement en ligne sur l'ANEF, dans la rubrique \"Je renouvelle ou modifie mon titre\".",
    deadline: "Entre 4 et 2 mois avant l'expiration du titre en cours.",
    cost: '150 euros (100 euros de taxe + 50 euros de droit de timbre). Majoration de 180 euros en cas de depot hors delai.',
    links: [
      {
        label: 'ANEF - Renouvellement de titre',
        url: 'https://administration-etrangers-en-france.interieur.gouv.fr/particuliers/#/',
      },
      {
        label: 'Consultez le Calculateur',
        url: '/calculateur',
      },
    ],
    warningNote:
      "Depuis le 1er janvier 2026, toute premiere delivrance d'une carte de sejour pluriannuelle (y compris lors du passage Licence vers Master) exige la reussite de l'examen civique (score superieur ou egal a 80 %) et un niveau A2 de francais.",
    special: '',
    banqueOptions: [],
  },
];

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI manquant dans .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connecte a MongoDB');

  await GuideConfig.findOneAndUpdate(
    { slug: 'nouvel-arrivant' },
    {
      slug: 'nouvel-arrivant',
      titre: 'Guide du nouvel arrivant - Etudiant international en France',
      intro:
        "Ce guide recapitule, etape par etape, les demarches administratives a effectuer des votre arrivee en France. Chaque etape indique ce qu'il faut faire, le delai a respecter et le lien officiel vers la plateforme concernee.",
      steps: STEPS,
    },
    { upsert: true, new: true }
  );

  console.log('Guide "nouvel-arrivant" insere/mis a jour avec succes (%d etapes)', STEPS.length);
  await mongoose.disconnect();
}

seed().catch((e) => {
  console.error('Seed echoue:', e);
  process.exit(1);
});
