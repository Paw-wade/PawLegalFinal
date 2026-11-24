const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

/**
 * Envoie un message texte WhatsApp via la Cloud API Meta et le persiste dans la conversation.
 */
async function sendMessage(to, text, conv) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) {
    console.warn('WhatsApp: WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_TOKEN manquant');
    return;
  }
  await axios.post(
    `${BASE_URL}/${phoneId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  if (conv) {
    conv.messages.push({ direction: 'outbound', type: 'text', content: text, timestamp: new Date() });
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
  const salut = prenom ? `Bonjour *${prenom}* 👋` : `Bonjour et bienvenue chez *Ada Papers* 👋`;
  if (prenom) {
    return `${salut}

Je suis votre assistant juridique. Comment puis-je vous aider ?

1️⃣  Prendre un rendez-vous
2️⃣  Faire une demande
3️⃣  Mes dossiers
4️⃣  Parler a un conseiller

Ecrivez *1*, *2*, *3* ou *4* pour choisir.`;
  }
  return `${salut}

Je suis votre assistant juridique. Comment puis-je vous aider ?

1️⃣  Prendre un rendez-vous
2️⃣  Faire une demande
3️⃣  Parler a un conseiller

Ecrivez *1*, *2* ou *3* pour choisir.`;
}

const DEMANDE_MENU = `Quelle est votre situation ?

*Droit des etrangers :*
1️⃣  Titre de sejour (1re demande, renouvellement, changement)
2️⃣  Carte de resident
3️⃣  Nationalite francaise
4️⃣  Regroupement familial

*Recours :*
5️⃣  OQTF (obligation de quitter le territoire)
6️⃣  Refus de visa
7️⃣  Absence de reponse a une demande de titre de sejour

*Demande de visa :*
8️⃣  Visa France - Senegal
9️⃣  Visa France - Etats-Unis

*Creation d'entreprise :*
10.  Societe / entreprise en France
11.  Societe / entreprise au Senegal

0️⃣  Retour au menu principal

Ecrivez le numero de votre choix.`;

const DEMANDE_REPONSES = {
  '1': { label: 'titre de sejour', detail: 'premiere demande, renouvellement ou changement de statut' },
  '2': { label: 'carte de resident', detail: 'carte de resident 10 ans' },
  '3': { label: 'nationalite francaise', detail: 'acquisition de la nationalite par naturalisation ou mariage' },
  '4': { label: 'regroupement familial', detail: 'faire venir vos proches en France' },
  '5': { label: 'contestation d\'OQTF', detail: 'recours contre une obligation de quitter le territoire' },
  '6': { label: 'recours refus de visa', detail: 'contester un refus de visa devant la CRRV ou le tribunal administratif' },
  '7': { label: 'recours absence de reponse (titre de sejour)', detail: 'silence de la prefecture valant rejet apres 4 mois' },
  '8': { label: 'visa France - Senegal', detail: 'visa de court ou long sejour pour entrer en France depuis le Senegal' },
  '9': { label: 'visa France - Etats-Unis', detail: 'visa de court ou long sejour pour entrer en France depuis les Etats-Unis' },
  '10': { label: 'creation de societe en France', detail: 'SARL, SAS, SCI ou auto-entrepreneur' },
  '11': { label: 'creation de societe au Senegal', detail: 'SARL, SUARL ou SAS au Senegal' },
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
  '1': 'conteste_oqtf',
  '2': 'conteste_refus_visa',
  '3': 'renouvellement_titre',
  '4': 'premiere_demande_titre',
  '5': 'regroupement_familial',
  '6': 'autre',
};

const MOTIFS_LABELS = {
  conteste_oqtf: 'OQTF',
  conteste_refus_visa: 'Visa refusé',
  renouvellement_titre: 'Renouvellement titre de séjour',
  premiere_demande_titre: 'Première demande de titre',
  regroupement_familial: 'Regroupement familial',
  autre: 'Autre',
};

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
    // Fallback : recherche par numero si la conversation n'est pas encore liee
    const user = await User.findOne({ phone: conv.phone }).select('_id firstName lastName phone').lean();
    if (user) {
      // Lier pour les prochains messages
      conv.clientId = user._id;
      conv.contactName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      await conv.save();
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
  // Pour les types medias, accuse de reception simple
  if (messageType && messageType !== 'text') {
    const typeLabels = {
      image: 'photo',
      document: 'document',
      audio: 'message vocal',
      video: 'video',
      sticker: 'sticker',
    };
    const label = typeLabels[messageType] || 'fichier';
    return `Merci, nous avons bien recu votre ${label}. Un conseiller le consultera prochainement.\n\nTapez *menu* pour revenir au menu principal.`;
  }

  const text = (incomingText || '').trim().toLowerCase();

  // Identifier l'utilisateur lie a ce numero
  const user = await resolveUser(conv);
  const prenom = user?.firstName || null;

  if (text === 'menu' || text === '0') {
    conv.state = 'menu';
    conv.rdv = {};
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
          return `Pour beneficier de l'accompagnement personnalise d'Ada Papers, nous vous recommandons de creer votre compte sur *ada-papers.com*.\n\nCela vous permettra de suivre vos dossiers et d'etre reconnu automatiquement.\n\nSi vous souhaitez quand meme prendre un rendez-vous, tapez votre *prenom* pour commencer.`;
        }
        conv.rdv.prenom = prenom;
        conv.state = 'rdv_motif';
        conv.markModified('rdv');
        await conv.save();
        return `Pour quel motif souhaitez-vous un rendez-vous, *${prenom}* ?\n\n1️⃣  OQTF\n2️⃣  Visa refuse\n3️⃣  Renouvellement titre de sejour\n4️⃣  Premiere demande de titre\n5️⃣  Regroupement familial\n6️⃣  Autre\n\nEcrivez le numero de votre choix.`;
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
        return `Pour beneficier de l'accompagnement personnalise d'Ada Papers, nous vous recommandons de creer votre compte sur *ada-papers.com*.\n\nCela vous permettra de suivre vos dossiers et d'etre reconnu automatiquement.\n\nSi vous souhaitez quand meme parler a un conseiller, tapez votre *prenom et nom*.`;
      }
      // Option 4 : Parler a un conseiller (utilisateur reconnu uniquement)
      if (text === '4' && prenom) {
        await enregistrerContactWA(conv.phone, `${user.firstName} ${user.lastName || ''}`.trim());
        conv.state = 'menu';
        await conv.save();
        return `Merci *${prenom}* ! Un conseiller vous contactera dans les *24h*.\n\nTapez *menu* pour revenir au menu principal.`;
      }
      return `Ecrivez *1*, *2*${prenom ? ', *3* ou *4*' : ' ou *3*'} pour choisir.\n\n${menuPrincipal(prenom)}`;
    }

    case 'demande_menu': {
      if (text === '0') {
        conv.state = 'menu';
        await conv.save();
        return menuPrincipal(prenom);
      }
      const demande = DEMANDE_REPONSES[text];
      if (!demande) {
        return `Ecrivez un numero entre *1* et *9*, ou *0* pour revenir.\n\n${DEMANDE_MENU}`;
      }
      conv.state = 'menu';
      await conv.save();
      const compteMsg = !prenom
        ? `\n\n💡 _Creez votre compte sur *ada-papers.com* pour suivre l'avancement de votre dossier en temps reel._`
        : '';
      return `Pour votre demande de *${demande.label}* (${demande.detail}), rendez-vous sur :\n\n👉 *ada-papers.com/nouvelle-demande*\n\nRemplissez le formulaire en ligne. Notre equipe traitera votre dossier sous *48h* et vous recontactera.${compteMsg}\n\nTapez *menu* pour revenir au menu principal.`;
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
      return `Merci *${conv.rdv.prenom}* ! Pour quel motif souhaitez-vous un rendez-vous ?\n\n1️⃣  OQTF\n2️⃣  Visa refuse\n3️⃣  Renouvellement titre de sejour\n4️⃣  Premiere demande de titre\n5️⃣  Regroupement familial\n6️⃣  Autre\n\nEcrivez le numero de votre choix.`;
    }

    case 'rdv_motif': {
      const motif = MOTIFS_RDV[text];
      if (!motif) return `Ecrivez un numero entre *1* et *6* pour choisir le motif.`;
      conv.rdv.motif = motif;
      conv.state = 'rdv_tel';
      conv.markModified('rdv');
      await conv.save();
      return `Votre numéro de téléphone pour la confirmation (ex: 06 12 34 56 78) ?`;
    }

    case 'rdv_tel': {
      const tel = incomingText ? incomingText.trim().replace(/\s/g, '') : '';
      if (tel.length < 8) return `Veuillez indiquer un numéro de téléphone valide.`;
      conv.rdv.telephone = tel;
      conv.state = 'rdv_note';
      conv.markModified('rdv');
      await conv.save();
      return `Avez-vous des précisions à ajouter pour le conseiller ? (Tapez votre message ou *non*)`;
    }

    case 'rdv_note': {
      conv.rdv.note = text === 'non' ? '' : (incomingText || '').trim();
      conv.state = 'rdv_confirm';
      conv.markModified('rdv');
      await conv.save();
      const motifLabel = MOTIFS_LABELS[conv.rdv.motif] || conv.rdv.motif;
      return `Voici le récapitulatif de votre demande :\n
👤 Prénom : *${conv.rdv.prenom}*
📋 Motif : *${motifLabel}*
📱 Téléphone : *${conv.rdv.telephone}*
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
        conv.state = 'menu';
        conv.rdv = {};
        conv.markModified('rdv');
        await conv.save();
        return `✅ *Votre demande de rendez-vous a bien été enregistrée !*

Un conseiller Ada Papers vous contactera sous *48h* au numéro que vous avez indiqué.

Tapez *menu* à tout moment pour revenir au menu principal.`;
      }
      return `Veuillez répondre *oui* pour confirmer ou *non* pour annuler.`;
    }

    case 'contact_name': {
      const nom = (incomingText || '').trim();
      if (nom.length < 2) return `Veuillez indiquer votre prenom et nom.`;
      await enregistrerContactWA(conv.phone, nom);
      conv.state = 'menu';
      await conv.save();
      return `Merci *${nom}* ! Un conseiller vous contactera dans les *24h*.\n\nTapez *menu* pour revenir au menu principal.`;
    }

    case 'mes_dossiers': {
      conv.state = 'menu';
      await conv.save();
      return await afficherDossiers(conv, user);
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

    const lignes = dossiers.map((d, i) => {
      const statutLabel = STATUT_DOSSIER_LABELS[d.statut] || d.statut;
      const num = d.numero ? `N° ${d.numero}` : `Dossier ${i + 1}`;
      const titre = d.titre || d.categorie || 'Dossier';
      return `${i + 1}. *${num}* - ${titre}\n   Statut : _${statutLabel}_`;
    });

    return `📂 *Vos dossiers Ada Papers*\n\n${lignes.join('\n\n')}\n\nPour plus de details, connectez-vous sur ada-papers.com\n\nTapez *menu* pour revenir au menu principal.`;
  } catch (err) {
    console.error('[WhatsApp] Erreur affichage dossiers:', err.message);
    return `Impossible de charger vos dossiers pour l'instant. Reessayez plus tard.\n\nTapez *menu* pour revenir au menu principal.`;
  }
}

// ─────────────────────────────────────────────
// Persistance
// ─────────────────────────────────────────────

async function enregistrerDemandeRDV(conv) {
  try {
    const RendezVous = require('../models/RendezVous');
    const dateProvisoire = new Date();
    dateProvisoire.setDate(dateProvisoire.getDate() + 3);

    await RendezVous.create({
      nom: conv.rdv.prenom,
      prenom: conv.rdv.prenom,
      email: `whatsapp_${conv.phone.replace(/\D/g, '')}@adapapers.placeholder`,
      telephone: conv.rdv.telephone || conv.phone,
      date: dateProvisoire,
      heure: 'À définir',
      motif: conv.rdv.motif || 'autre',
      description: conv.rdv.note || '',
      notes: `Demande via WhatsApp — ${conv.phone}`,
      statut: 'en_attente',
    });
    console.log(`[WhatsApp] RDV enregistré pour ${conv.phone}`);
  } catch (err) {
    console.error('[WhatsApp] Erreur enregistrement RDV:', err.message);
  }
}

async function enregistrerContactWA(phone, nom) {
  try {
    const Notification = require('../models/Notification');
    await Notification.create({
      type: 'whatsapp_contact',
      message: `Demande de contact WhatsApp de *${nom}* (${phone})`,
      lue: false,
    });
  } catch (err) {
    console.error('[WhatsApp] Erreur notification contact:', err.message);
  }
}

module.exports = { sendMessage, handleIncomingMessage, sendProactiveMessage };
