const { getTenantStore } = require('./asyncContext');

const DEFAULT_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'contact@adapapers.fr';
const DEFAULT_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Ada Papers';

/**
 * Configuration expéditeur pour l’email transactionnel du cabinet courant (ALS ou fallback .env).
 * @param {import('express').Request} [req]
 */
function getTenantEmailConfig(req) {
  const fromReq = req?.tenant?.email;
  const fromReqBranding = req?.tenant?.branding;
  const store = getTenantStore();
  const email = fromReq || store?.email || {};
  const branding = fromReqBranding || store?.branding || {};

  const brevoApiKey =
    (email.brevoApiKey && String(email.brevoApiKey).trim()) ||
    process.env.BREVO_API_KEY ||
    process.env.SENDINBLUE_API_KEY ||
    '';

  const from =
    (email.from && String(email.from).trim()) || DEFAULT_SENDER_EMAIL;

  const senderName =
    (branding.name && String(branding.name).trim()) || DEFAULT_SENDER_NAME;

  const replyTo = (email.replyTo && String(email.replyTo).trim()) || from;

  return {
    from,
    senderName,
    brevoApiKey: brevoApiKey || undefined,
    replyTo,
    teamName: senderName,
  };
}

module.exports = {
  getTenantEmailConfig,
  DEFAULT_SENDER_EMAIL,
  DEFAULT_SENDER_NAME,
};
