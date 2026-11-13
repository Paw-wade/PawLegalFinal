'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const GuideConfig = require('../models/GuideConfig');

const EMPLOI_IDS = [
  '1jeune1solution',
  'cidj-emploi',
  'france-travail',
  'keljob',
  'indeed-sans-permis',
  'welcometothejungle',
  'indeed',
  'jobs-stages-letudiant',
  'studentjob',
  'studentpop',
  'jobetudiant',
  'jobetudiant-sans-permis',
  'jooble',
  'jobaviz',
  'youzful',
];

const NOUVEAUX_BONS_PLANS = [
  {
    id: '1jeune1solution',
    titre: '1 jeune 1 solution - Stages',
    categorie: 'emploi',
    description: 'Portail officiel du gouvernement francais dedie a l\'emploi des jeunes. La section Stages centralise toutes les offres de stages proposes par des entreprises partenaires de l\'Etat. Acces libre, sans inscription obligatoire. Particulierement utile pour les etudiants en recherche de stage conventionnes. Les offres couvrent tous les secteurs et toute la France.',
    lien: 'https://www.1jeune1solution.gouv.fr/stages',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'cidj-emploi',
    titre: 'CIDJ - Emploi, jobs et stages',
    categorie: 'emploi',
    description: 'Le Centre d\'Information et de Documentation Jeunesse (CIDJ) est un organisme public qui accompagne les jeunes dans leur orientation professionnelle. Sa rubrique emploi propose des offres de jobs etudiants, de stages et de premiers emplois. Le CIDJ publie aussi des guides pratiques sur le droit du travail et les demarches pour chercher un emploi en France. Ressource de reference pour comprendre les regles applicables aux jeunes travailleurs.',
    lien: 'https://www.cidj.com/emploi-jobs-stages',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'france-travail',
    titre: 'France Travail (ex-Pole Emploi)',
    categorie: 'emploi',
    description: 'France Travail est l\'operateur public du service de l\'emploi en France. Le site permet de rechercher des offres d\'emploi, de s\'inscrire comme demandeur d\'emploi et d\'acceder a des services d\'accompagnement (formation, aide a la redaction de CV, simulation d\'allocations). Pour les etudiants etrangers : inscription possible si vous avez un titre de sejour autorisant le travail. France Travail propose egalement des formations financees et des ateliers de recherche d\'emploi gratuits.',
    lien: 'https://www.francetravail.fr/accueil/',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'keljob',
    titre: 'Keljob',
    categorie: 'emploi',
    description: 'Keljob est un moteur de recherche d\'emploi francais qui agregue des milliers d\'offres provenant de sites partenaires (agences d\'interim, entreprises, jobboards). Il couvre CDI, CDD, interim, alternance et stages. L\'interface permet de filtrer par localisation, type de contrat et secteur d\'activite. Utile pour obtenir une vue d\'ensemble du marche et comparer les offres disponibles en un seul endroit.',
    lien: 'https://www.keljob.com',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'indeed-sans-permis',
    titre: 'Indeed - Emplois sans permis',
    categorie: 'emploi',
    description: 'Lien direct vers les offres Indeed filtrees sur "sans permis". Pratique si vous n\'avez pas encore votre permis de conduire en France. Les postes disponibles sont principalement dans la restauration, la distribution, le service a la personne, le gardiennage et les travaux menagers. Vous pouvez affiner par ville ou code postal. Certains employeurs acceptent de verifier la compatibilite de votre titre de sejour avec l\'emploi propose.',
    lien: 'https://fr.indeed.com/Emplois-Sans-Permis',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'welcometothejungle',
    titre: 'Welcome to the Jungle',
    categorie: 'emploi',
    description: 'Welcome to the Jungle est un site d\'emploi qui se distingue par la qualite de ses fiches entreprises : photos des locaux, temoignages de salaries, presentation de la culture d\'entreprise. Les offres ciblent plutot les profils qualifies (CDI, alternance, stages) dans les startups et grandes entreprises innovantes. Le site publie egalement un media avec des articles sur le monde du travail, utiles pour preparer ses entretiens et comprendre les tendances du marche.',
    lien: 'https://www.welcometothejungle.com/fr/jobs',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'indeed',
    titre: 'Indeed',
    categorie: 'emploi',
    description: 'Indeed est l\'un des plus grands moteurs de recherche d\'emploi au monde. En France, il reference des millions d\'offres dans tous les secteurs et tous types de contrats (CDI, CDD, interim, stage, alternance). La recherche peut se faire par mot-cle et localisation. Indeed permet egalement de deposer son CV en ligne pour que les recruteurs puissent vous contacter directement. Les avis d\'anciens salaries sur les entreprises peuvent aider a choisir un employeur.',
    lien: 'https://fr.indeed.com/',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'jobs-stages-letudiant',
    titre: "L'Etudiant - Jobs et stages",
    categorie: 'emploi',
    description: "Plateforme d'offres de jobs etudiants et de stages du magazine L'Etudiant. Elle s'adresse specifiquement aux etudiants et recense des milliers d'offres adaptees : jobs d'ete, jobs a temps partiel, stages de 2 mois a 6 mois. Le filtre par secteur, duree et localisation facilite la recherche. Le site propose aussi des conseils de redaction de CV et de lettre de motivation pour etudiants.",
    lien: 'https://jobs-stages.letudiant.fr/',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'studentjob',
    titre: 'StudentJob',
    categorie: 'emploi',
    description: 'StudentJob est une plateforme specialisee dans les offres d\'emploi destinees aux etudiants : jobs a temps partiel, jobs d\'ete, petits boulots le week-end, jobs le soir. Les offres sont souvent sans experience requise et peuvent etre exercees en parallele des etudes. Le site couvre des secteurs comme la restauration, la distribution, les evenements, le marketing et le baby-sitting. Inscription gratuite pour postuler directement en ligne.',
    lien: 'https://www.studentjob.fr/',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'studentpop',
    titre: 'Student Pop',
    categorie: 'emploi',
    description: 'Student Pop propose des missions ponctuelles et des jobs flexibles destines aux etudiants. Le principe : vous choisissez vos missions selon vos disponibilites (cours particuliers, aide a domicile, evenementiel, distribution de flyers, demenagement...). Paiement rapide apres chaque mission. Le site fonctionne comme une plateforme de mise en relation entre etudiants disponibles et particuliers ou entreprises ayant besoin d\'aide ponctuelle.',
    lien: 'https://www.studentpop.fr',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'jobetudiant',
    titre: 'JobEtudiant',
    categorie: 'emploi',
    description: 'JobEtudiant est un site d\'offres d\'emploi specifiquement concu pour les etudiants. Il reference des jobs a temps partiel, des jobs d\'ete et des stages adaptes aux emplois du temps universitaires. Les secteurs les plus representes sont la restauration, la grande distribution, le service a la personne et l\'animation. Inscription et consultation des offres gratuites. Possibilite de creer des alertes par secteur ou localisation.',
    lien: 'https://jobetudiant.net/',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'jobetudiant-sans-permis',
    titre: 'JobEtudiant - Emplois sans permis',
    categorie: 'emploi',
    description: 'Filtre direct sur JobEtudiant pour afficher uniquement les offres accessibles sans permis de conduire. Idéal en début d\'installation en France, avant d\'avoir fait valider ou repassé son permis. Les offres couvrent la livraison a velo, la restauration, la garde d\'enfants, la vente en magasin et de nombreux postes en centre-ville accessibles en transport en commun.',
    lien: 'https://jobetudiant.net/emplois/recherche',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'jooble',
    titre: 'Jooble',
    categorie: 'emploi',
    description: 'Jooble est un agregateur d\'offres d\'emploi international disponible en France. Il collecte des annonces provenant de centaines de jobboards et sites d\'entreprises pour les centraliser en un seul endroit. La recherche est simple : un mot-cle et une ville suffisent. Jooble est particulierement utile pour comparer rapidement les offres disponibles sur plusieurs plateformes sans devoir les consulter une par une.',
    lien: 'https://fr.jooble.org/',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'jobaviz',
    titre: 'Jobaviz',
    categorie: 'emploi',
    description: 'Jobaviz est une plateforme d\'emploi destinee aux jeunes, notamment aux alternants et aux etudiants en recherche de leur premier emploi. Elle propose des offres de stages, d\'alternance et de CDD/CDI juniors. Le site permet aussi de creer un profil visible par les recruteurs et de postuler directement en ligne. Certaines offres sont en partenariat avec des entreprises qui ont signe une charte pour l\'integration des jeunes.',
    lien: 'https://www.jobaviz.fr/',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
  {
    id: 'youzful',
    titre: 'Youzful (Credit Agricole)',
    categorie: 'emploi',
    description: 'Youzful est une plateforme d\'emploi des jeunes lancee par le Credit Agricole. Elle propose des offres de stages et d\'alternance, principalement dans les secteurs de la finance, de la banque, de l\'assurance et de l\'informatique. Le site propose aussi des outils d\'aide a la recherche d\'emploi : quiz de competences, conseils de preparation aux entretiens, et ateliers en ligne. Acces gratuit, inscription recommandee pour acceder a toutes les fonctionnalites.',
    lien: 'https://www.youzful-by-ca.fr',
    portee_geographique: 'national',
    date_verification: '2026-11',
  },
];

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MASTER_MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI manquant'); process.exit(1); }
  await mongoose.connect(uri);

  const guide = await GuideConfig.findOne({ slug: 'nouvel-arrivant' });
  if (!guide) { console.error('Guide non trouve'); process.exit(1); }

  let ajoutes = 0;
  let ignores = 0;

  for (const plan of NOUVEAUX_BONS_PLANS) {
    const existe = guide.bonsPlans.some((p) => p.id === plan.id);
    if (existe) {
      console.log('Deja present, ignore : ' + plan.id);
      ignores++;
    } else {
      guide.bonsPlans.push(plan);
      console.log('Ajoute : ' + plan.titre);
      ajoutes++;
    }
  }

  if (ajoutes > 0) {
    guide.markModified('bonsPlans');
    await guide.save();
    console.log('\nTermine. ' + ajoutes + ' plans ajoutes, ' + ignores + ' ignores. Total : ' + guide.bonsPlans.length + ' bons plans.');
  } else {
    console.log('\nAucun nouveau plan a ajouter (' + ignores + ' deja presents).');
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
