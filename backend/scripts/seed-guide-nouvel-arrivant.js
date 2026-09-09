#!/usr/bin/env node
/**
 * Seed : Guide nouvel arrivant
 * Usage : node backend/scripts/seed-guide-nouvel-arrivant.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const GuideConfig = require('../models/GuideConfig');

const guide = {
  slug: 'nouvel-arrivant',
  titre: 'Guide du nouvel arrivant en France',
  intro:
    "Vous venez d'arriver en France ? Ce guide vous accompagne etape par etape dans vos demarches administratives essentielles. Suivez les etapes dans l'ordre pour eviter les oublis et les delais.",
  steps: [
    {
      order: 1,
      titre: 'Obtenir votre titre de sejour',
      description:
        "Rendez-vous en prefecture ou sous-prefecture avec votre visa de long sejour pour obtenir votre titre de sejour (carte de resident, carte de sejour temporaire, etc.). Deposez votre demande dans les 3 mois suivant votre arrivee.",
      deadline: 'Dans les 3 mois apres l\'arrivee',
      cost: 'Timbre OFII + droit de timbre (selon titre)',
      links: [
        { label: 'Service-public.fr - Titre de sejour', url: 'https://www.service-public.fr/particuliers/vosdroits/N110' },
        { label: 'OFII - validation visa', url: 'https://www.ofii.fr/vos-demarches/entree-en-france/valider-votre-visa/' },
      ],
      warningNote:
        "Sans validation OFII dans les 3 mois, votre visa perd sa validite. Ada Papers peut vous aider a preparer votre dossier.",
    },
    {
      order: 2,
      titre: 'Ouvrir un compte bancaire',
      description:
        "Ouvrir un compte bancaire est indispensable pour percevoir un salaire, payer un loyer et realiser vos demarches en France. Plusieurs banques proposent des offres adaptees aux nouveaux arrivants.",
      special: 'banque',
      banqueOptions: [
        {
          nom: 'BNP Paribas',
          type: 'formulaire',
        },
        {
          nom: 'Societe Generale',
          type: 'lien',
          url: 'https://particuliers.societegenerale.fr/ouvrir-compte/',
          label: 'Ouvrir via parrainage',
        },
        {
          nom: 'La Poste (La Banque Postale)',
          type: 'lien',
          url: 'https://www.labanquepostale.fr/particuliers/comptes/ouvrir-un-compte.html',
          label: 'Ouvrir un compte',
        },
      ],
      promoNote:
        "Ada Papers est partenaire BNP Paribas : en passant par notre formulaire, vous beneficiez d'un accompagnement privilegie pour l'ouverture de votre compte.",
    },
    {
      order: 3,
      titre: 'Trouver un logement',
      description:
        "Recherchez un logement via des agences, des plateformes en ligne (PAP, SeLoger, Leboncoin) ou des residences etudiantes (CROUS pour les etudiants). Preparez un dossier solide : piece d'identite, justificatif de ressources, assurance habitation.",
      links: [
        { label: 'CROUS - Logement etudiant', url: 'https://www.crous-paris.fr/logements/' },
        { label: 'PAP - Annonces', url: 'https://www.pap.fr' },
        { label: 'Action Logement', url: 'https://www.actionlogement.fr' },
      ],
      warningNote:
        "Si vous n'avez pas de garant en France, la garantie Visale (gratuite) peut remplacer le depot de garantie.",
    },
    {
      order: 4,
      titre: "S'inscrire a la Securite sociale",
      description:
        "Inscrivez-vous aupres de l'Assurance Maladie (CPAM) pour beneficier de la couverture sante. Si vous etes salarie, votre employeur s'en charge. Sinon, faites la demarche en ligne sur ameli.fr.",
      deadline: 'Des votre arrivee',
      cost: 'Gratuit',
      links: [
        { label: 'Ameli.fr - S\'inscrire', url: 'https://www.ameli.fr/assure/droits-demarches/situations-particulieres/etrangers' },
      ],
    },
    {
      order: 5,
      titre: 'Inscription sur les listes electorales (facultatif)',
      description:
        "Les ressortissants de l'Union europeenne peuvent s'inscrire sur les listes electorales pour voter aux elections municipales et europeennes. Pour les autres nationalites, ce droit n'est pas disponible en France.",
      links: [
        { label: 'Service-public.fr - Inscription electorale', url: 'https://www.service-public.fr/particuliers/vosdroits/R13567' },
      ],
    },
    {
      order: 6,
      titre: 'Apprendre le francais (si besoin)',
      description:
        "La maitrise du francais facilite vos demarches, votre integration professionnelle et votre vie quotidienne. L'OFII propose des cours gratuits (Contrat d'Integration Republicaine). Des associations locales proposent aussi des cours.",
      links: [
        { label: 'OFII - Formation linguistique', url: 'https://www.ofii.fr/vos-demarches/entree-en-france/le-contrat-d-integration-republicaine-cir/' },
        { label: 'Alliance Francaise', url: 'https://www.alliancefr.org' },
      ],
    },
    {
      order: 7,
      titre: 'Preparer le renouvellement de votre titre',
      description:
        "Anticipez le renouvellement de votre titre de sejour : deposez votre dossier 2 a 3 mois avant l'expiration. Ada Papers peut vous accompagner dans la constitution de votre dossier pour eviter les erreurs et les refus.",
      deadline: '2 a 3 mois avant expiration du titre',
      links: [
        { label: 'Ada Papers - Deposer mon dossier', url: '/depot-dossier' },
      ],
      promoNote:
        "Confiez votre renouvellement a Ada Papers : nos experts en droit des etrangers vous accompagnent de la constitution du dossier jusqu'a la decision de la prefecture.",
    },
  ],
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI manquant dans .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connecte a MongoDB');

  const result = await GuideConfig.findOneAndUpdate(
    { slug: guide.slug },
    guide,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log(`Guide "${result.titre}" upserte (id: ${result._id})`);
  await mongoose.disconnect();
  console.log('Deconnecte. Seed termine.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
