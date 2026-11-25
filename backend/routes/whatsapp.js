const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const WhatsappConversation = require('../models/WhatsappConversation');
const { sendMessage, handleIncomingMessage } = require('../services/whatsappService');

const CODE_REGEX = /^(?:verif(?:ier|ication|)?\s*:?\s*)?(\d{6})$/i;

function normalizeWaPhone(from) {
  return from.startsWith('+') ? from : '+' + from;
}

async function handleVerificationCode(from, code) {
  const OTP = require('../models/OTP');
  const User = require('../models/User');

  const phone = normalizeWaPhone(from);

  const otp = await OTP.findOne({ phone, verified: false }).select('+waToken +resetToken');
  if (!otp) return null;

  if (new Date() > otp.expiresAt) {
    await OTP.deleteOne({ _id: otp._id });
    const ctx = otp.purpose === 'reset' ? 'reinitialisation' : 'inscription';
    return `Ce code a expire. Recommencez la ${ctx} sur Ada Papers.`;
  }

  if (otp.attempts >= 5) {
    return 'Trop d\'essais. Demandez un nouveau code sur Ada Papers.';
  }

  if (otp.code !== code) {
    otp.attempts += 1;
    await otp.save();
    const restants = 5 - otp.attempts;
    return `Code incorrect (${restants} essai${restants > 1 ? 's' : ''} restant${restants > 1 ? 's' : ''}).`;
  }

  // Flux reinitialisation de mot de passe
  if (otp.purpose === 'reset') {
    const user = await User.findOne({ phone });
    if (!user) {
      await OTP.deleteOne({ _id: otp._id });
      return 'Aucun compte associe a ce numero. Inscrivez-vous sur Ada Papers.';
    }
    const resetToken = jwt.sign(
      { id: user._id.toString(), purpose: 'reset' },
      process.env.JWT_SECRET || 'your-secret-key-here',
      { expiresIn: '15m' }
    );
    otp.waVerified = true;
    otp.resetToken = resetToken;
    otp.verified = true;
    otp.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await otp.save();
    console.log(`[WhatsApp] Reset mot de passe verifie via WhatsApp pour ${phone}`);
    return `Votre identite est confirmee ! Retournez sur Ada Papers pour choisir votre nouveau mot de passe.`;
  }

  // Flux inscription (verify)
  const existingByEmail = otp.email
    ? await User.findOne({ email: otp.email })
    : null;

  if (existingByEmail) {
    await OTP.deleteOne({ _id: otp._id });
    return 'Un compte existe deja avec cet email. Connectez-vous sur Ada Papers.';
  }

  let user = await User.findOne({ phone });

  if (!user) {
    const userData = {
      firstName: otp.firstName,
      lastName: otp.lastName,
      phone,
      phoneVerified: true,
      needsPasswordSetup: true,
      role: 'client',
      profilComplete: false,
      whatsappPhone: phone,
      whatsappLinkedAt: new Date(),
    };
    if (otp.email) userData.email = otp.email;
    user = await User.create(userData);
  } else {
    user.phoneVerified = true;
    if (!user.email && otp.email) user.email = otp.email;
    await User.updateOne(
      { _id: user._id },
      {
        $set: { whatsappPhone: phone, whatsappLinkedAt: new Date(), whatsappUnlinkedPhone: null },
      }
    );
    await user.save();
  }

  const token = jwt.sign(
    { id: user._id.toString() },
    process.env.JWT_SECRET || 'your-secret-key-here',
    { expiresIn: process.env.JWT_EXPIRES_IN || '90d' }
  );

  otp.waVerified = true;
  otp.waToken = token;
  otp.verified = true;
  otp.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await otp.save();

  // Lier le compte et le dossier le plus recent a la conversation WhatsApp
  try {
    const WhatsappConversation = require('../models/WhatsappConversation');
    const update = { clientId: user._id, contactName: `${user.firstName || ''} ${user.lastName || ''}`.trim() };

    const phoneAltCheck = phone.startsWith('+') ? phone.slice(1) : '+' + phone;
    const existing = await WhatsappConversation.findOne({ phone: { $in: [phone, phoneAltCheck] } }).select('dossierId').lean();
    if (!existing?.dossierId) {
      const Dossier = require('../models/Dossier');
      const dossier = await Dossier.findOne({ user: user._id }).sort({ createdAt: -1 }).select('_id').lean();
      if (dossier) update.dossierId = dossier._id;
    }

    const phoneAlt = phone.startsWith('+') ? phone.slice(1) : '+' + phone;
    await WhatsappConversation.findOneAndUpdate(
      { phone: { $in: [phone, phoneAlt] } },
      update
    );
  } catch (e) {
    console.warn('[WhatsApp] Impossible de lier clientId a la conversation:', e.message);
  }

  console.log(`[WhatsApp] Compte verifie via WhatsApp pour ${phone}`);
  return `Votre compte Ada Papers est active ! Retournez sur le site, vous etes maintenant connecte.`;
}

// ─────────────────────────────────────────────
// GET /api/webhook/whatsapp
// Vérification du webhook par Meta
// ─────────────────────────────────────────────
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook vérifié par Meta');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ─────────────────────────────────────────────
// POST /api/webhook/whatsapp
// Réception des messages entrants (texte + médias)
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value || !value.messages) continue;

        for (const msg of value.messages) {
          const rawFrom = msg.from || '';
          const from = rawFrom.startsWith('+') ? rawFrom : '+' + rawFrom;
          const msgType = msg.type || 'unknown';

          let conv = await WhatsappConversation.findOne({ phone: from });
          if (!conv || conv.isExpired()) {
            if (conv) {
              conv.state = 'menu';
              conv.rdv = {};
            } else {
              conv = new WhatsappConversation({ phone: from, state: 'menu' });
            }
          }
          conv.lastActivity = new Date();
          conv.unreadAdmin = (conv.unreadAdmin || 0) + 1;

          // Extraire le nom du contact si disponible dans les contacts
          if (value.contacts && value.contacts.length > 0) {
            const contact = value.contacts.find((c) => c.wa_id === from);
            if (contact && contact.profile && contact.profile.name) {
              conv.contactName = contact.profile.name;
            }
          }

          // Construire l'entree de message entrant
          const msgEntry = {
            direction: 'inbound',
            type: msgType,
            timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date(),
            waMessageId: msg.id || '',
            replyToWaId: msg.context?.id || '',
          };

          if (msgType === 'text') {
            msgEntry.content = msg.text?.body || '';
          } else if (msgType === 'image') {
            msgEntry.content = msg.image?.caption || '';
            msgEntry.mediaId = msg.image?.id || '';
            msgEntry.mimeType = msg.image?.mime_type || '';
          } else if (msgType === 'document') {
            msgEntry.content = msg.document?.caption || '';
            msgEntry.mediaId = msg.document?.id || '';
            msgEntry.filename = msg.document?.filename || '';
            msgEntry.mimeType = msg.document?.mime_type || '';
          } else if (msgType === 'audio') {
            msgEntry.mediaId = msg.audio?.id || '';
            msgEntry.mimeType = msg.audio?.mime_type || '';
          } else if (msgType === 'video') {
            msgEntry.content = msg.video?.caption || '';
            msgEntry.mediaId = msg.video?.id || '';
            msgEntry.mimeType = msg.video?.mime_type || '';
          } else if (msgType === 'sticker') {
            msgEntry.mediaId = msg.sticker?.id || '';
          } else if (msgType === 'location') {
            const loc = msg.location || {};
            msgEntry.content = `Localisation: ${loc.latitude}, ${loc.longitude}${loc.name ? ` (${loc.name})` : ''}`;
          }

          conv.messages.push(msgEntry);

          const incomingText = msgType === 'text' ? (msg.text?.body || '') : null;

          // Interception prioritaire : code de verification a 6 chiffres
          if (incomingText) {
            const codeMatch = CODE_REGEX.exec(incomingText.trim());
            if (codeMatch) {
              const verifReply = await handleVerificationCode(from, codeMatch[1]);
              if (verifReply !== null) {
                conv.messages.push({ direction: 'outbound', type: 'text', content: verifReply, timestamp: new Date() });
                await conv.save();
                await sendMessage(from, verifReply);
                continue;
              }
            }
          }

          // Si un conseiller a pris la main, ne pas repondre avec le bot
          if (conv.humanMode) {
            await conv.save();
            continue;
          }

          const reply = await handleIncomingMessage(conv, incomingText, msgType);

          // Persister avant d'envoyer la réponse
          await conv.save();

          // Ajouter le message sortant dans l'historique et envoyer
          conv.messages.push({ direction: 'outbound', type: 'text', content: reply, timestamp: new Date() });
          await conv.save();

          await sendMessage(from, reply);
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp] Erreur traitement webhook:', err.message);
  }
});

module.exports = router;
