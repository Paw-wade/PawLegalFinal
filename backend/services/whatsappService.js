const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

/**
 * Envoie un message texte WhatsApp via la Cloud API Meta et le persiste dans la conversation.
 */
async function sendMessage(to, text, conv, options = {}) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) {
    console.warn('WhatsApp: WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_TOKEN manquant');
    return;
  }
  const payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };
  if (options.replyToWaId) payload.context = { message_id: options.replyToWaId };

  const resp = await axios.post(
    `${BASE_URL}/${phoneId}/messages`,
    payload,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  const waMessageId = resp.data?.messages?.[0]?.id || '';

  if (conv) {
    conv.messages.push({
      direction: 'outbound',
      type: 'text',
      content: text,
      waMessageId,
      replyToWaId: options.replyToWaId || '',
      replyToContent: options.replyToContent || '',
      timestamp: new Date(),
    });
    await conv.save();
  }
}

/**
 * Envoie un message media (audio, image, document, video) depuis l'admin.
 * mediaId doit etre un ID obtenu via l'API Meta Media Upload.
 */
async function sendMediaMessage(to, mediaId, mediaType, filename, conv) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) {
    console.warn('WhatsApp: WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_TOKEN manquant');
    return;
  }

  const typePayloads = {
    image: { image: { id: mediaId } },
    video: { video: { id: mediaId } },
    audio: { audio: { id: mediaId } },
    document: { document: { id: mediaId, filename: filename || 'document' } },
  };
  const extra = typePayloads[mediaType] || typePayloads.document;

  const resp = await axios.post(
    `${BASE_URL}/${phoneId}/messages`,
    { messaging_product: 'whatsapp', to, type: mediaType, ...extra },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  const waMessageId = resp.data?.messages?.[0]?.id || '';

  if (conv) {
    conv.messages.push({
      direction: 'outbound',
      type: mediaType,
      content: filename || '',
      mediaId,
      filename: filename || '',
      waMessageId,
      timestamp: new Date(),
    });
    conv.lastActivity = new Date();
    await conv.save();
  }
}

/**
 * Envoie un message proactif depuis l'admin sans passer par la machine a etats.
 */
async function sendProactiveMessage(phone, text) {
  const WhatsappConversation = require('../models/WhatsappConversation');
  let conv = await WhatsappConversation.findOne({ phone });
  if (!conv) {
    conv = new WhatsappConversation({ phone, state: 'menu', lastActivity: new Date() });
  }
  await sendMessage(phone, text, conv);
}

// ─────────────────────────────────────────────
// Menus et réponses FAQ
// ─────────────────────────────────────────────

const STATUT_DOSSIER_LABELS = {
  recu: 'Recu',
  en_cours: 'En cours de traitement',
  en_attente_documents: 'En attente de documents',
  en_attente: 'En attente',
  traite: 'Traite',
  clos: 'Clos',
  refuse: 'Refuse',
  archive: 'Archive',
};

function menuPrincipal(prenom) {
  const salut = prenom ? `Bonjour *${prenom}* 👋` : `Bonjour et bienvenue 👋`;
  if (prenom) {
    return `${salut}

Je suis Ada. Comment puis-je vous aider ?

1️⃣  Prendre un rendez-vous
2️⃣  Faire une demande
3️⃣  Mes dossiers
4️⃣  Parler a un conseiller

Ecrivez *1*, *2*, *3* ou *4* pour choisir.`;
  }
  return `${salut}

Je suis Ada. Comment puis-je vous aider ?

1️⃣  Prendre un rendez-vous
2️⃣  Faire une demande
3️⃣  Parler a un conseiller

Ecrivez *1*, *2* ou *3* pour choisir.

_Pas encore de compte ? Inscrivez-vous sur *adapapers.fr* pour une meilleure experience._`;
}

const DEMANDE_MENU = `Quelle est votre situation ?

*Droit des etrangers :*
1️⃣  Titre de sejour
2️⃣  Nationalite francaise
3️⃣  Regroupement familial

*Recours :*
4️⃣  OQTF (obligation de quitter le territoire)
5️⃣  Refus de visa
6️⃣  Absence de reponse a une demande de titre de sejour

*Demande de visa :*
7️⃣  Visa France - Senegal
8️⃣  Visa France - Etats-Unis

*Creation d'entreprise :*
9️⃣  Societe / entreprise en France
10.  Societe / entreprise au Senegal

0️⃣  Retour au menu principal

Ecrivez le numero de votre choix.`;

const TITRE_SEJOUR_MENU = `Quel type de titre de sejour ?

1️⃣  Premiere demande de titre de sejour
2️⃣  Renouvellement de titre de sejour
3️⃣  Changement de statut
4️⃣  Carte de resident (10 ans)

0️⃣  Retour

Ecrivez le numero de votre choix.`;

const TITRE_SEJOUR_REPONSES = {
  '1': { label: 'premiere demande de titre de sejour', detail: 'etudiant, salarie, visiteur ou autre motif' },
  '2': { label: 'renouvellement de titre de sejour', detail: 'avant l\'expiration de votre titre actuel' },
  '3': { label: 'changement de statut', detail: 'passer d\'un statut etudiant a salarie, par exemple' },
  '4': { label: 'carte de resident 10 ans', detail: 'carte de longue duree pour residents etablis en France' },
};

const DEMANDE_REPONSES = {
  '2': { label: 'nationalite francaise', detail: 'acquisition par naturalisation ou mariage' },
  '3': { label: 'regroupement familial', detail: 'faire venir vos proches en France' },
  '4': { label: 'contestation d\'OQTF', detail: 'recours contre une obligation de quitter le territoire' },
  '5': { label: 'recours refus de visa', detail: 'contester un refus de visa devant la CRRV ou le tribunal administratif' },
  '6': { label: 'recours absence de reponse (titre de sejour)', detail: 'silence de la prefecture valant rejet apres 4 mois' },
  '7': { label: 'visa France - Senegal', detail: 'visa de court ou long sejour pour entrer en France depuis le Senegal' },
  '8': { label: 'visa France - Etats-Unis', detail: 'visa de court ou long sejour pour entrer en France depuis les Etats-Unis' },
  '9': { label: 'creation de societe en France', detail: 'SARL, SAS, SCI ou auto-entrepreneur' },
  '10': { label: 'creation de societe au Senegal', detail: 'SARL, SUARL ou SAS au Senegal' },
};

const FAQ_MENU = `Sur quel sujet souhaitez-vous des informations ?

1️⃣  OQTF (Obligation de Quitter le Territoire)
2️⃣  Visa refusé
3️⃣  Titre de séjour / renouvellement
4️⃣  Délais de traitement préfecture
5️⃣  Regroupement familial
0️⃣  Retour au menu principal`;

const FAQ_REPONSES = {
  '1': `📋 *OQTF (Obligation de Quitter le Territoire)*

Si vous avez reçu une OQTF, vous disposez en général de *30 jours* pour quitter le territoire ou exercer un recours.

Voies de recours possibles :
• Recours gracieux auprès du préfet (délai : 2 mois)
• Recours pour excès de pouvoir devant le tribunal administratif
• Référé-suspension si urgence

⚠️ Les délais sont stricts. Consultez un avocat sans tarder.

Tapez *menu* pour revenir ou *2* pour prendre un rendez-vous.`,

  '2': `📋 *Visa refusé*

En cas de refus de visa, vous pouvez :

• Formuler un recours gracieux auprès du consulat (2 mois)
• Saisir la Commission de recours contre les refus de visa (CRRV) sous *2 mois*
• Introduire un recours contentieux devant le Conseil d'État

Le recours CRRV est gratuit et constitue une condition préalable au recours contentieux.

Tapez *menu* pour revenir ou *2* pour prendre un rendez-vous.`,

  '3': `📋 *Titre de séjour / renouvellement*

Pour un premier titre ou un renouvellement :

• Dépôt du dossier en préfecture ou via l'ANEF (anef.interieur.gouv.fr)
• *Récépissé* délivré dès le dépôt — il vaut autorisation de séjour provisoire
• Délai moyen de traitement : 2 à 6 mois selon la préfecture

Si la préfecture dépasse 4 mois sans répondre, cela vaut *rejet implicite* et ouvre droit à un recours.

Tapez *menu* pour revenir ou *2* pour prendre un rendez-vous.`,

  '4': `📋 *Délais de traitement préfecture*

Les délais varient fortement :

• Préfecture de Paris : 3 à 8 mois
• Autres préfectures : 2 à 5 mois
• ANEF (en ligne) : 1 à 4 mois

En cas de dépassement de délai :
→ Relance par courrier recommandé
→ Saisine du médiateur de la République
→ Recours pour excès de pouvoir (silence valant rejet après 4 mois)

Tapez *menu* pour revenir ou *2* pour prendre un rendez-vous.`,

  '5': `📋 *Regroupement familial*

Conditions principales :
• Résider légalement en France depuis au moins *18 mois*
• Disposer de ressources stables et suffisantes
• Logement aux normes de salubrité

Procédure :
1. Dépôt de la demande auprès de l'OFII
2. Enquête logement et ressources (~4 mois)
3. Visa long séjour pour les membres de la famille

Tapez *menu* pour revenir ou *2* pour prendre un rendez-vous.`,
};

const MOTIFS_RDV = {
  '1': 'titre_sejour',
  '2': 'conteste_oqtf',
  '3': 'regroupement_familial',
  '4': 'demande_visa',
  '5': 'creation_entreprise',
  '6': 'autre',
};

const MOTIFS_LABELS = {
  titre_sejour: 'Demande et renouvellement titre de sejour',
  conteste_oqtf: 'OQTF',
  regroupement_familial: 'Regroupement familial',
  demande_visa: 'Demande de visa',
  creation_entreprise: 'Creation d\'entreprise',
  autre: 'Autre',
};

const TYPES_DOCUMENT_WA = {
  '1': 'Passeport',
  '2': 'Acte de naissance',
  '3': 'Justificatif de domicile',
  '4': 'Titre de sejour actuel',
  '5': 'Attestation employeur',
  '6': 'Contrat de travail',
  '7': 'Bulletin de salaire',
  '8': 'Acte de mariage',
  '9': 'Formulaire CERFA',
  '10': 'Taxe de sejour (timbres fiscaux)',
  '11': 'Photos d\'identite',
  '12': 'Autre document',
};

function menuTypesDocument() {
  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
  const lignes = Object.entries(TYPES_DOCUMENT_WA).map(([k, v]) => {
    const n = parseInt(k, 10);
    const em = n <= 9 ? emojis[n - 1] : `${n}.`;
    return `${em}  ${v}`;
  });
  return `Quel type de document souhaitez-vous envoyer ?\n\n${lignes.join('\n')}\n\nEcrivez le numero de votre choix, ou *0* pour annuler.`;
}

function mapDocTypeToCategorie(docType) {
  const t = (docType || '').toLowerCase();
  if (t.includes('passeport') || t.includes('identite') || t.includes('naissance') || t.includes('mariage')) return 'identite';
  if (t.includes('titre') || t.includes('sejour') || t.includes('oqtf') || t.includes('prefec')) return 'titre_sejour';
  if (t.includes('contrat') || t.includes('salaire') || t.includes('attestation') || t.includes('emploi')) return 'contrat';
  if (t.includes('taxe') || t.includes('timbre') || t.includes('facture') || t.includes('loyer')) return 'facture';
  return 'autre';
}

function getExtFromMime(mimeType) {
  const map = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  };
  return map[mimeType] || 'bin';
}

async function fetchPendingRequests(dossierId) {
  if (!dossierId) return [];
  try {
    const DocumentRequest = require('../models/DocumentRequest');
    return await DocumentRequest.find({ dossier: dossierId, status: 'pending' })
      .sort({ isUrgent: -1, createdAt: 1 })
      .lean();
  } catch (e) {
    console.warn('[WhatsApp] fetchPendingRequests:', e.message);
    return [];
  }
}

function menuContactConseiller(avecDossier = false) {
  if (avecDossier) {
    return `Pour quelle raison souhaitez-vous parler a un conseiller ?\n\n1️⃣  Question sur mon dossier en cours\n2️⃣  Premiere prise de contact\n3️⃣  Urgence\n4️⃣  Autre\n\nEcrivez le numero de votre choix, *R* pour revenir au menu.`;
  }
  return `Pour quelle raison souhaitez-vous parler a un conseiller ?\n\n1️⃣  Premiere prise de contact\n2️⃣  Urgence\n3️⃣  Autre\n\nEcrivez le numero de votre choix, *R* pour revenir au menu.`;
}

async function afficherDocsDossier(conv, docIds) {
  const Document = require('../models/Document');
  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
  const docs = await Document.find({ _id: { $in: docIds } })
    .select('nom nomFichier typeMime')
    .lean();
  if (!docs.length) {
    conv.state = 'dossier_detail';
    await conv.save();
    return `Aucun document fourni pour ce dossier.\n\nTapez *0* pour revenir au menu.`;
  }
  const dossierNumero = conv.docContext?.dossierNumero || '';
  const header = dossierNumero ? `📂 *Documents du dossier N° ${dossierNumero}*\n\n` : '📂 *Mes documents*\n\n';
  let list = '';
  docs.forEach((d, i) => {
    const ext = (d.typeMime || '').includes('pdf') ? 'PDF' : (d.typeMime || '').includes('image') ? 'Image' : 'Fichier';
    list += `${emojis[i] || (i + 1) + '.'} ${d.nom || d.nomFichier || 'Document'} _(${ext})_\n`;
  });
  conv.state = 'dossier_docs_list';
  await conv.save();
  return `${header}${list}\nEcrivez le numero du document pour obtenir le lien de telechargement.\n*R* pour revenir au dossier.`;
}

function buildDocChoixTypeMenu(pendingRequests, dossierNumero) {
  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
  if (pendingRequests.length === 0) {
    return menuTypesDocument();
  }
  const dossierRef = dossierNumero ? `dossier N° ${dossierNumero}` : 'votre dossier';
  const lignes = pendingRequests.map((req, i) => {
    const em = i < 9 ? emojis[i] : `${i + 1}.`;
    const urgent = req.isUrgent ? ' ⚠️ URGENT' : '';
    return `${em}  ${req.documentTypeLabel}${urgent}`;
  });
  const autrIdx = pendingRequests.length + 1;
  const autrEm = autrIdx <= 9 ? emojis[autrIdx - 1] : `${autrIdx}.`;
  lignes.push(`${autrEm}  Autre document`);
  return `Documents demandes pour le ${dossierRef} :\n\n${lignes.join('\n')}\n\nEcrivez le numero de votre choix, *R* pour revenir, *0* pour le menu.`;
}

// ─────────────────────────────────────────────
// Créneaux disponibles
// ─────────────────────────────────────────────

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MOIS_FR = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

function formatDateFr(date) {
  const d = new Date(date);
  return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]}`;
}

async function obtenirCreneauxDisponibles() {
  const Creneau = require('../models/Creneau');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Creneau.find({ ferme: { $ne: true }, date: { $gte: today } })
    .sort({ date: 1, heure: 1 })
    .limit(5)
    .lean();
}

function formatMenuCreneaux(creneaux) {
  const nums = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
  const lignes = creneaux.map((c, i) => `${nums[i]}  ${formatDateFr(c.date)} a ${c.heure}`);
  return `Voici les prochains creneaux disponibles :\n\n${lignes.join('\n')}\n\nEcrivez le numero de votre choix, ou *0* pour annuler.`;
}

// ─────────────────────────────────────────────
// Machine à états conversationnelle
// ─────────────────────────────────────────────

/**
 * Charge l'utilisateur lie a la conversation (par clientId ou par phone en fallback).
 */
async function resolveUser(conv) {
  try {
    const User = require('../models/User');
    if (conv.clientId) {
      return await User.findById(conv.clientId).select('firstName lastName phone').lean();
    }
    // Recherche par numero avec les deux formats (avec et sans +) et par whatsappPhone
    const phone = conv.phone || '';
    const phoneAlt = phone.startsWith('+') ? phone.slice(1) : '+' + phone;
    const user = await User.findOne({
      $or: [
        { phone },
        { phone: phoneAlt },
        { whatsappPhone: phone },
        { whatsappPhone: phoneAlt },
      ],
    }).select('_id firstName lastName phone').lean();
    if (user) {
      conv.clientId = user._id;
      conv.contactName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      await conv.save();

      // Auto-lier le dossier le plus recent si aucun n'est encore lie
      if (!conv.dossierId) {
        try {
          const Dossier = require('../models/Dossier');
          const dossier = await Dossier.findOne({ user: user._id })
            .sort({ createdAt: -1 })
            .select('_id')
            .lean();
          if (dossier) {
            conv.dossierId = dossier._id;
            await conv.save();
          }
        } catch (e) {
          console.warn('[WhatsApp] Auto-lien dossier echoue:', e.message);
        }
      }
    }
    return user;
  } catch {
    return null;
  }
}

/**
 * Traite un message entrant et met a jour l'etat de la conversation.
 * Retourne le texte de réponse a envoyer.
 */
async function handleIncomingMessage(conv, incomingText, messageType) {
  const text = (incomingText || '').trim().toLowerCase();

  // Identifier l'utilisateur lie a ce numero (doit etre fait avant le check media)
  const user = await resolveUser(conv);
  const prenom = user?.firstName || null;

  // Pour les types medias
  if (messageType && messageType !== 'text' && messageType !== 'location') {
    // Si on attend un fichier pour un dossier, traiter le document
    if (conv.state === 'doc_attente_fichier' && conv.docContext?.dossierId && user) {
      return await traiterDocumentRecu(conv, user);
    }
    // Sinon accusé de reception + mode conseiller
    const typeLabels = { image: 'photo', document: 'document', audio: 'message vocal', video: 'video' };
    const label = typeLabels[messageType] || 'fichier';
    if (!conv.humanMode) {
      conv.humanMode = true;
      conv.markModified('humanMode');
    }
    return `Votre ${label} a bien ete recu. Un conseiller Ada Papers va l'examiner et vous recontactera dans les plus brefs delais.\n\nTapez *0* pour revenir au menu.`;
  }

  if (text === 'menu' || text === '0') {
    conv.state = 'menu';
    conv.rdv = {};
    conv.docContext = {};
    conv.markModified('docContext');
    await conv.save();
    return menuPrincipal(prenom);
  }

  switch (conv.state) {
    case 'menu': {
      // Option 1 : RDV
      if (text === '1') {
        conv.rdv = {};
        if (!prenom) {
          conv.state = 'rdv_name';
          await conv.save();
          return `Pour beneficier de l'accompagnement personnalise d'Ada Papers, nous vous recommandons de creer votre compte sur *adapapers.fr*.\n\nCela vous permettra de suivre vos dossiers et d'etre reconnu automatiquement.\n\nSi vous souhaitez quand meme prendre un rendez-vous, tapez votre *prenom* pour commencer.`;
        }
        conv.rdv.prenom = prenom;
        conv.state = 'rdv_motif';
        conv.markModified('rdv');
        await conv.save();
        return `Pour quel motif souhaitez-vous un rendez-vous, *${prenom}* ?\n\n1️⃣  Demande et renouvellement titre de sejour\n2️⃣  OQTF\n3️⃣  Regroupement familial\n4️⃣  Demande de visa\n5️⃣  Creation d'entreprise\n6️⃣  Autre\n\nEcrivez le numero de votre choix.`;
      }
      // Option 2 : Faire une demande
      if (text === '2') {
        conv.state = 'demande_menu';
        await conv.save();
        return DEMANDE_MENU;
      }
      // Option 3 : Mes dossiers (utilisateur reconnu) OU Parler a un conseiller (visiteur)
      if (text === '3') {
        if (prenom) {
          return await afficherDossiers(conv, user);
        }
        conv.state = 'contact_name';
        await conv.save();
        return `Pour beneficier de l'accompagnement personnalise d'Ada Papers, nous vous recommandons de creer votre compte sur *adapapers.fr*.\n\nCela vous permettra de suivre vos dossiers et d'etre reconnu automatiquement.\n\nSi vous souhaitez quand meme parler a un conseiller, tapez votre *prenom et nom*.`;
      }
      // Option 4 : Parler a un conseiller (utilisateur reconnu uniquement)
      if (text === '4' && prenom) {
        conv.state = 'contact_motif';
        await conv.save();
        return menuContactConseiller(true);
      }
      return `Ecrivez *1*, *2*${prenom ? ', *3* ou *4*' : ' ou *3*'} pour choisir.\n\n${menuPrincipal(prenom)}`;
    }

    case 'demande_menu': {
      if (text === '0') {
        conv.state = 'menu';
        await conv.save();
        return menuPrincipal(prenom);
      }
      if (text === '1') {
        conv.state = 'titre_sejour_menu';
        await conv.save();
        return TITRE_SEJOUR_MENU;
      }
      const demande = DEMANDE_REPONSES[text];
      if (!demande) {
        return `Ecrivez un numero entre *1* et *10*, ou *0* pour revenir.\n\n${DEMANDE_MENU}`;
      }
      conv.state = 'menu';
      await conv.save();
      const compteMsg = !prenom
        ? `\n\n💡 _Creez votre compte sur *adapapers.fr* pour suivre l'avancement de votre dossier en temps reel._`
        : '';
      return `Pour votre demande de *${demande.label}* (${demande.detail}), rendez-vous sur :\n\n👉 *adapapers.fr/nouvelle-demande*\n\nRemplissez le formulaire en ligne. Notre equipe traitera votre dossier sous *48h* et vous recontactera.${compteMsg}\n\nTapez *menu* pour revenir au menu principal.`;
    }

    case 'titre_sejour_menu': {
      if (text === '0') {
        conv.state = 'demande_menu';
        await conv.save();
        return DEMANDE_MENU;
      }
      const titreDemande = TITRE_SEJOUR_REPONSES[text];
      if (!titreDemande) {
        return `Ecrivez *1*, *2*, *3* ou *4*, ou *0* pour revenir.\n\n${TITRE_SEJOUR_MENU}`;
      }
      conv.state = 'menu';
      await conv.save();
      const compteMsg2 = !prenom
        ? `\n\n💡 _Creez votre compte sur *adapapers.fr* pour suivre l'avancement de votre dossier en temps reel._`
        : '';
      return `Pour votre *${titreDemande.label}* (${titreDemande.detail}), rendez-vous sur :\n\n👉 *adapapers.fr/nouvelle-demande*\n\nRemplissez le formulaire en ligne. Notre equipe traitera votre dossier sous *48h* et vous recontactera.${compteMsg2}\n\nTapez *menu* pour revenir au menu principal.`;
    }

    case 'rdv_name': {
      if (!incomingText || incomingText.trim().length < 2) {
        return `Veuillez indiquer votre prenom (au moins 2 caracteres).`;
      }
      if (!conv.rdv) conv.rdv = {};
      conv.rdv.prenom = incomingText.trim();
      conv.state = 'rdv_motif';
      conv.markModified('rdv');
      await conv.save();
      return `Merci *${conv.rdv.prenom}* ! Pour quel motif souhaitez-vous un rendez-vous ?\n\n1️⃣  Demande et renouvellement titre de sejour\n2️⃣  OQTF\n3️⃣  Regroupement familial\n4️⃣  Demande de visa\n5️⃣  Creation d'entreprise\n6️⃣  Autre\n\nEcrivez le numero de votre choix.`;
    }

    case 'rdv_motif': {
      const motif = MOTIFS_RDV[text];
      if (!motif) return `Ecrivez un numero entre *1* et *6* pour choisir le motif.`;
      conv.rdv.motif = motif;
      conv.markModified('rdv');
      await conv.save();
      const creneaux = await obtenirCreneauxDisponibles();
      if (creneaux.length === 0) {
        conv.state = 'rdv_note';
        await conv.save();
        return `Aucun creneau n'est disponible en ligne pour le moment.\n\nVous serez contacte tres rapidement par un conseiller. A bientot !\n\nSouhaitez-vous ajouter une precision pour faciliter la prise de contact ? (Tapez votre message ou *non*)`;
      }
      conv.state = 'rdv_creneau';
      await conv.save();
      return formatMenuCreneaux(creneaux);
    }

    case 'rdv_creneau': {
      if (text === '0') {
        conv.state = 'menu';
        conv.rdv = {};
        await conv.save();
        return menuPrincipal(prenom);
      }
      const idx = parseInt(text, 10);
      if (isNaN(idx) || idx < 1 || idx > 5) {
        const creneaux = await obtenirCreneauxDisponibles();
        if (creneaux.length === 0) {
          conv.state = 'rdv_note';
          await conv.save();
          return `Aucun creneau n'est disponible en ligne pour le moment.\n\nVous serez contacte tres rapidement par un conseiller. A bientot !\n\nSouhaitez-vous ajouter une precision ? (Tapez votre message ou *non*)`;
        }
        return `Ecrivez un numero entre *1* et *${creneaux.length}*, ou *0* pour annuler.\n\n${formatMenuCreneaux(creneaux)}`;
      }
      const creneaux = await obtenirCreneauxDisponibles();
      const choisi = creneaux[idx - 1];
      if (!choisi) {
        return `Ce creneau n'est plus disponible. Voici les creneaux actuels :\n\n${formatMenuCreneaux(creneaux)}`;
      }
      conv.rdv.date = formatDateFr(choisi.date);
      conv.rdv.heure = choisi.heure;
      conv.rdv.creneauId = choisi._id;
      conv.state = 'rdv_note';
      conv.markModified('rdv');
      await conv.save();
      return `Creneau retenu : *${conv.rdv.date} a ${conv.rdv.heure}* ✅\n\nAvez-vous des precisions a ajouter pour le conseiller ? (Tapez votre message ou *non*)`;
    }

    case 'rdv_note': {
      conv.rdv.note = text === 'non' ? '' : (incomingText || '').trim();
      conv.state = 'rdv_confirm';
      conv.markModified('rdv');
      await conv.save();
      const motifLabel = MOTIFS_LABELS[conv.rdv.motif] || conv.rdv.motif;
      const creneauLine = conv.rdv.date ? `📅 Creneau : *${conv.rdv.date} a ${conv.rdv.heure}*\n` : '';
      return `Voici le recapitulatif de votre demande :\n
👤 Prenom : *${conv.rdv.prenom}*
📋 Motif : *${motifLabel}*
${creneauLine}📱 WhatsApp : *${conv.phone}*
${conv.rdv.note ? `💬 Note : ${conv.rdv.note}\n` : ''}
Confirmez-vous ? Tapez *oui* pour valider ou *non* pour annuler.`;
    }

    case 'rdv_confirm': {
      if (text === 'non') {
        conv.state = 'menu';
        conv.rdv = {};
        await conv.save();
        return `Votre demande a ete annulee. Comment puis-je vous aider ?\n\n${menuPrincipal(prenom)}`;
      }
      if (text === 'oui') {
        await enregistrerDemandeRDV(conv);
        const creneauConfirm = conv.rdv.date
          ? `\n\n📅 Creneau : *${conv.rdv.date} a ${conv.rdv.heure}*`
          : '';
        conv.state = 'menu';
        conv.rdv = {};
        conv.markModified('rdv');
        await conv.save();
        return `✅ *Votre rendez-vous est bien pris en compte.*${creneauConfirm}\n\nTapez *menu* pour revenir au menu principal.`;
      }
      return `Veuillez répondre *oui* pour confirmer ou *non* pour annuler.`;
    }

    case 'contact_name': {
      const nom = (incomingText || '').trim();
      if (nom.length < 2) return `Veuillez indiquer votre prenom et nom.`;
      if (!conv.rdv) conv.rdv = {};
      conv.rdv.prenom = nom;
      conv.markModified('rdv');
      conv.state = 'contact_motif';
      await conv.save();
      return menuContactConseiller(false);
    }

    case 'contact_motif': {
      const MOTIFS_CONTACT_CLIENT = {
        '1': 'Question sur mon dossier en cours',
        '2': 'Premiere prise de contact',
        '3': 'Urgence',
        '4': 'Autre',
      };
      const MOTIFS_CONTACT_VISITEUR = {
        '1': 'Premiere prise de contact',
        '2': 'Urgence',
        '3': 'Autre',
      };
      const MOTIFS_CONTACT = prenom ? MOTIFS_CONTACT_CLIENT : MOTIFS_CONTACT_VISITEUR;
      if (text === 'r') {
        conv.state = 'menu';
        await conv.save();
        return menuPrincipal(prenom);
      }
      const motifContact = MOTIFS_CONTACT[text];
      if (!motifContact) return `Ecrivez un numero pour choisir.\n\n${menuContactConseiller(!!prenom)}`;
      if (!conv.rdv) conv.rdv = {};
      conv.rdv.motif = motifContact;
      conv.markModified('rdv');
      conv.state = 'contact_message';
      await conv.save();
      return `Laissez-nous un message et un conseiller vous recontactera tres rapidement.\n_(Ecrivez votre message ci-dessous)_`;
    }

    case 'contact_message': {
      const msg = (incomingText || '').trim();
      if (!msg) return `Ecrivez votre message pour continuer.`;
      if (text === 'r') {
        conv.state = 'contact_motif';
        await conv.save();
        return menuContactConseiller(!!prenom);
      }
      if (!conv.rdv) conv.rdv = {};
      conv.rdv.note = msg;
      conv.markModified('rdv');
      const nomContact = prenom
        ? `${user.firstName} ${user.lastName || ''}`.trim()
        : conv.rdv?.prenom || conv.contactName || conv.phone;
      await enregistrerContactWA(conv.phone, nomContact, conv.rdv.motif, msg);
      conv.state = 'menu';
      await conv.save();
      return `✅ *Message bien recu.*\n\nVous serez recontacte tres rapidement. A bientot !\n\nTapez *0* pour revenir au menu.`;
    }

    case 'mes_dossiers': {
      return await afficherDossiers(conv, user);
    }

    case 'dossier_select': {
      const dossierCount = conv.docContext?.dossierCount || 5;
      const idx = parseInt(text, 10);
      if (isNaN(idx) || idx < 1 || idx > dossierCount) {
        return `Ecrivez un numero entre *1* et *${dossierCount}*, ou *0* pour revenir au menu.`;
      }
      const Dossier = require('../models/Dossier');
      const dossiers = await Dossier.find({ user: user._id })
        .select('numero titre statut categorie createdAt documents')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
      const dossier = dossiers[idx - 1];
      if (!dossier) {
        conv.state = 'menu';
        await conv.save();
        return menuPrincipal(prenom);
      }
      if (!conv.docContext) conv.docContext = {};
      conv.docContext.dossierId = dossier._id;
      conv.docContext.dossierNumero = dossier.numero || `Dossier ${idx}`;
      conv.state = 'dossier_detail';
      conv.markModified('docContext');
      await conv.save();
      const statutLabel = STATUT_DOSSIER_LABELS[dossier.statut] || dossier.statut || 'En cours';
      const nbDocs = dossier.documents?.length || 0;
      const titre = dossier.titre || dossier.categorie || 'Dossier';
      const numRef = dossier.numero ? `N° ${dossier.numero}` : `Dossier ${idx}`;
      const pendingReqs = await fetchPendingRequests(dossier._id);
      const pendingLine = pendingReqs.length > 0
        ? `\n📩 *${pendingReqs.length} document${pendingReqs.length > 1 ? 's' : ''} demande${pendingReqs.length > 1 ? 's' : ''}* par votre conseiller`
        : '';
      const docsOptLine = nbDocs > 0 ? `\n2️⃣  Voir mes documents (${nbDocs})` : '';
      const retourNum = nbDocs > 0 ? '3' : '2';
      return `📋 *${numRef}*\n_${titre}_\n\n📊 Statut : *${statutLabel}*\n📎 *${nbDocs} document${nbDocs !== 1 ? 's' : ''} fourni${nbDocs !== 1 ? 's' : ''}*${pendingLine}\n\n1️⃣  Ajouter un document${docsOptLine}\n${retourNum}️⃣  Revenir a la liste\n\nEcrivez votre choix, *0* pour le menu.`;
    }

    case 'dossier_detail': {
      if (text === '1') {
        const pendingReqs = await fetchPendingRequests(conv.docContext?.dossierId);
        conv.state = 'doc_choix_type';
        await conv.save();
        return buildDocChoixTypeMenu(pendingReqs, conv.docContext?.dossierNumero);
      }
      if (text === '2') {
        const Dossier = require('../models/Dossier');
        const dos = await Dossier.findById(conv.docContext?.dossierId).select('documents').lean();
        if (dos?.documents?.length > 0) {
          return await afficherDocsDossier(conv, dos.documents);
        }
        return await afficherDossiers(conv, user);
      }
      if (text === '3' || text === 'r') {
        return await afficherDossiers(conv, user);
      }
      return `Ecrivez votre choix, *0* pour le menu.`;
    }

    case 'dossier_docs_list': {
      if (text === 'r') {
        const Dossier = require('../models/Dossier');
        const dos = await Dossier.findById(conv.docContext?.dossierId)
          .select('numero titre statut categorie documents')
          .lean();
        if (!dos) return await afficherDossiers(conv, user);
        const statutLabel = STATUT_DOSSIER_LABELS[dos.statut] || dos.statut || 'En cours';
        const nbDocs = dos.documents?.length || 0;
        const titre = dos.titre || dos.categorie || 'Dossier';
        const numRef = dos.numero ? `N° ${dos.numero}` : 'Dossier';
        const pendingReqs = await fetchPendingRequests(dos._id);
        const pendingLine = pendingReqs.length > 0
          ? `\n📩 *${pendingReqs.length} document${pendingReqs.length > 1 ? 's' : ''} demande${pendingReqs.length > 1 ? 's' : ''}* par votre conseiller`
          : '';
        const docsOptLine = nbDocs > 0 ? `\n2️⃣  Voir mes documents (${nbDocs})` : '';
        const retourNum = nbDocs > 0 ? '3' : '2';
        conv.state = 'dossier_detail';
        await conv.save();
        return `📋 *${numRef}*\n_${titre}_\n\n📊 Statut : *${statutLabel}*\n📎 *${nbDocs} document${nbDocs !== 1 ? 's' : ''} fourni${nbDocs !== 1 ? 's' : ''}*${pendingLine}\n\n1️⃣  Ajouter un document${docsOptLine}\n${retourNum}️⃣  Revenir a la liste\n\nEcrivez votre choix, *0* pour le menu.`;
      }
      const idx = parseInt(text, 10);
      if (isNaN(idx) || idx < 1) {
        return `Ecrivez le numero du document, ou *R* pour revenir au dossier.`;
      }
      const Dossier = require('../models/Dossier');
      const Document = require('../models/Document');
      const dos = await Dossier.findById(conv.docContext?.dossierId).select('documents').lean();
      if (!dos?.documents?.length) {
        conv.state = 'dossier_detail';
        await conv.save();
        return `Aucun document disponible.\n\nTapez *0* pour revenir au menu.`;
      }
      if (idx > dos.documents.length) {
        return `Ecrivez un numero entre *1* et *${dos.documents.length}*, ou *R* pour revenir.`;
      }
      const doc = await Document.findById(dos.documents[idx - 1]).lean();
      if (!doc) return `Ce document n'est plus disponible.\n\nEcrivez un autre numero ou *R* pour revenir.`;
      const { getS3PresignedUrl, isS3Configured } = require('../utils/s3DocumentStorage');
      if (!isS3Configured() || !doc.cheminFichier) {
        return `Ce document n'est pas disponible au telechargement pour le moment.\n\nEcrivez un autre numero ou *R* pour revenir.`;
      }
      const url = await getS3PresignedUrl(doc.cheminFichier, {
        expiresIn: 3600,
        inline: false,
        fileName: doc.nomFichier || doc.nom || 'document',
      });
      if (!url) return `Ce document n'est pas disponible au telechargement pour le moment.\n\nEcrivez un autre numero ou *R* pour revenir.`;
      const nomDoc = doc.nom || doc.nomFichier || `Document ${idx}`;
      return `📄 *${nomDoc}*\n\nLien de telechargement (valable 1h) :\n${url}\n\nEcrivez un autre numero pour telecharger un autre document, ou *R* pour revenir au dossier.`;
    }

    case 'doc_choix_type': {
      if (text === 'r') {
        conv.state = 'dossier_detail';
        await conv.save();
        const numRef = conv.docContext?.dossierNumero ? `N° ${conv.docContext.dossierNumero}` : 'le dossier';
        return `Tapez *1* pour ajouter un document au dossier *${numRef}*, *2* pour la liste, *0* pour le menu.`;
      }
      const pendingReqs = await fetchPendingRequests(conv.docContext?.dossierId);
      const totalOpts = pendingReqs.length + 1;
      const idx = parseInt(text, 10);
      if (isNaN(idx) || idx < 1 || idx > totalOpts) {
        return `Ecrivez un numero entre *1* et *${totalOpts}*, ou *R* pour revenir, *0* pour le menu.\n\n${buildDocChoixTypeMenu(pendingReqs, conv.docContext?.dossierNumero)}`;
      }
      let docType, documentRequestId = '';
      if (idx <= pendingReqs.length) {
        const req = pendingReqs[idx - 1];
        docType = req.documentTypeLabel;
        documentRequestId = req._id.toString();
      } else {
        docType = 'Autre document';
      }
      if (!conv.docContext) conv.docContext = {};
      conv.docContext.docType = docType;
      conv.docContext.documentRequestId = documentRequestId;
      conv.state = 'doc_attente_fichier';
      conv.markModified('docContext');
      await conv.save();
      const dossierRef = conv.docContext.dossierNumero ? `dossier *N° ${conv.docContext.dossierNumero}*` : 'votre dossier';
      return `Envoyez votre *${docType}* en piece jointe (PDF, JPG, PNG - max 10 Mo).\n\nIl sera automatiquement rattache au ${dossierRef}.\n\nTapez *R* pour choisir un autre type, *0* pour annuler.`;
    }

    case 'doc_attente_fichier': {
      if (text === 'r') {
        conv.state = 'doc_choix_type';
        await conv.save();
        return menuTypesDocument();
      }
      const dossierRef = conv.docContext?.dossierNumero ? `dossier *N° ${conv.docContext.dossierNumero}*` : 'votre dossier';
      return `Envoyez votre *${conv.docContext?.docType || 'document'}* en piece jointe pour le ${dossierRef}.\n\nTapez *R* pour choisir un autre type, *0* pour annuler.`;
    }

    default:
      conv.state = 'menu';
      await conv.save();
      return menuPrincipal(prenom);
  }
}

// ─────────────────────────────────────────────
// Dossiers client
// ─────────────────────────────────────────────

async function afficherDossiers(conv, user) {
  if (!user) {
    return `Votre compte n'est pas encore lie a ce numero WhatsApp. Inscrivez-vous sur Ada Papers pour acceder a vos dossiers.\n\nTapez *menu* pour revenir au menu principal.`;
  }
  try {
    const Dossier = require('../models/Dossier');
    const dossiers = await Dossier.find({ user: user._id })
      .select('numero titre statut categorie createdAt')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    if (!dossiers || dossiers.length === 0) {
      return `Vous n'avez pas encore de dossier ouvert chez Ada Papers.\n\nTapez *menu* pour revenir au menu principal.`;
    }

    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
    const lignes = dossiers.map((d, i) => {
      const statutLabel = STATUT_DOSSIER_LABELS[d.statut] || d.statut;
      const num = d.numero ? `N° ${d.numero}` : `Dossier ${i + 1}`;
      const titre = d.titre || d.categorie || 'Dossier';
      return `${emojis[i]}  *${num}* - ${titre}\n   Statut : _${statutLabel}_`;
    });

    if (!conv.docContext) conv.docContext = {};
    conv.docContext.dossierCount = dossiers.length;
    conv.state = 'dossier_select';
    conv.markModified('docContext');
    await conv.save();

    return `📂 *Vos dossiers Ada Papers*\n\n${lignes.join('\n\n')}\n\nSelectionnez un dossier pour voir son avancement et ajouter des documents.\n\nTapez *0* pour revenir au menu.`;
  } catch (err) {
    console.error('[WhatsApp] Erreur affichage dossiers:', err.message);
    return `Impossible de charger vos dossiers pour l'instant. Reessayez plus tard.\n\nTapez *0* pour revenir au menu principal.`;
  }
}

// ─────────────────────────────────────────────
// Persistance
// ─────────────────────────────────────────────

async function notifierAdminsRDV(rendezVous, motifLabel) {
  try {
    const User = require('../models/User');
    const Notification = require('../models/Notification');
    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } }).select('_id').lean();
    if (!admins.length) return;

    const dateLabel = new Date(rendezVous.date).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    const message = `${rendezVous.prenom} (${rendezVous.telephone}) a demande un rendez-vous via WhatsApp le ${dateLabel} a ${rendezVous.heure}. Motif : ${motifLabel}.`;

    const docs = admins.map((admin) => ({
      user: admin._id,
      type: 'appointment_created',
      titre: 'Nouveau rendez-vous WhatsApp',
      message,
      lien: '/admin/rendez-vous',
      lue: false,
      metadata: {
        appointmentId: rendezVous._id.toString(),
        telephone: rendezVous.telephone,
        date: rendezVous.date,
        heure: rendezVous.heure,
        motif: rendezVous.motif,
        source: 'whatsapp',
      },
    }));
    await Notification.insertManyWithPush(docs);
  } catch (e) {
    console.warn('[WhatsApp] Erreur notification admins RDV:', e.message);
  }
}

async function enregistrerDemandeRDV(conv) {
  try {
    const RendezVous = require('../models/RendezVous');
    let dateRdv = new Date();
    dateRdv.setDate(dateRdv.getDate() + 3);
    let heureRdv = 'A definir';

    if (conv.rdv.creneauId) {
      try {
        const Creneau = require('../models/Creneau');
        const creneau = await Creneau.findById(conv.rdv.creneauId);
        if (creneau && !creneau.ferme) {
          dateRdv = creneau.date;
          heureRdv = creneau.heure;
          creneau.ferme = true;
          creneau.motifFermeture = `Reserve WhatsApp ${conv.phone}`;
          await creneau.save();
        }
      } catch (e) {
        console.warn('[WhatsApp] Impossible de reserver le creneau:', e.message);
      }
    }

    const rdv = await RendezVous.create({
      nom: conv.rdv.prenom,
      prenom: conv.rdv.prenom,
      email: `whatsapp_${conv.phone.replace(/\D/g, '')}@adapapers.placeholder`,
      telephone: conv.phone,
      date: dateRdv,
      heure: heureRdv,
      motif: conv.rdv.motif || 'autre',
      description: conv.rdv.note || '',
      notes: `Demande via WhatsApp — ${conv.phone}${conv.rdv.date ? ` — Creneau : ${conv.rdv.date} a ${conv.rdv.heure}` : ''}`,
      statut: 'en_attente',
    });
    console.log(`[WhatsApp] RDV enregistre pour ${conv.phone}`);

    // Notifications in-app + push pour tous les admins
    const motifLabel = MOTIFS_LABELS[rdv.motif] || rdv.motif;
    await notifierAdminsRDV(rdv, motifLabel);

    // Sync Google Calendar (non bloquant)
    try {
      const { syncAppointmentGoogleCalendar } = require('../services/googleCalendarSync');
      syncAppointmentGoogleCalendar(rdv, (m) => MOTIFS_LABELS[m] || m).catch((e) =>
        console.warn('[WhatsApp] Google Calendar sync RDV:', e.message)
      );
    } catch (e) {
      console.warn('[WhatsApp] Google Calendar sync RDV (import):', e.message);
    }
  } catch (err) {
    console.error('[WhatsApp] Erreur enregistrement RDV:', err.message);
  }
}

async function enregistrerContactWA(phone, nom, motif, message) {
  try {
    const User = require('../models/User');
    const Notification = require('../models/Notification');
    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } }).select('_id').lean();
    if (!admins.length) return;

    const motifLine = motif ? ` - ${motif}` : '';
    const msgLine = message ? `\nMessage : "${message}"` : '';
    const docs = admins.map((admin) => ({
      user: admin._id,
      type: 'whatsapp_contact',
      titre: 'Demande de contact WhatsApp',
      message: `${nom} (${phone}) souhaite etre contacte par un conseiller${motifLine}.${msgLine}`,
      lien: '/admin/whatsapp',
      lue: false,
      metadata: { phone, nom, motif: motif || '', message: message || '', source: 'whatsapp' },
    }));
    await Notification.insertManyWithPush(docs);
  } catch (err) {
    console.error('[WhatsApp] Erreur notification contact:', err.message);
  }
}

async function traiterDocumentRecu(conv, user) {
  try {
    const lastMsg = conv.messages[conv.messages.length - 1];
    const mediaId = lastMsg?.mediaId;
    if (!mediaId) {
      conv.state = 'menu';
      await conv.save();
      return `Votre document a bien ete recu. Un conseiller Ada Papers va l'examiner.\n\nTapez *0* pour revenir au menu.`;
    }

    const docType = conv.docContext?.docType || 'Autre document';
    const dossierId = conv.docContext?.dossierId;
    const dossierNumero = conv.docContext?.dossierNumero || '';
    const token = process.env.WHATSAPP_TOKEN;

    let cheminFichier = `whatsapp:${mediaId}`;
    let taille = 0;
    let mimeType = lastMsg.mimeType || 'application/octet-stream';
    const baseNom = `${Date.now()}_${docType.replace(/[^\w]/g, '_')}`;
    let safeName = `${baseNom}.bin`;

    // Telecharger depuis Meta et uploader sur S3
    try {
      const { uploadBufferToS3, isS3Configured } = require('../utils/s3DocumentStorage');
      if (token && isS3Configured()) {
        const metaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (metaRes.ok) {
          const meta = await metaRes.json();
          if (meta.mime_type) mimeType = meta.mime_type;
          const ext = getExtFromMime(mimeType);
          safeName = `${baseNom}.${ext}`;
          if (meta.url) {
            const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
            if (fileRes.ok) {
              const buffer = Buffer.from(await fileRes.arrayBuffer());
              taille = buffer.length;
              cheminFichier = await uploadBufferToS3(buffer, {
                fileName: safeName,
                contentType: mimeType,
                subfolder: 'whatsapp-docs',
              });
            }
          }
        }
      }
    } catch (uploadErr) {
      console.warn('[WhatsApp] Upload S3 echoue, conservation du mediaId:', uploadErr.message);
    }

    // Creer le document en base et l'attacher au dossier
    try {
      const Document = require('../models/Document');
      const Dossier = require('../models/Dossier');
      const doc = await Document.create({
        user: user._id,
        nom: docType,
        nomFichier: safeName,
        originalName: lastMsg.filename || safeName,
        cheminFichier,
        typeMime: mimeType,
        taille,
        description: `Envoye via WhatsApp${dossierNumero ? ` pour dossier N° ${dossierNumero}` : ''}`,
        categorie: mapDocTypeToCategorie(docType),
        dossierId: dossierId || null,
      });
      if (dossierId) {
        await Dossier.findByIdAndUpdate(dossierId, { $addToSet: { documents: doc._id } });
      }
      if (conv.docContext?.documentRequestId) {
        try {
          const DocumentRequest = require('../models/DocumentRequest');
          await DocumentRequest.findByIdAndUpdate(conv.docContext.documentRequestId, {
            status: 'received',
            document: doc._id,
            receivedAt: new Date(),
          });
        } catch (e) {
          console.warn('[WhatsApp] Mise a jour DocumentRequest:', e.message);
        }
      }
      await notifierAdminsDocument(conv, docType, dossierNumero, doc._id);
    } catch (dbErr) {
      console.error('[WhatsApp] Erreur creation document en base:', dbErr.message);
    }

    conv.state = 'dossier_detail';
    conv.markModified('docContext');
    await conv.save();

    const dossierRef = dossierNumero ? `dossier *N° ${dossierNumero}*` : 'votre dossier';
    return `✅ *${docType}* recu et rattache au ${dossierRef}.\n\nVotre conseiller en sera notifie.\n\nTapez *1* pour ajouter un autre document, *0* pour revenir au menu.`;
  } catch (err) {
    console.error('[WhatsApp] Erreur traiterDocumentRecu:', err.message);
    conv.state = 'menu';
    await conv.save();
    return `Votre document a bien ete recu. Un conseiller Ada Papers va l'examiner.\n\nTapez *0* pour revenir au menu.`;
  }
}

async function notifierAdminsDocument(conv, docType, dossierNumero, docId) {
  try {
    const User = require('../models/User');
    const Notification = require('../models/Notification');
    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } }).select('_id').lean();
    if (!admins.length) return;
    const ref = dossierNumero ? `dossier N° ${dossierNumero}` : 'un dossier';
    const message = `${conv.contactName || conv.phone} a envoye un document via WhatsApp pour ${ref} : ${docType}.`;
    const docs = admins.map((admin) => ({
      user: admin._id,
      type: 'document_uploaded',
      titre: 'Nouveau document WhatsApp',
      message,
      lien: '/admin/whatsapp',
      lue: false,
      metadata: { phone: conv.phone, docType, dossierNumero, docId: docId?.toString(), source: 'whatsapp' },
    }));
    await Notification.insertManyWithPush(docs);
  } catch (e) {
    console.warn('[WhatsApp] Erreur notification document:', e.message);
  }
}

module.exports = { sendMessage, sendMediaMessage, handleIncomingMessage, sendProactiveMessage };
