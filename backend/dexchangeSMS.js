// dexchangeSMS.js
// Envoi de SMS via Dexchange (opérateur SMS pour le Sénégal, +221).
// Twilio ne desservant pas le Sénégal, sendSMS route les numéros +221 ici.
const axios = require('axios');

const DEXCHANGE_BASE_URL = process.env.DEXCHANGE_SMS_BASE_URL || 'https://api-v2.dexchange-sms.com/api/v1/';
const DEXCHANGE_API_KEY = process.env.DEXCHANGE_SMS_API_KEY;
const DEXCHANGE_SIGNATURE = process.env.DEXCHANGE_SMS_SIGNATURE || 'AdaPapers';

// Client axios initialisé de manière paresseuse.
let client = null;

function getDexchangeClient() {
  if (client !== null) {
    return client;
  }

  if (!DEXCHANGE_API_KEY) {
    console.warn('⚠️ Dexchange non configuré : DEXCHANGE_SMS_API_KEY doit être défini dans .env');
    return null;
  }

  try {
    client = axios.create({
      baseURL: DEXCHANGE_BASE_URL,
      headers: {
        Authorization: `Bearer ${DEXCHANGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    });
    console.log('✅ Client Dexchange SMS initialisé avec succès');
    return client;
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation du client Dexchange:', error.message);
    return null;
  }
}

/**
 * Envoie un SMS via Dexchange.
 * @param {string} to - numéro au format international, ex: '+221771234567'
 * @param {string} body - message à envoyer
 * @param {object} options - options supplémentaires (signature)
 * @returns {Promise<object>} - résultat normalisé (compatible avec sendSMS/Twilio)
 */
async function sendDexchangeSMS(to, body, options = {}) {
  const dexClient = getDexchangeClient();
  if (!dexClient) {
    throw new Error("Dexchange n'est pas configuré. Vérifiez la variable d'environnement DEXCHANGE_SMS_API_KEY.");
  }

  if (!to) {
    throw new Error('Le numéro de téléphone du destinataire est requis.');
  }

  if (!body || body.trim().length === 0) {
    throw new Error('Le message SMS ne peut pas être vide.');
  }

  // Dexchange attend le numéro sans le préfixe « + », ex: 221771234567
  const number = String(to).replace(/^\+/, '').replace(/[\s\-\.\(\)]/g, '');
  const signature = options.signature || DEXCHANGE_SIGNATURE;

  const payload = {
    number: [number],
    signature,
    content: body.trim(),
  };

  try {
    const response = await dexClient.post('send/sms', payload);
    const data = response?.data || {};

    // L'identifiant de message renvoyé par l'API v2 est « smsID ».
    const messageId =
      data.smsID || data.id || data.messageId || data.uuid || data?.data?.id || data?.data?.uuid || null;

    console.log('✅ SMS Dexchange envoyé avec succès:');
    console.log(`   - À: +${number}`);
    console.log(`   - Signature: ${signature}`);
    console.log(`   - ID: ${messageId || 'n/a'}`);

    return {
      success: true,
      provider: 'dexchange',
      sid: messageId ? String(messageId) : `dex_${Date.now()}`,
      status: 'sent',
      to: `+${number}`,
      from: signature,
      body: body.trim(),
      raw: data,
    };
  } catch (error) {
    const apiMessage =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      (typeof error?.response?.data === 'string' ? error.response.data : null) ||
      error.message;
    console.error('❌ Erreur lors de l\'envoi du SMS Dexchange:', apiMessage);
    throw new Error(`Erreur Dexchange: ${apiMessage}`);
  }
}

module.exports = {
  sendDexchangeSMS,
};
