'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const GuideConfig = require('../models/GuideConfig');

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MASTER_MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI manquant'); process.exit(1); }
  await mongoose.connect(uri);

  const guide = await GuideConfig.findOne({ slug: 'nouvel-arrivant' });
  if (!guide) { console.error('Guide non trouve'); process.exit(1); }

  const stepBanque = guide.steps.find(s => s.special === 'banque');
  const banqueOptions = stepBanque ? (stepBanque.banqueOptions || []) : [];

  guide.steps = [
    {
      order: 1,
      titre: "Valider le visa VLS-TS",
      description: `Si vous êtes arrivé avec un Visa de Long Séjour valant Titre de Séjour (VLS-TS, mention "VLSTS" sur la vignette), vous devez le valider en ligne pour qu'il ait la valeur d'un titre de séjour.

La validation se fait sur [l'ANEF (Administration des Étrangers en France)](https://administration-etrangers-en-france.interieur.gouv.fr/particuliers/#/) :
1. Créer un compte ANEF avec votre adresse e-mail ou FranceConnect
2. Saisir le numéro de visa, les dates de validité et la date d'entrée en France
3. Indiquer votre adresse de résidence en France
4. Payer la taxe de validation en ligne (carte bancaire ou timbre électronique)

Après validation, le VLS-TS tient lieu de titre de séjour pendant toute sa durée. Vous recevrez un récépissé numérique à conserver.

Si votre visa porte la mention "D" (long séjour classique, sans la mention VLS-TS), vous devez faire une demande de titre de séjour étudiant sur [l'ANEF](https://administration-etrangers-en-france.interieur.gouv.fr/particuliers/#/) dans les 2 mois suivant votre arrivée. Préparez : passeport + visa valide, justificatif d'inscription dans l'établissement, justificatif de logement, justificatif de ressources financières et deux photos d'identité.`,
      deadline: "Dans les 3 mois suivant l'arrivée en France. Passé ce délai, vous êtes en situation irrégulière.",
      cost: "60 euros (taxe étudiant), payable en ligne par carte bancaire ou par timbre électronique acheté en bureau de tabac.",
      warningNote: "Exception : les mineurs titulaires d'un visa mention \"mineur scolarisé\" n'ont pas à valider leur visa. Ce visa ne vaut pas titre de séjour autonome et ne nécessite aucune démarche de validation sur l'ANEF.",
      promoNote: "",
      special: "",
      links: [],
      banqueOptions: [],
    },
    {
      order: 2,
      titre: "Chercher un logement et demander l'aide au logement",
      description: `Se loger est l'une des premières préoccupations à l'arrivée. Plusieurs options s'offrent à vous :

1. La résidence universitaire (CROUS) : option souvent la plus accessible financièrement. Les loyers y sont plus bas et vous pouvez y rencontrer d'autres étudiants. Les places sont limitées et l'attribution se fait selon des critères sociaux. Engagez la procédure via [messervices.etudiant.gouv.fr](https://www.messervices.etudiant.gouv.fr) avant même votre arrivée en France.

2. La colocation : permet de partager les frais. Avantageuse pour les revenus modestes. Attention : la cohabitation demande une entente sur les règles de vie commune. Privilégiez les personnes que vous connaissez ou ayant des centres d'intérêt similaires.

3. La location d'appartement : plus d'indépendance, mais loyers plus élevés et garanties exigées par les propriétaires. Documents généralement demandés pour le dossier locataire : pièce d'identité, justificatif de revenus (contrat de travail, attestation de bourse), justificatif de domicile actuel, garant ou [Garantie Visale](https://www.visale.fr).

Où chercher un logement :
- [Leboncoin](https://www.leboncoin.fr) : petites annonces de particuliers
- [SeLoger](https://www.seloger.com) : sélection large, critères de recherche avancés
- [PAP - Particulier à Particulier](https://www.pap.fr) : annonces directes sans frais d'agence
- Agences immobilières : des frais d'agence s'appliquent (généralement 1 mois de loyer)

Aides au logement disponibles :
- APL (Aide Personnalisée au Logement) : versée par la [CAF](https://www.caf.fr) si le logement est conventionné. Demande à faire dès le premier mois.
- ALS (Allocation de Logement Social) : pour les personnes ne pouvant pas bénéficier de l'APL. Également via la [CAF](https://www.caf.fr).
- [Garantie Visale](https://www.visale.fr) : caution locative gratuite fournie par Action Logement. À demander avant de commencer les visites.
- [Action Logement](https://www.actionlogement.fr) : aide spécifique aux salariés du secteur privé.`,
      deadline: "",
      cost: "",
      warningNote: "Depuis la loi de finances 2026, les étudiants hors UE/EEE/Suisse doivent être boursiers CROUS sur critères sociaux pour percevoir l'APL. Les non-boursiers non-UE en sont exclus depuis le 1er juillet 2026.",
      promoNote: "",
      special: "",
      links: [],
      banqueOptions: [],
    },
    {
      order: 3,
      titre: "Ouvrir un compte bancaire français",
      description: `Un RIB français est indispensable pour la CAF (APL), les remboursements de sécurité sociale, le paiement du loyer, des factures, et la plupart des démarches administratives. Il permet également d'éviter les frais de change associés aux transferts internationaux.

Comment ouvrir un compte bancaire :
1. Choisir une banque : comparez les offres des banques traditionnelles (BNP, Société Générale, Crédit Agricole...) et des banques en ligne (Boursobank, Hello Bank...). Les banques en ligne sont souvent plus accessibles pour les étudiants étrangers sans justificatif de revenus.
2. Prendre rendez-vous : en agence ou en ligne selon la banque.
3. Préparer les documents :
   - Pièce d'identité valide (carte nationale d'identité, passeport ou titre de séjour)
   - Justificatif de domicile (contrat de location, quittance, attestation d'hébergement)
   - Justificatif d'inscription dans l'établissement
4. Remplir le formulaire d'ouverture de compte.
5. Effectuer un premier dépôt (montant variable selon la banque).

Utilisez notre lien de parrainage ci-dessous pour bénéficier d'avantages à l'ouverture.`,
      deadline: "Dès que possible après l'arrivée.",
      cost: "",
      warningNote: "",
      promoNote: "",
      special: "banque",
      links: [],
      banqueOptions: banqueOptions,
    },
    {
      order: 4,
      titre: "Souscrire un abonnement transport",
      description: `Un abonnement de transport en commun est indispensable pour se déplacer au quotidien. Chaque ville dispose de son propre réseau et de ses propres tarifs : renseignez-vous auprès de l'opérateur local dès votre arrivée.

Exemple à Lille (ville d'Ada Papers) :
Le réseau [Ilévia](https://www.ilevia.fr) dessert la métropole lilloise (métro, tramway, bus). Les abonnements sont disponibles à la semaine, au mois ou à l'année. Plusieurs tarifs réduits existent selon votre situation.
Télécharger l'application Ilévia pour acheter vos titres, consulter les horaires et planifier vos trajets en temps réel : [App Store (iPhone)](https://apps.apple.com/fr/app/ilevia/id1441163587) ou [Google Play (Android)](https://play.google.com/store/apps/details?id=fr.ilevia.app).

En Île-de-France :
- Pass Navigo Mensuel ou Annuel : zones 1 à 5, valable sur métro, RER, bus, tramway. S'achète en ligne sur [iledefrance-mobilites.fr](https://www.iledefrance-mobilites.fr) ou dans les agences RATP.
- [Imagine'R](https://www.imaginer.fr) : abonnement annuel à tarif très réduit pour les moins de 26 ans scolarisés en Île-de-France. À demander dès la rentrée universitaire.

Principaux réseaux dans les grandes villes :
TCL à Lyon, TBM à Bordeaux, Tiseo à Toulouse, STAR à Rennes, Ilévia à Lille, Astuce à Rouen, Tan à Nantes, RTM à Marseille. Recherchez le réseau de votre ville pour connaître les tarifs et les modalités d'inscription.

Catégories de tarifs réduits et exonérations :
La plupart des réseaux proposent des réductions selon plusieurs critères cumulables. Renseignez-vous auprès de votre opérateur local, les conditions varient d'une ville à l'autre.

- Jeunes et étudiants : tarif réduit en général jusqu'à 26 ans sur présentation d'un justificatif d'inscription. Certains réseaux proposent des abonnements annuels fortement subventionnés pour les étudiants.
- Mineurs : gratuité ou tarif très réduit dans de nombreuses métropoles pour les moins de 18 ans (parfois moins de 12 ou 14 ans selon le réseau), sur présentation d'un justificatif d'âge.
- Bénéficiaires CAF : les titulaires de la CSS (Complémentaire Santé Solidaire) ou d'aides de la CAF (APL, RSA, AAH) bénéficient souvent d'une réduction ou d'une gratuité sur le réseau local. Un justificatif CAF à jour est demandé.
- Avis d'imposition : un avis d'imposition indiquant un revenu fiscal de référence faible (ou nul pour les étudiants sans revenus) peut ouvrir droit à des tarifs sociaux. Le seuil varie selon le réseau.
- Demandeurs d'emploi : tarif réduit ou gratuité possible sur présentation d'une attestation France Travail.
- Personnes en situation de handicap : gratuité ou tarif réduit sur présentation de la carte d'invalidité ou de la RQTH.
- Seniors : certains réseaux proposent une réduction à partir de 60 ou 65 ans.

Sanctions en cas de fraude et astuce Ilévia (Lille) :
Voyager sans titre de transport valable expose à une amende (procès-verbal). Sur le réseau Ilévia, le montant de base est de 50 euros, majoré si non régularisé dans les délais indiqués sur le PV.

Astuce importante si vous êtes contrôlé sans titre sur Ilévia : ne payez jamais l'amende sur place. Prenez le PV, puis rendez-vous dans une agence Ilévia et souscrivez deux abonnements consécutifs. Une fois ces deux abonnements validés et présentés en agence, la demande de paiement de l'amende est annulée. Cette procédure est propre au réseau Ilévia et ne s'applique pas nécessairement aux autres réseaux de transport.

Bons réflexes pour tous les réseaux :
- Privilégiez l'abonnement annuel plutôt que mensuel : il est toujours moins cher et souvent fractionnable en paiement.
- Conservez toujours votre titre de transport valide lors de vos déplacements.
- Renseignez-vous en agence ou sur le site de votre réseau pour connaître précisément les justificatifs à fournir : les conditions évoluent chaque année.`,
      deadline: "Dès les premiers jours après l'arrivée.",
      cost: "Variable selon la ville et le type d'abonnement. En IDF : Navigo mensuel zones 1-5 à 86,40 euros/mois. Imagine'R annuel : environ 350 euros/an.",
      warningNote: "",
      promoNote: "",
      special: "",
      links: [],
      banqueOptions: [],
    },
    {
      order: 5,
      titre: "Vigilance contre les fraudes et arnaques",
      description: `En tant que nouvel arrivant, vous pouvez être ciblé par des personnes malveillantes. Voici les arnaques les plus courantes et comment les éviter.

Arnaques courantes :
- Arnaques à la location : annonces immobilières fictives avec demande de versement anticipatif. Ne versez jamais de loyer ou de caution avant d'avoir visité le logement et signé un contrat.
- Faux sites administratifs : des sites imitent les portails officiels (ANEF, CAF, AMELI) pour collecter vos données personnelles ou vous facturer des services gratuits. Vérifiez toujours que l'URL se termine par .gouv.fr.
- Phishing (hameçonnage) : e-mails ou SMS imitant des organismes officiels (CPAM, CAF, banque) demandant vos identifiants ou coordonnées bancaires. Aucun organisme officiel ne vous demande votre mot de passe par e-mail.
- Faux conseillers ou fausses agences d'admission : des personnes proposent des services payants pour des démarches gratuites (demande de visa, CVEC, sécurité sociale).
- Arnaques à l'emploi : offres de jobs trop alléchantes, demande de versement préalable ou de coordonnées bancaires avant embauche.

Les bons réflexes :
- Ne communiquez jamais votre mot de passe, numéro de carte bancaire ou code secret.
- Utilisez uniquement les sites officiels (vérifiez le .gouv.fr ou le cadenas HTTPS).
- Ne cliquez pas sur des liens dans des e-mails non sollicités.
- En cas de doute, contactez directement l'organisme via son numéro officiel.
- Signalez toute arnaque sur [cybermalveillance.gouv.fr](https://www.cybermalveillance.gouv.fr).`,
      deadline: "",
      cost: "",
      warningNote: "Si vous pensez avoir été victime d'une fraude, contactez immédiatement votre banque pour bloquer votre carte et déposez une plainte en ligne ou au commissariat.",
      promoNote: "",
      special: "",
      links: [],
      banqueOptions: [],
    },
    {
      order: 6,
      titre: "Payer la CVEC (Contribution Vie Étudiante et de Campus)",
      description: "Créer un compte et régler la CVEC sur [cvec.etudiant.gouv.fr](https://cvec.etudiant.gouv.fr) avant l'inscription administrative dans l'établissement. Une attestation numérotée est délivrée immédiatement après paiement. Ce numéro sera demandé par l'université lors de l'inscription.",
      deadline: "Avant la rentrée / avant l'inscription administrative. Sans cette attestation, l'inscription est refusée.",
      cost: "105 euros par an (certains boursiers en sont exonérés).",
      warningNote: "",
      promoNote: "",
      special: "",
      links: [],
      banqueOptions: [],
    },
    {
      order: 7,
      titre: "Finaliser l'inscription administrative à l'établissement",
      description: `L'inscription administrative à l'établissement est l'étape qui officialise votre statut d'étudiant pour l'année en cours. Elle conditionne la délivrance de la carte étudiante, l'accès aux services universitaires et la validité de votre visa étudiant.

Documents généralement demandés :
- Attestation CVEC (numérotée, obtenue sur cvec.etudiant.gouv.fr)
- VLS-TS valide ou récépissé de titre de séjour
- Justificatif de domicile en France
- Relevés de notes et diplômes selon le niveau d'inscription
- Photo d'identité

Exonération des frais d'inscription :
Les droits d'inscription dans les universités publiques peuvent représenter plusieurs centaines d'euros. Des exonérations totales ou partielles existent selon votre situation. En général, les catégories suivantes peuvent en bénéficier : boursiers CROUS, étudiants en situation de handicap, pupilles de la nation, réfugiés ou bénéficiaires de la protection subsidiaire.

Exemple à l'Université de Lille :
L'Université de Lille propose un service dédié aux demandes d'exonération via son portail TEDI : [tedi.univ-lille.fr](https://tedi.univ-lille.fr/etudiant/menu.php).

Calendrier des demandes d'exonération 2026-2027 à Lille :
- Licence, BUT, DEUST, Licence Professionnelle, Cycle Ingénieur, Master : jusqu'au 31 octobre 2026
- Doctorat : jusqu'au 16 janvier 2027

Pour tout renseignement sur les exonérations à l'Université de Lille : [info-exo@univ-lille.fr](mailto:info-exo@univ-lille.fr)

Dans les autres universités :
Chaque établissement fixe ses propres dates limites et modalités de demande. Quelques repères généraux :
- Renseignez-vous auprès du service de la scolarité ou des affaires étudiantes de votre établissement dès la pré-inscription.
- La demande d'exonération est distincte de l'inscription : elle s'effectue généralement via un formulaire en ligne ou en agence, avec justificatifs à l'appui (avis de bourse CROUS, avis d'imposition, notification de protection internationale...).
- Ne dépassez pas les dates limites : une demande hors délai est systématiquement rejetée.
- Si vous êtes boursier CROUS, l'exonération totale des droits d'inscription est automatique dans la plupart des universités publiques. Vérifiez auprès de votre établissement que le transfert d'information est bien effectif.`,
      deadline: "Selon le calendrier propre à chaque établissement.",
      cost: "",
      warningNote: "",
      promoNote: "",
      special: "",
      links: [],
      banqueOptions: [],
    },
    {
      order: 8,
      titre: "S'inscrire à la sécurité sociale étudiante",
      description: `Les étudiants hors UE/EEE/Suisse doivent s'affilier à l'Assurance Maladie française. Cette inscription est transitoire : elle permet d'obtenir un accès provisoire en attendant la validation complète du dossier, puis de créer un compte Ameli définitif.

L'inscription se fait en ligne (français, anglais, espagnol) après l'inscription dans l'établissement, sur [etudiant-etranger.ameli.fr](https://etudiant-etranger.ameli.fr). Pièces à préparer :
- Pièce d'identité ou VLS-TS valide
- Certificat de scolarité de l'année en cours
- RIB (relevé d'identité bancaire)
- Pièce d'état civil : copie intégrale de l'acte de naissance, extrait d'acte de naissance avec filiation, livret de famille ou acte de mariage

Après le dépôt, votre dossier est vérifié. Vous serez informé de l'avancée par mail et depuis votre espace personnel. Si une pièce est non conforme, vous serez avisé automatiquement par mail. Sans réponse, le dossier sera clos après 2 relances.

Votre attestation de droits provisoire, avec votre NIA (Numéro d'Identification d'Attente), sera disponible après validation des documents et à partir de la date de début de scolarité. Une fois votre dossier complet, votre NIA sera transformé en NIR définitif. Vous recevrez un imprimé de demande de carte vitale et pourrez créer votre [compte Ameli](https://www.ameli.fr).

Dès que votre compte Ameli est créé, déclarez un médecin traitant. Sans médecin traitant désigné, vos remboursements sont réduits (30 % au lieu de 70 % pour les consultations chez un spécialiste). La déclaration se fait depuis votre espace Ameli ou lors de votre première consultation (trouvez un médecin sur [Doctolib](https://www.doctolib.fr)).`,
      deadline: "Dès que possible après l'inscription dans l'établissement. Compter 8 à 12 semaines de traitement.",
      cost: "Gratuit.",
      warningNote: "Les étudiants UE/EEE/Suisse munis d'une Carte Européenne d'Assurance Maladie (CEAM) valide n'ont aucune démarche à faire ici.",
      promoNote: "",
      special: "",
      links: [],
      banqueOptions: [],
    },
    {
      order: 9,
      titre: "Souscrire une mutuelle complémentaire",
      description: `L'Assurance Maladie (sécurité sociale) rembourse en moyenne 70 % des soins courants. La mutuelle complémentaire prend en charge le reste (ticket modérateur, dépassements d'honoraires, optique, dentaire). Sans mutuelle, les frais non remboursés restent à votre charge.

Plusieurs options existent pour les étudiants :
- [LMDE](https://www.lmde.com), SMENO, Heyme, MEP : mutuelles dédiées aux étudiants, avec des tarifs adaptés
- Mutuelle de l'établissement : certaines universités négocient des contrats collectifs avantageux
- [Complémentaire Santé Solidaire (CSS)](https://www.complementaire-sante-solidaire.gouv.fr) : gratuite ou quasi-gratuite pour les boursiers et étudiants aux revenus modestes

La CSS se souscrit directement depuis votre espace AMELI une fois votre compte créé. Elle prend en charge les dépenses non couvertes par la sécurité sociale et peut être gratuite ou payante selon vos revenus.

La souscription est possible dès l'obtention du numéro de sécurité sociale provisoire (NIA). La mutuelle peut être exigée par certaines écoles ou pour l'obtention d'un logement CROUS.`,
      deadline: "Dès l'obtention du NIA (Numéro d'Identification d'Attente). Ne pas attendre le NIR définitif.",
      cost: "Variable : de 0 euro/mois (CSS) à environ 30-60 euros/mois selon la formule choisie.",
      warningNote: "Les boursiers CROUS sur critères sociaux peuvent bénéficier de la CSS gratuitement ou à 1 euro/mois. Vérifiez votre éligibilité avant de souscrire une mutuelle payante.",
      promoNote: "",
      special: "",
      links: [],
      banqueOptions: [],
    },
    {
      order: 10,
      titre: "Obtenir un numéro fiscal",
      description: `Le numéro fiscal permet d'être identifié par l'administration fiscale française. Il est nécessaire pour effectuer une déclaration de revenus (obligatoire si vous travaillez en France), créer une entreprise, accéder à certains services bancaires ou demander certaines aides sociales.

Comment l'obtenir :
- En vous rendant personnellement au [centre des impôts](https://www.impots.gouv.fr/contacts) de votre lieu de résidence, muni d'une pièce d'identité valide, d'un justificatif de domicile en France et d'une copie de votre titre de séjour ou visa.
- En ligne sur [impots.gouv.fr](https://www.impots.gouv.fr/accueil) en créant votre espace personnel, si vous résidez en France depuis plus de 2 ans ou si vous avez déjà un numéro de sécurité sociale.

Une fois obtenu, votre numéro fiscal est permanent. Il apparaît sur tous vos documents fiscaux (avis d'imposition, déclaration de revenus...).

Calendrier de la déclaration des revenus :
La déclaration en ligne ouvre chaque année à la mi-avril et se clôture par département selon ce calendrier indicatif :
- Départements 01 à 19 : fin mai (vers le 22-25 mai)
- Départements 20 à 54 : début juin (vers le 1er-5 juin)
- Départements 55 à 976 : mi-juin (vers le 8-12 juin)
La déclaration papier ferme généralement fin mai, quelle que soit la localisation.

Avantages de la déclaration de revenus :
L'avis d'imposition délivré après la déclaration est un document clé. Il permet notamment de bénéficier de :
- Tarifs réduits sur les transports en commun (pass Navigo Solidarités, Imagine'R conditionné aux ressources, réductions dans certaines villes)
- Bourses CROUS et aides sociales conditionnées aux revenus du foyer fiscal
- Dossier de logement social (HLM) et aides CAF (APL, ALS)
- Justificatif de ressources exigé par les organismes de crédit ou les bailleurs`,
      deadline: "Dans les premiers mois du séjour, avant la première déclaration de revenus (mai/juin de l'année suivante).",
      cost: "Gratuit.",
      warningNote: "",
      promoNote: "",
      special: "",
      links: [],
      banqueOptions: [],
    },
    {
      order: 11,
      titre: "Anticiper le renouvellement du titre de séjour",
      description: "Déposer la demande de renouvellement en ligne sur [l'ANEF](https://administration-etrangers-en-france.interieur.gouv.fr/particuliers/#/), dans la rubrique \"Je renouvelle ou modifie mon titre\". Consultez également notre [Calculateur](/calculateur) pour estimer vos délais et coûts.",
      deadline: "Entre 4 et 2 mois avant l'expiration du titre en cours.",
      cost: "150 euros (100 euros de taxe + 50 euros de droit de timbre). Majoration de 180 euros en cas de dépôt hors délai.",
      warningNote: "Depuis le 1er janvier 2026, toute première délivrance d'une carte de séjour pluriannuelle (y compris lors du passage Licence vers Master) exige la réussite de l'examen civique (score supérieur ou égal à 80 %) et un niveau A2 de français.",
      promoNote: "",
      special: "",
      links: [],
      banqueOptions: [],
    },
  ];

  guide.markModified('steps');
  await guide.save();
  console.log('Accents corriges sur les 11 etapes.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
