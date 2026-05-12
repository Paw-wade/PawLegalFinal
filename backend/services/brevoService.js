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

let legacyApiInstance = null;
let modernClient = null;

const DEFAULT_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'contact@adapapers.fr';
const DEFAULT_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Ada Papers';

function getTransactionalApi() {
  const apiKey = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY manquante');
  }

  const Brevo = getBrevo();

  if (legacyApiInstance) return legacyApiInstance;
  if (modernClient) return modernClient.transactionalEmails;

  if (Brevo?.ApiClient?.instance?.authentications?.['api-key'] && Brevo?.TransactionalEmailsApi) {
    Brevo.ApiClient.instance.authentications['api-key'].apiKey = apiKey;
    legacyApiInstance = new Brevo.TransactionalEmailsApi();
    return legacyApiInstance;
  }

  if (typeof Brevo?.BrevoClient === 'function') {
    modernClient = new Brevo.BrevoClient({ apiKey });
    return modernClient.transactionalEmails;
  }

  throw new Error('SDK Brevo incompatible');
}

async function sendEmail({ to, toName = '', subject, htmlContent, textContent = '' }) {
  const Brevo = getBrevo();
  const api = getTransactionalApi();
  /** L’API Brevo peut refuser un tableau `to` sans nom (`missing_parameter`). */
  const recipientName = (toName && String(toName).trim()) || 'Destinataire';

  if (Brevo?.SendSmtpEmail) {
    const payload = new Brevo.SendSmtpEmail();
    payload.sender = { email: DEFAULT_SENDER_EMAIL, name: DEFAULT_SENDER_NAME };
    payload.to = [{ email: to, name: recipientName }];
    payload.subject = subject;
    payload.htmlContent = htmlContent;
    if (textContent) payload.textContent = textContent;
    return api.sendTransacEmail(payload);
  }

  return api.sendTransacEmail({
    sender: { email: DEFAULT_SENDER_EMAIL, name: DEFAULT_SENDER_NAME },
    to: [{ email: to, name: recipientName }],
    subject,
    htmlContent,
    textContent: textContent || undefined,
  });
}

module.exports = { sendEmail };

