'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const GuideConfig = require('../models/GuideConfig');

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MASTER_MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI manquant'); process.exit(1); }

  await mongoose.connect(uri);
  console.log('Connecte a MongoDB');

  const guide = await GuideConfig.findOne({ slug: 'nouvel-arrivant' });
  if (!guide) { console.error('Guide non trouve'); process.exit(1); }

  const existingStep4 = guide.steps.find(s => s.order === 4);
  const banqueOptions = existingStep4 ? (existingStep4.banqueOptions || []) : [];
  console.log('banqueOptions recuperes :', banqueOptions.length, 'options');

  guide.titre = "Guide du nouvel arrivant - Etudiant international en France";
  guide.intro = "Ce guide recapitule, etape par etape, les demarches administratives a effectuer des votre arrivee en France. Chaque etape indique ce qu'il faut faire, le delai a respecter et le lien officiel vers la procedure en ligne. Que vous arriviez avec un visa etudiant ou un visa long sejour, ce guide vous accompagne de votre premier jour jusqu'au renouvellement de votre titre de sejour.";

  guide.steps = [
    {
      order: 1,
      titre: "Valider le visa VLS-TS",
      description: `Si vous etes arrive avec un Visa de Long Sejour valant Titre de Sejour (VLS-TS, mention "VLSTS" sur la vignette), vous devez le valider en ligne pour qu'il ait la valeur d'un titre de sejour.

La validation se fait sur l'ANEF (Administration des Etrangers en France) :
1. Creer un compte ANEF avec votre adresse e-mail ou FranceConnect
2. Saisir le numero de visa, les dates de validite et la date d'entree en France
3. Indiquer votre adresse de residence en France
4. Payer la taxe de validation en ligne (carte bancaire ou timbre electronique)

Apres validation, le VLS-TS tient lieu de titre de sejour pendant toute sa duree. Vous recevrez un recepisse numerique a conserver.

Si votre visa porte la mention "D" (long sejour classique, sans la mention VLS-TS), vous devez faire une demande de titre de sejour etudiant sur l'ANEF dans les 2 mois suivant votre arrivee. Preparez : passeport + visa valide, justificatif d'inscription dans l'etablissement, justificatif de logement, justificatif de ressources financieres et deux photos d'identite.`,
      deadline: "Dans les 3 mois suivant l'arrivee en France. Passe ce delai, vous etes en situation irreguliere.",
      cost: "60 euros (taxe etudiant), payable en ligne par carte bancaire ou par timbre electronique achete en bureau de tabac.",
      warningNote: "Exception : les mineurs titulaires d'un visa mention \"mineur scolarise\" n'ont pas a valider leur visa. Ce visa ne vaut pas titre de sejour autonome et ne necessite aucune demarche de validation sur l'ANEF.",
      promoNote: "",
      special: "",
      links: [
        { label: "Administration Etrangers en France (ANEF)", url: "https://administration-etrangers-en-france.interieur.gouv.fr/particuliers/#/" }
      ],
      banqueOptions: [],
    },
    {
      order: 2,
      titre: "Payer la CVEC (Contribution Vie Etudiante et de Campus)",
      description: "Creer un compte et regler la CVEC avant l'inscription administrative dans l'etablissement. Une attestation numerotee est delivree immediatement apres paiement. Ce numero sera demande par l'universite lors de l'inscription.",
      deadline: "Avant la rentree / avant l'inscription administrative. Sans cette attestation, l'inscription est refusee.",
      cost: "105 euros par an (certains boursiers en sont exoneres).",
      warningNote: "",
      promoNote: "",
      special: "",
      links: [
        { label: "cvec.etudiant.gouv.fr", url: "https://cvec.etudiant.gouv.fr" }
      ],
      banqueOptions: [],
    },
    {
      order: 3,
      titre: "S'inscrire a la securite sociale etudiante",
      description: `Les etudiants hors UE/EEE/Suisse doivent s'affilier a l'Assurance Maladie francaise. Cette inscription est transitoire : elle permet d'obtenir un acces provisoire en attendant la validation complete du dossier, puis de creer un compte Ameli definitif.

L'inscription se fait en ligne (francais, anglais, espagnol) apres l'inscription dans l'etablissement, sur etudiant-etranger.ameli.fr. Pieces a preparer :
- Piece d'identite ou VLS-TS valide
- Certificat de scolarite de l'annee en cours
- RIB (releve d'identite bancaire)
- Piece d'etat civil : copie integrale de l'acte de naissance, extrait d'acte de naissance avec filiation, livret de famille ou acte de mariage

Apres le depot, votre dossier est verifie. Vous serez informe de l'avancee par mail et depuis votre espace personnel. Si une piece est non conforme, vous serez avise automatiquement par mail. Sans reponse, le dossier sera clos apres 2 relances.

Votre attestation de droits provisoire, avec votre NIA (Numero d'Identification d'Attente), sera disponible apres validation des documents et a partir de la date de debut de scolarite. Une fois votre dossier complet, votre NIA sera transforme en NIR definitif. Vous recevrez un imprime de demande de carte vitale et pourrez creer votre compte Ameli.

Des que votre compte Ameli est cree, declarez un medecin traitant. Sans medecin traitant designe, vos remboursements sont reduits (30 % au lieu de 70 % pour les consultations chez un specialiste). La declaration se fait depuis votre espace Ameli ou lors de votre premiere consultation.`,
      deadline: "Des que possible apres l'inscription dans l'etablissement. Compter 8 a 12 semaines de traitement.",
      cost: "Gratuit.",
      warningNote: "Les etudiants UE/EEE/Suisse munis d'une Carte Europeenne d'Assurance Maladie (CEAM) valide n'ont aucune demarche a faire ici.",
      promoNote: "",
      special: "",
      links: [
        { label: "etudiant-etranger.ameli.fr", url: "https://etudiant-etranger.ameli.fr" },
        { label: "Creer mon compte Ameli", url: "https://www.ameli.fr" },
        { label: "Trouver un medecin traitant (Doctolib)", url: "https://www.doctolib.fr" }
      ],
      banqueOptions: [],
    },
    {
      order: 4,
      titre: "Ouvrir un compte bancaire francais",
      description: `Un RIB francais est indispensable pour la CAF (APL), les remboursements de securite sociale, le paiement du loyer, des factures, et la plupart des demarches administratives. Il permet egalement d'eviter les frais de change associes aux transferts internationaux.

Comment ouvrir un compte bancaire :
1. Choisir une banque : comparez les offres des banques traditionnelles (BNP, Societe Generale, Credit Agricole...) et des banques en ligne (Boursobank, Hello Bank...). Les banques en ligne sont souvent plus accessibles pour les etudiants etrangers sans justificatif de revenus.
2. Prendre rendez-vous : en agence ou en ligne selon la banque.
3. Preparer les documents :
   - Piece d'identite valide (carte nationale d'identite, passeport ou titre de sejour)
   - Justificatif de domicile (contrat de location, quittance, attestation d'hebergement)
   - Justificatif d'inscription dans l'etablissement
4. Remplir le formulaire d'ouverture de compte.
5. Effectuer un premier depot (montant variable selon la banque).

Utilisez notre lien de parrainage ci-dessous pour beneficier d'avantages a l'ouverture.`,
      deadline: "Des que possible apres l'arrivee.",
      cost: "",
      warningNote: "",
      promoNote: "",
      special: "banque",
      links: [],
      banqueOptions: banqueOptions,
    },
    {
      order: 5,
      titre: "Souscrire une mutuelle complementaire",
      description: `L'Assurance Maladie (securite sociale) rembourse en moyenne 70 % des soins courants. La mutuelle complementaire prend en charge le reste (ticket moderateur, depassements d'honoraires, optique, dentaire). Sans mutuelle, les frais non rembourses restent a votre charge.

Plusieurs options existent pour les etudiants :
- LMDE, SMENO, Heyme, MEP : mutuelles dediees aux etudiants, avec des tarifs adaptes
- Mutuelle de l'etablissement : certaines universites negocient des contrats collectifs avantageux
- Complementaire Sante Solidaire (CSS) : gratuite ou quasi-gratuite pour les boursiers et etudiants aux revenus modestes (a verifier aupres de la CAF)

La CSS se souscrit directement depuis votre espace AMELI une fois votre compte cree. Elle prend en charge les depenses non couvertes par la securite sociale et peut etre gratuite ou payante selon vos revenus.

La souscription est possible des l'obtention du numero de securite sociale provisoire (NIA). La mutuelle peut etre exigee par certaines ecoles ou pour l'obtention d'un logement CROUS.`,
      deadline: "Des l'obtention du NIA (Numero d'Identification d'Attente). Ne pas attendre le NIR definitif.",
      cost: "Variable : de 0 euro/mois (CSS) a environ 30-60 euros/mois selon la formule choisie.",
      warningNote: "Les boursiers CROUS sur criteres sociaux peuvent beneficier de la CSS gratuitement ou a 1 euro/mois. Verifiez votre eligibilite avant de souscrire une mutuelle payante.",
      promoNote: "",
      special: "",
      links: [
        { label: "Complementaire Sante Solidaire (CSS)", url: "https://www.complementaire-sante-solidaire.gouv.fr" },
        { label: "LMDE", url: "https://www.lmde.com" }
      ],
      banqueOptions: [],
    },
    {
      order: 6,
      titre: "Chercher un logement et demander l'aide au logement",
      description: `Se loger est l'une des premieres preoccupations a l'arrivee. Plusieurs options s'offrent a vous :

1. La residence universitaire (CROUS) : option souvent la plus accessible financierement. Les loyers y sont plus bas et vous pouvez y rencontrer d'autres etudiants. Les places sont limitees et l'attribution se fait selon des criteres sociaux. Engagez la procedure via le site du CROUS de votre ville de destination avant meme votre arrivee en France.

2. La colocation : permet de partager les frais. Avantageuse pour les revenus modestes. Attention : la cohabitation demande une entente sur les regles de vie commune. Privilegiez les personnes que vous connaissez ou ayant des centres d'interet similaires.

3. La location d'appartement : plus d'independance, mais loyers plus eleves et garanties exigees par les proprietaires (garant, justificatifs de revenus). Documents generalement demandes pour le dossier locataire : piece d'identite, justificatif de revenus (contrat de travail, attestation de bourse), justificatif de domicile actuel, garant ou Garantie Visale.

Ou chercher un logement :
- Leboncoin (www.leboncoin.fr) : petites annonces de particuliers
- Se Loger (www.seloger.com) : selection large, criteres de recherche avances
- PAP - Particulier a Particulier (www.pap.fr) : annonces directes entre proprietaires et locataires
- Agences immobilieres : des frais d'agence s'appliquent (generalement 1 mois de loyer)

Aides au logement disponibles :
- APL (Aide Personnalisee au Logement) : versee par la CAF si le logement est conventionne. Demande a faire des le premier mois.
- ALS (Allocation de Logement Social) : pour les personnes ne pouvant pas beneficier de l'APL. Egalement via la CAF.
- Garantie Visale : caution locative gratuite fournie par Action Logement. A demander avant de commencer les visites.
- Action Logement : aide specifique aux salaries du secteur prive. Plus d'informations sur actionlogement.fr.`,
      deadline: "",
      cost: "",
      warningNote: "Depuis la loi de finances 2026, les etudiants hors UE/EEE/Suisse doivent etre boursiers CROUS sur criteres sociaux pour percevoir l'APL. Les non-boursiers non-UE en sont exclus depuis le 1er juillet 2026.",
      promoNote: "",
      special: "",
      links: [
        { label: "Garantie Visale", url: "https://www.visale.fr" },
        { label: "Demande d'APL (CAF)", url: "https://www.caf.fr" },
        { label: "Action Logement", url: "https://www.actionlogement.fr" },
        { label: "Logement CROUS", url: "https://www.messervices.etudiant.gouv.fr" }
      ],
      banqueOptions: [],
    },
    {
      order: 7,
      titre: "Finaliser l'inscription administrative a l'etablissement",
      description: "Presenter a l'etablissement l'ensemble des pieces requises : attestation CVEC, VLS-TS valide (ou recepisse), justificatif de domicile, releves de notes et diplomes selon le niveau d'inscription. Cette etape conditionne la delivrance de la carte d'etudiant.",
      deadline: "Selon le calendrier propre a chaque etablissement.",
      cost: "",
      warningNote: "",
      promoNote: "",
      special: "",
      links: [],
      banqueOptions: [],
    },
    {
      order: 8,
      titre: "Anticiper le renouvellement du titre de sejour",
      description: "Deposer la demande de renouvellement en ligne sur l'ANEF, dans la rubrique \"Je renouvelle ou modifie mon titre\".",
      deadline: "Entre 4 et 2 mois avant l'expiration du titre en cours.",
      cost: "150 euros (100 euros de taxe + 50 euros de droit de timbre). Majoration de 180 euros en cas de depot hors delai.",
      warningNote: "Depuis le 1er janvier 2026, toute premiere delivrance d'une carte de sejour pluriannuelle (y compris lors du passage Licence vers Master) exige la reussite de l'examen civique (score superieur ou egal a 80 %) et un niveau A2 de francais.",
      promoNote: "",
      special: "",
      links: [
        { label: "ANEF - Renouvellement de titre", url: "https://administration-etrangers-en-france.interieur.gouv.fr/particuliers/#/" },
        { label: "Consultez le Calculateur", url: "/calculateur" }
      ],
      banqueOptions: [],
    },
    {
      order: 9,
      titre: "Obtenir un numero fiscal",
      description: `Le numero fiscal (egalement appele numero d'identification fiscale) permet d'etre identifie par l'administration fiscale francaise. Il est necessaire pour :
- Effectuer une declaration de revenus (obligatoire si vous travaillez en France)
- Creer une entreprise en France
- Acceder a certains services bancaires
- Demander certaines aides sociales

Comment l'obtenir :
- En vous rendant personnellement au centre des impots de votre lieu de residence, muni d'une piece d'identite valide, d'un justificatif de domicile en France (contrat de location ou attestation d'hebergement) et d'une copie de votre titre de sejour ou visa.
- En ligne sur impots.gouv.fr en creant votre espace personnel, si vous residez en France depuis plus de 2 ans ou si vous avez deja un numero de securite sociale.

Une fois obtenu, votre numero fiscal est permanent. Il apparait sur tous vos documents fiscaux (avis d'imposition, declaration de revenus...).`,
      deadline: "Dans les premiers mois du sejour, avant la premiere declaration de revenus (mai/juin de l'annee suivante).",
      cost: "Gratuit.",
      warningNote: "",
      promoNote: "",
      special: "",
      links: [
        { label: "impots.gouv.fr - Espace particulier", url: "https://www.impots.gouv.fr/accueil" },
        { label: "Trouver votre centre des impots", url: "https://www.impots.gouv.fr/contacts" }
      ],
      banqueOptions: [],
    },
    {
      order: 10,
      titre: "Souscrire un abonnement transport",
      description: `Disposer d'un abonnement de transport en commun vous facilitera grandement la vie au quotidien.

En Ile-de-France :
- Pass Navigo Mensuel ou Annuel : zones 1 a 5, valable sur metro, RER, bus, tramway. S'achete en ligne (iledefrance-mobilites.fr) ou dans les agences RATP.
- Imagine'R : abonnement annuel a tarif reduit pour les etudiants de moins de 26 ans et les scolaires en Ile-de-France. Reduction significative par rapport au Navigo classique. Demande a faire des l'inscription universitaire.
- Navigo Decouverte : carte rechargeable a 5 euros, disponible sans justificatif d'identite.

Dans les autres villes :
La plupart des grandes villes proposent des tarifs etudiants ou des abonnements mensuels reduits. Renseignez-vous aupres du reseau de transport de votre ville (TCL a Lyon, TBM a Bordeaux, Tiseo a Toulouse, STAR a Rennes...).

Conservez toujours votre titre de transport valide lors de vos deplacements. En cas de controle sans titre valable, une amende de 50 euros (majoree si non regularisee) peut etre appliquee.`,
      deadline: "Des les premiers jours apres l'arrivee.",
      cost: "Variable selon la ville et le type d'abonnement. En IDF : Navigo mensuel zones 1-5 a 86,40 euros/mois. Imagine'R annuel : environ 350 euros/an.",
      warningNote: "",
      promoNote: "",
      special: "",
      links: [
        { label: "Ile-de-France Mobilites", url: "https://www.iledefrance-mobilites.fr" },
        { label: "Imagine'R", url: "https://www.imaginer.fr" }
      ],
      banqueOptions: [],
    },
    {
      order: 11,
      titre: "Vigilance contre les fraudes et arnaques",
      description: `En tant que nouvel arrivant, vous pouvez etre cible par des personnes malveillantes. Voici les arnaques les plus courantes et comment les eviter.

Arnaques courantes :
- Arnaques a la location : annonces immobilieres fictives avec demande de versement anticipatif. Ne versez jamais de loyer ou de caution avant d'avoir visite le logement et signe un contrat.
- Faux sites administratifs : des sites imitent les portails officiels (ANEF, CAF, AMELI) pour collecter vos donnees personnelles ou vous facturer des services gratuits. Verifiez toujours que l'URL se termine par .gouv.fr.
- Phishing (hameconnage) : e-mails ou SMS imitant des organismes officiels (CPAM, CAF, banque) demandant vos identifiants ou coordonnees bancaires. Aucun organisme officiel ne vous demande votre mot de passe par e-mail.
- Faux conseillers ou fausses agences d'admission : des personnes se presentent comme des conseillers officiels et proposent des services payants pour des demarches gratuites (demande de visa, CVEC, securite sociale).
- Arnaques a l'emploi : offres de jobs trop allechantes, demande de versement prealable ou de coordonnees bancaires avant embauche.

Les bons reflexes :
- Ne communiquez jamais votre mot de passe, numero de carte bancaire ou code secret.
- Utilisez uniquement les sites officiels (verifiez le .gouv.fr ou le cadenas HTTPS).
- Ne cliquez pas sur des liens dans des e-mails non sollicites.
- En cas de doute, contactez directement l'organisme via son numero officiel.
- Signalez toute arnaque sur le portail officiel signalement.gouv.fr.`,
      deadline: "",
      cost: "",
      warningNote: "Si vous pensez avoir ete victime d'une fraude, contactez immediatement votre banque pour bloquer votre carte et deposez une plainte en ligne ou au commissariat.",
      promoNote: "",
      special: "",
      links: [
        { label: "Signalement.gouv.fr", url: "https://www.signal.spam.fr" },
        { label: "Cybermalveillance.gouv.fr", url: "https://www.cybermalveillance.gouv.fr" }
      ],
      banqueOptions: [],
    },
  ];

  guide.markModified('steps');
  await guide.save();
  console.log('Guide mis a jour avec succes ! ' + guide.steps.length + ' etapes enregistrees.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
