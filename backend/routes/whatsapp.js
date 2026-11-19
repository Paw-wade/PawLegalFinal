const express = require('express');
const router = express.Router();
const WhatsappConversation = require('../models/WhatsappConversation');
const { sendMessage, handleIncomingMessage } = require('../services/whatsappService');

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
          const from = msg.from;
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
