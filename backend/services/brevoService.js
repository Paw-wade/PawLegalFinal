let brevoSdk = null;

function getBrevo() {
  if (brevoSdk !== null) return brevoSdk;
  try {
    const mod = require('@getbrevo/brevo');
    brevoSdk = mod?.default || mod;
    return brevoSdk;
  } catch (err) {
    if (err?.code === 'MODULE_NOT_FOUND') {
      const hint = new Error(
        '@getbrevo/brevo absent : dans le dossier backend, exécutez `npm install` puis redémarrez le process (ex. pm2).'
      );
      hint.code = 'BREVO_SDK_MISSING';
      throw hint;
    }
    throw err;
  }
}

/** @type {Map<string, object>} */
const apiByKey = new Map();

const DEFAULT_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'contact@adapapers.fr';
const DEFAULT_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Ada Papers';

function createTransactionalApi(apiKey) {
  const Brevo = getBrevo();

  if (Brevo?.ApiClient?.instance?.authentications?.['api-key'] && Brevo?.TransactionalEmailsApi) {
    const client = Brevo.ApiClient.instance;
    const prev = client.authentications['api-key']?.apiKey;
    client.authentications['api-key'].apiKey = apiKey;
    const api = new Brevo.TransactionalEmailsApi();
    if (prev !== undefined) client.authentications['api-key'].apiKey = prev;
    return api;
  }

  if (typeof Brevo?.BrevoClient === 'function') {
    const modernClient = new Brevo.BrevoClient({ apiKey });
    return modernClient.transactionalEmails;
  }

  throw new Error('SDK Brevo incompatible');
}

function getTransactionalApi(apiKeyOverride) {
  const apiKey =
    (apiKeyOverride && String(apiKeyOverride).trim()) ||
    process.env.BREVO_API_KEY ||
    process.env.SENDINBLUE_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY manquante');
  }

  if (!apiByKey.has(apiKey)) {
    apiByKey.set(apiKey, createTransactionalApi(apiKey));
  }
  return apiByKey.get(apiKey);
}

/**
 * @param {object} params
 * @param {string} params.to
 * @param {string} [params.toName]
 * @param {string} params.subject
 * @param {string} params.htmlContent
 * @param {string} [params.textContent]
 * @param {{ email?: string, name?: string }} [params.sender]
 * @param {string} [params.apiKey] — clé Brevo du cabinet (sinon .env global)
 * @param {string} [params.replyTo]
 */
async function sendEmail({
  to,
  toName = '',
  subject,
  htmlContent,
  textContent = '',
  sender,
  apiKey,
  replyTo,
}) {
  const Brevo = getBrevo();
  const api = getTransactionalApi(apiKey);
  const recipientName = (toName && String(toName).trim()) || 'Destinataire';
  const senderEmail = (sender?.email && String(sender.email).trim()) || DEFAULT_SENDER_EMAIL;
  const senderName = (sender?.name && String(sender.name).trim()) || DEFAULT_SENDER_NAME;

  const basePayload = {
    sender: { email: senderEmail, name: senderName },
    to: [{ email: to, name: recipientName }],
    subject,
    htmlContent,
    textContent: textContent || undefined,
  };
  if (replyTo) {
    basePayload.replyTo = { email: replyTo };
  }

  if (Brevo?.SendSmtpEmail) {
    const payload = new Brevo.SendSmtpEmail();
    Object.assign(payload, basePayload);
    return api.sendTransacEmail(payload);
  }

  return api.sendTransacEmail(basePayload);
}

module.exports = { sendEmail, getTransactionalApi };
