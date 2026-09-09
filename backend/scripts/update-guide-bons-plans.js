'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const GuideConfig = require('../models/GuideConfig');

const BONS_PLANS = [
  // ALIMENTATION
  {
    id: 'resto-u-crous',
    titre: 'Resto U CROUS',
    categorie: 'alimentation',
    description: 'Les restaurants universitaires (Resto U) proposes par le CROUS servent des repas complets (entree + plat + dessert) a tarif tres reduit. Le repas est a 3,30 euros pour tous les etudiants inscrits, et a 1 euro pour les boursiers sur criteres sociaux et les etudiants en situation de grande precarite (dispositif "repas a 1 euro"). Il suffit de presenter sa carte etudiante ou de payer via l\'application [Izly](https://www.izly.fr). Les Resto U sont presents dans toutes les villes universitaires. Verifiez la liste des restaurants et les horaires sur le site du CROUS de votre ville.',
    lien: 'https://www.crous-lille.fr/restauration/',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'too-good-to-go',
    titre: 'Too Good To Go',
    categorie: 'alimentation',
    description: 'Application mobile anti-gaspi qui permet d\'acheter les invendus alimentaires de restaurants, boulangeries, supermarches et cafes a prix reduit. Les paniers coutent en general entre 2 et 6 euros pour un contenu valant 2 a 3 fois plus. Aucune condition de statut ou de revenus. Telecharger l\'application, selectionner une offre disponible pres de chez vous et recuperer le panier dans le creneau indique par le commercant. Les offres varient chaque jour et chaque etablissement compose librement son panier.',
    lien: 'https://www.toogoodtogo.com/fr',
    portee_geographique: 'national (grandes et moyennes villes)',
    date_verification: '2026-09',
  },
  {
    id: 'epiceries-solidaires',
    titre: 'Epiceries solidaires et banques alimentaires',
    categorie: 'alimentation',
    description: 'Les epiceries solidaires (Croix-Rouge, Secours populaire, Epiceries du coeur...) proposent des produits alimentaires a prix tres reduits (environ 10 a 20 % du prix normal) aux personnes en difficulte financiere, sur criteres de ressources. Les banques alimentaires distribuent gratuitement des denrees non perissables. Pour en beneficier, se rapprocher du CCAS (Centre Communal d\'Action Sociale) de votre mairie ou de l\'assistante sociale de votre etablissement, qui evaluent votre eligibilite et vous orientent vers le dispositif adapte. Aucun lien unique : les structures varient par ville.',
    lien: null,
    portee_geographique: 'national (gestion locale, renseignez-vous aupres de votre mairie ou CCAS)',
    date_verification: '2026-09',
  },
  {
    id: 'marche-local-fin-journee',
    titre: 'Marches locaux en fin de journee',
    categorie: 'alimentation',
    description: 'Dans tous les marches de plein air (alimentaires), les marchands soldent leurs fruits, legumes, pain et parfois fromages dans la derniere demi-heure avant la fermeture, souvent a moitie prix ou moins. Aucune condition d\'eligibilite. Il suffit de se presenter en fin de marche et de negocier directement avec les marchands. A Lille par exemple, le Marche de Wazemmes (dimanche matin) et le Marche Saint-Michel sont particulierement bien garnis. Consultez les horaires des marches de votre ville sur le site de la mairie.',
    lien: null,
    portee_geographique: 'national (tous les marches de plein air)',
    date_verification: '2026-09',
  },
  {
    id: 'supermarches-discount',
    titre: 'Supermarches discount (Lidl, Aldi, Action)',
    categorie: 'alimentation',
    description: 'Les enseignes discount comme Lidl et Aldi proposent des prix de 20 a 40 % inferieurs aux grandes surfaces classiques sur les produits courants (pates, riz, conserves, produits laitiers, surgeles). Action est complementaire pour les produits d\'hygiene, produits menagers et articles de cuisine a prix tres bas. Aucune condition. Ces enseignes sont presentes dans la quasi-totalite des villes francaises, y compris en peripherie des grandes metropoles. L\'application Lidl Plus permet d\'acceder a des promotions supplementaires.',
    lien: 'https://www.lidl.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },

  // HABILLEMENT
  {
    id: 'vinted',
    titre: 'Vinted',
    categorie: 'habillement',
    description: 'Plateforme de vente et achat de vetements, chaussures et accessoires de seconde main entre particuliers. Les prix sont librement fixes par les vendeurs et souvent tres inferieurs aux prix neufs (reduction de 50 a 90 % selon les articles). Aucune condition de statut ou de revenus. Il suffit de creer un compte gratuit sur l\'application ou le site, et de rechercher les articles souhaites. Les frais de protection acheteur (environ 5 % + 0,70 euro par achat) sont a la charge de l\'acheteur. Les vendeurs ne paient pas de commission.',
    lien: 'https://www.vinted.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'emmaus',
    titre: 'Emmaus et friperies solidaires',
    categorie: 'habillement',
    description: 'Les boutiques Emmaus vendent des vetements, chaussures et accessoires de seconde main a des prix tres bas (generalement de 1 a 5 euros la piece). D\'autres friperies solidaires comme Le Relais, la Croix-Rouge ou les boutiques du Secours populaire proposent des tarifs similaires. Aucune condition de statut ou de revenus pour acheter. Pour les personnes en situation de grande precarite, certaines structures proposent des vetements gratuitement sur presentation d\'un justificatif de ressources. Localisez la boutique Emmaus la plus proche sur le site national.',
    lien: 'https://emmaus-france.org/nos-communautes/trouver-un-emmaus/',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'vide-greniers',
    titre: 'Vide-greniers et brocantes',
    categorie: 'habillement',
    description: 'Les vide-greniers et brocantes sont des evenements reguliers (weekends, jours feries) ou des particuliers vendent leurs affaires personnelles a prix libres, souvent tres negociables. Les vetements s\'y trouvent entre 0,50 et 5 euros la piece. Aucune condition. A Lille, le Vide-greniers de la Braderie (chaque annee en septembre) est l\'un des plus grands d\'Europe. Pour trouver les vide-greniers pres de chez vous, consultez les agendas locaux ou des sites comme [vide-greniers.org](https://www.vide-greniers.org).',
    lien: 'https://www.vide-greniers.org',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },

  // TELEPHONIE
  {
    id: 'free-mobile',
    titre: 'Free Mobile - Forfait a 2 euros',
    categorie: 'telephonie',
    description: 'Free Mobile propose un forfait sans engagement a 2 euros par mois incluant les appels et SMS illimites en France et 50 Mo de data mobile. Ce forfait est exclusivement reserve aux abonnes Freebox (box internet Free). Pour les autres, le forfait 5G avec data illimitee est disponible a un tarif competitif (verifier le prix actuel sur le site, les offres evoluent frequemment). Aucune condition de statut etudiant. La souscription se fait entierement en ligne. Un RIB francais et une piece d\'identite sont necessaires.',
    lien: 'https://mobile.free.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'la-poste-mobile-css',
    titre: 'La Poste Mobile - Tarif social CSS',
    categorie: 'telephonie',
    description: 'La Poste Mobile propose un forfait a tarif reduit pour les beneficiaires de la Complementaire Sante Solidaire (CSS). Le montant exact du forfait est a verifier directement aupres de La Poste Mobile, les conditions pouvant evoluer. Ce forfait est egalement accessible aux beneficiaires du RSA et de l\'AAH. Pour en beneficier, il faut presenter votre attestation CSS en cours de validite lors de la souscription en bureau de poste ou par courrier. Une piece d\'identite et un RIB sont egalement demandes.',
    lien: 'https://www.lapostemobile.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'operateurs-low-cost',
    titre: 'Operateurs low-cost (Sosh, RED, B&You, Prixtel)',
    categorie: 'telephonie',
    description: 'Les marques low-cost des grands operateurs proposent des forfaits sans engagement avec data genereux a des prix bien inferieurs aux offres classiques. Sosh (Orange), RED by SFR, B&You (Bouygues) et Prixtel proposent regulierement des forfaits entre 5 et 15 euros par mois pour 30 a 100 Go de data en France. Aucune condition de statut. Comparez les offres du moment sur des comparateurs comme [ARCEP](https://www.arcep.fr) ou des sites specialises. Les promotions changent tres souvent, notamment en debut d\'annee et a la rentree.',
    lien: 'https://www.sosh.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },

  // CULTURE & LOISIRS
  {
    id: 'pass-culture',
    titre: 'Pass Culture',
    categorie: 'culture',
    description: 'Dispositif gouvernemental offrant un credit culturel aux jeunes residant en France. A 18 ans, un credit de 300 euros est attribue automatiquement et utilisable pendant 2 ans pour des offres culturelles : livres, places de cinema, concerts, musees, cours de musique, abonnements streaming, etc. De 15 a 17 ans et de 19 a 20 ans, un credit de 30 euros par an est disponible (montants indicatifs 2025, verifier les actualisations). Accessible via l\'application Pass Culture sur presentation de la carte nationale d\'identite. Les etrangers residant legalement en France y ont acces.',
    lien: 'https://pass.culture.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'musees-gratuits-moins-26-ans',
    titre: 'Musees nationaux gratuits pour les moins de 26 ans',
    categorie: 'culture',
    description: 'L\'entree dans les musees et monuments nationaux (Louvre, Musee d\'Orsay, Versailles, Centre Pompidou...) est gratuite pour les ressortissants de l\'Union europeenne ages de moins de 26 ans. Pour les jeunes hors UE de moins de 26 ans, un tarif reduit (en general autour de 4 a 6 euros) s\'applique dans la plupart des etablissements. Il suffit de presenter une piece d\'identite et son justificatif de domicile ou titre de sejour. Beaucoup de musees municipaux sont quant a eux entierement gratuits pour tous, y compris a Lille (Palais des Beaux-Arts, LaM...).',
    lien: 'https://www.museesdufrance.fr',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'bibliotheques-municipales',
    titre: 'Bibliotheques municipales',
    categorie: 'culture',
    description: 'Les bibliotheques municipales sont gratuites ou quasi-gratuites dans la grande majorite des villes francaises. Elles donnent acces non seulement aux livres, mais aussi aux journaux et magazines, aux ressources numeriques (films, musique, e-books, formations en ligne), et dans certaines villes a des espaces de travail silencieux. L\'inscription necessite un justificatif de domicile et une piece d\'identite. A Lille, le reseau des mediatheques municipales est entierement gratuit pour tous les habitants de la metropole. Verifiez les conditions d\'inscription sur le site de votre ville.',
    lien: null,
    portee_geographique: 'national (gestion locale, gratuit dans la plupart des villes)',
    date_verification: '2026-09',
  },

  // TRANSPORT COMPLEMENTAIRE
  {
    id: 'carte-avantage-jeune-sncf',
    titre: 'Carte Avantage Jeune SNCF',
    categorie: 'transport',
    description: 'La carte Avantage Jeune SNCF est destinee aux voyageurs ages de 12 a 27 ans. Elle offre jusqu\'a -60 % sur les billets TGV et Intercites en France, avec une reduction garantie d\'au moins 30 % meme en periode de forte demande. Elle coute 49 euros par an (verifier le tarif actuel sur le site SNCF). La souscription se fait en ligne ou en gare, sur presentation d\'une piece d\'identite. Une bonne option si vous prevoyez de voyager regulierement entre villes pendant vos etudes.',
    lien: 'https://www.sncf-connect.com/carte-avantage-jeune',
    portee_geographique: 'national',
    date_verification: '2026-09',
  },
  {
    id: 'blablacar',
    titre: 'BlaBlaCar (covoiturage)',
    categorie: 'transport',
    description: 'Plateforme de covoiturage entre particuliers pour les trajets interurbains. Les tarifs sont fixes par les conducteurs et sont en general 2 a 3 fois moins chers que le train (comptez 10 a 25 euros pour un Paris-Lille contre 40 a 80 euros en TGV). Aucune condition de statut. L\'inscription est gratuite sur l\'application ou le site. BlaBlaCar preleve une commission sur chaque reservation (environ 10 %). Une bonne alternative au train pour les trajets longue distance le week-end ou pendant les vacances.',
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
  console.log('Bons plans ajoutes : ' + guide.bonsPlans.length + ' elements.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
