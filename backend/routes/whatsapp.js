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
// Réception des messages entrants
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  // Accusé de réception immédiat (Meta exige < 20s)
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value || !value.messages) continue;

        for (const msg of value.messages) {
          if (msg.type !== 'text') continue;

          const from = msg.from; // numéro WhatsApp de l'expéditeur
          const text = msg.text?.body || '';

          // Charge ou crée la conversation
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

          const reply = await handleIncomingMessage(conv, text);
          await sendMessage(from, reply);
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp] Erreur traitement webhook:', err.message);
  }
});

module.exports = router;
