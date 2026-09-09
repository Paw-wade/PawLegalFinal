'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const GuideConfig = require('../models/GuideConfig');

const BONS_PLANS = [
  {
    id: 'resto-u-crous',
    titre: 'Resto U CROUS',
    categorie: 'alimentation',
    description: "Les restaurants universitaires (Resto U) proposés par le CROUS servent des repas complets (entrée + plat + dessert) à tarif très réduit. Le repas est à 3,30 euros pour tous les étudiants inscrits, et à 1 euro pour les boursiers sur critères sociaux et les étudiants en situation de grande précarité (dispositif \"repas à 1 euro\"). Il suffit de présenter sa carte étudiante ou de payer via l'application [Izly](https://www.izly.fr). Les Resto U sont présents dans toutes les villes universitaires. Vérifiez la liste des restaurants et les horaires sur le site du CROUS de votre ville.",
    lien: 'https://www.crous-lille.fr/restauration/',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'too-good-to-go',
    titre: 'Too Good To Go',
    categorie: 'alimentation',
    description: "Application mobile anti-gaspillage qui permet d'acheter les invendus alimentaires de restaurants, boulangeries, supermarchés et cafés à prix réduit. Les paniers coûtent en général entre 2 et 6 euros pour un contenu valant 2 à 3 fois plus. Aucune condition de statut ou de revenus. Télécharger l'application, sélectionner une offre disponible près de chez vous et récupérer le panier dans le créneau indiqué par le commerçant. Les offres varient chaque jour et chaque établissement compose librement son panier.",
    lien: 'https://www.toogoodtogo.com/fr',
    portee_geographique: 'national (grandes et moyennes villes)',
    date_verification: '2026-09',
  },
  {
    id: 'epiceries-solidaires',
    titre: 'Épiceries solidaires et banques alimentaires',
    categorie: 'alimentation',
    description: "Les épiceries solidaires (Croix-Rouge, Secours populaire, Épiceries du coeur...) proposent des produits alimentaires à prix très réduits (environ 10 à 20 % du prix normal) aux personnes en difficulté financière, sur critères de ressources. Les banques alimentaires distribuent gratuitement des denrées non périssables. Pour en bénéficier, se rapprocher du CCAS (Centre Communal d'Action Sociale) de votre mairie ou de l'assistante sociale de votre établissement, qui évaluent votre éligibilité et vous orientent vers le dispositif adapté. Aucun lien unique : les structures varient par ville.",
    lien: null,
    portee_geographique: 'national (gestion locale, renseignez-vous auprès de votre mairie ou CCAS)',
    date_verification: '2026-09',
  },
  {
    id: 'marche-local-fin-journee',
    titre: 'Marchés locaux en fin de journée',
    categorie: 'alimentation',
    description: "Dans tous les marchés de plein air (alimentaires), les marchands soldent leurs fruits, légumes, pain et parfois fromages dans la dernière demi-heure avant la fermeture, souvent à moitié prix ou moins. Aucune condition d'éligibilité. Il suffit de se présenter en fin de marché et de négocier directement avec les marchands. À Lille par exemple, le Marché de Wazemmes (dimanche matin) et le Marché Saint-Michel sont particulièrement bien garnis. Consultez les horaires des marchés de votre ville sur le site de la mairie.",
    lien: null,
    portee_geographique: 'national (tous les marchés de plein air)',
    date_verification: '2026-09',
  },
  {
    id: 'supermarches-discount',
    titre: 'Supermarchés discount (Lidl, Aldi, Action)',
    categorie: 'alimentation',
    description: "Les enseignes discount comme Lidl et Aldi proposent des prix de 20 à 40 % inférieurs aux grandes surfaces classiques sur les produits courants (pâtes, riz, conserves, produits laitiers, surgelés). Action est complémentaire pour les produits d'hygiène, produits ménagers et articles de cuisine à prix très bas. Aucune condition. Ces enseignes sont présentes dans la quasi-totalité des villes françaises, y compris en périphérie des grandes métropoles. L'application Lidl Plus permet d'accéder à des promotions supplémentaires.",
    lien: 'https://www.lidl.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'vinted',
    titre: 'Vinted',
    categorie: 'habillement',
    description: "Plateforme de vente et achat de vêtements, chaussures et accessoires de seconde main entre particuliers. Les prix sont librement fixés par les vendeurs et souvent très inférieurs aux prix neufs (réduction de 50 à 90 % selon les articles). Aucune condition de statut ou de revenus. Il suffit de créer un compte gratuit sur l'application ou le site, et de rechercher les articles souhaités. Les frais de protection acheteur (environ 5 % + 0,70 euro par achat) sont à la charge de l'acheteur. Les vendeurs ne paient pas de commission.",
    lien: 'https://www.vinted.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'emmaus',
    titre: 'Emmaüs et friperies solidaires',
    categorie: 'habillement',
    description: "Les boutiques Emmaüs vendent des vêtements, chaussures et accessoires de seconde main à des prix très bas (généralement de 1 à 5 euros la pièce). D'autres friperies solidaires comme Le Relais, la Croix-Rouge ou les boutiques du Secours populaire proposent des tarifs similaires. Aucune condition de statut ou de revenus pour acheter. Pour les personnes en situation de grande précarité, certaines structures proposent des vêtements gratuitement sur présentation d'un justificatif de ressources. Localisez la boutique Emmaüs la plus proche sur le site national.",
    lien: 'https://emmaus-france.org/nos-communautes/trouver-un-emmaus/',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'mistigriff',
    titre: 'Mistigriff',
    categorie: 'habillement',
    description: "Mistigriff est un réseau de boutiques de vêtements de seconde main géré par Le Relais, une entreprise de l'économie solidaire. Les vêtements, chaussures et accessoires sont vendus à des prix très bas, parfois au kilo ou à la pièce à partir de quelques euros. Aucune condition de statut ou de revenus. Il suffit de se rendre en boutique muni de son sac pour faire ses achats. Mistigriff est particulièrement bien représenté dans le nord de la France, notamment dans la région lilloise. Consultez le site pour trouver la boutique la plus proche de chez vous.",
    lien: 'https://www.mistigriff.fr',
    portee_geographique: 'national (forte présence dans le nord de la France)',
    date_verification: '2026-09',
  },
  {
    id: 'vide-greniers',
    titre: 'Vide-greniers et brocantes',
    categorie: 'habillement',
    description: "Les vide-greniers et brocantes sont des événements réguliers (weekends, jours fériés) où des particuliers vendent leurs affaires personnelles à prix libres, souvent très négociables. Les vêtements s'y trouvent entre 0,50 et 5 euros la pièce. Aucune condition. À Lille, le Vide-greniers de la Braderie (chaque année en septembre) est l'un des plus grands d'Europe. Pour trouver les vide-greniers près de chez vous, consultez les agendas locaux ou des sites comme [vide-greniers.org](https://www.vide-greniers.org).",
    lien: 'https://www.vide-greniers.org',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'free-mobile',
    titre: 'Free Mobile - Forfait à 2 euros',
    categorie: 'telephonie',
    description: "Free Mobile propose un forfait sans engagement à 2 euros par mois incluant les appels et SMS illimités en France et 50 Mo de data mobile. Ce forfait est exclusivement réservé aux abonnés Freebox (box internet Free). Pour les autres, le forfait 5G avec data illimitée est disponible à un tarif compétitif (vérifier le prix actuel sur le site, les offres évoluent fréquemment). Aucune condition de statut étudiant. La souscription se fait entièrement en ligne. Un RIB français et une pièce d'identité sont nécessaires.",
    lien: 'https://mobile.free.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'la-poste-mobile-css',
    titre: 'La Poste Mobile - Tarif social CSS',
    categorie: 'telephonie',
    description: "La Poste Mobile propose un forfait à tarif réduit pour les bénéficiaires de la Complémentaire Santé Solidaire (CSS). Le montant exact du forfait est à vérifier directement auprès de La Poste Mobile, les conditions pouvant évoluer. Ce forfait est également accessible aux bénéficiaires du RSA et de l'AAH. Pour en bénéficier, il faut présenter votre attestation CSS en cours de validité lors de la souscription en bureau de poste ou par courrier. Une pièce d'identité et un RIB sont également demandés.",
    lien: 'https://www.lapostemobile.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'operateurs-low-cost',
    titre: 'Opérateurs low-cost (Sosh, RED, B&You, Prixtel)',
    categorie: 'telephonie',
    description: "Les marques low-cost des grands opérateurs proposent des forfaits sans engagement avec data généreux à des prix bien inférieurs aux offres classiques. Sosh (Orange), RED by SFR, B&You (Bouygues) et Prixtel proposent régulièrement des forfaits entre 5 et 15 euros par mois pour 30 à 100 Go de data en France. Aucune condition de statut. Comparez les offres du moment sur des comparateurs comme [ARCEP](https://www.arcep.fr) ou des sites spécialisés. Les promotions changent très souvent, notamment en début d'année et à la rentrée.",
    lien: 'https://www.sosh.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'pass-culture',
    titre: 'Pass Culture',
    categorie: 'culture',
    description: "Dispositif gouvernemental offrant un crédit culturel aux jeunes résidant en France. À 18 ans, un crédit de 300 euros est attribué automatiquement et utilisable pendant 2 ans pour des offres culturelles : livres, places de cinéma, concerts, musées, cours de musique, abonnements streaming, etc. De 15 à 17 ans et de 19 à 20 ans, un crédit de 30 euros par an est disponible (montants indicatifs 2025, vérifier les actualisations). Accessible via l'application Pass Culture sur présentation de la carte nationale d'identité. Les étrangers résidant légalement en France y ont accès.",
    lien: 'https://pass.culture.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'musees-gratuits-moins-26-ans',
    titre: 'Musées nationaux gratuits pour les moins de 26 ans',
    categorie: 'culture',
    description: "L'entrée dans les musées et monuments nationaux (Louvre, Musée d'Orsay, Versailles, Centre Pompidou...) est gratuite pour les ressortissants de l'Union européenne âgés de moins de 26 ans. Pour les jeunes hors UE de moins de 26 ans, un tarif réduit (en général autour de 4 à 6 euros) s'applique dans la plupart des établissements. Il suffit de présenter une pièce d'identité et son justificatif de domicile ou titre de séjour. Beaucoup de musées municipaux sont quant à eux entièrement gratuits pour tous, y compris à Lille (Palais des Beaux-Arts, LaM...).",
    lien: 'https://www.museesdufrance.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'bibliotheques-municipales',
    titre: 'Bibliothèques municipales',
    categorie: 'culture',
    description: "Les bibliothèques municipales sont gratuites ou quasi-gratuites dans la grande majorité des villes françaises. Elles donnent accès non seulement aux livres, mais aussi aux journaux et magazines, aux ressources numériques (films, musique, e-books, formations en ligne), et dans certaines villes à des espaces de travail silencieux. L'inscription nécessite un justificatif de domicile et une pièce d'identité. À Lille, le réseau des médiathèques municipales est entièrement gratuit pour tous les habitants de la métropole. Vérifiez les conditions d'inscription sur le site de votre ville.",
    lien: null,
    portee_geographique: 'national (gestion locale, gratuit dans la plupart des villes)',
    date_verification: '2026-09',
  },
  {
    id: 'carte-avantage-jeune-sncf',
    titre: 'Carte Avantage Jeune SNCF',
    categorie: 'transport',
    description: "La carte Avantage Jeune SNCF est destinée aux voyageurs âgés de 12 à 27 ans. Elle offre jusqu'à -60 % sur les billets TGV et Intercités en France, avec une réduction garantie d'au moins 30 % même en période de forte demande. Elle coûte 49 euros par an (vérifier le tarif actuel sur le site SNCF). La souscription se fait en ligne ou en gare, sur présentation d'une pièce d'identité. Une bonne option si vous prévoyez de voyager régulièrement entre villes pendant vos études.",
    lien: 'https://www.sncf-connect.com/carte-avantage-jeune',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'blablacar',
    titre: 'BlaBlaCar (covoiturage)',
    categorie: 'transport',
    description: "Plateforme de covoiturage entre particuliers pour les trajets interurbains. Les tarifs sont fixés par les conducteurs et sont en général 2 à 3 fois moins chers que le train (comptez 10 à 25 euros pour un Paris-Lille contre 40 à 80 euros en TGV). Aucune condition de statut. L'inscription est gratuite sur l'application ou le site. BlaBlaCar prélève une commission sur chaque réservation (environ 10 %). Une bonne alternative au train pour les trajets longue distance le week-end ou pendant les vacances.",
    lien: 'https://www.blablacar.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
];

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MASTER_MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI manquant'); process.exit(1); }
  await mongoose.connect(uri);

  const guide = await GuideConfig.findOne({ slug: 'nouvel-arrivant' });
  if (!guide) { console.error('Guide non trouve'); process.exit(1); }

  guide.bonsPlans = BONS_PLANS;
  guide.markModified('bonsPlans');
  await guide.save();
  console.log('Accents corriges sur les bons plans. Total : ' + guide.bonsPlans.length + ' elements.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
