const nodemailer = require('nodemailer');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * @typedef {object} SendTransactionalEmailOptions
 * @property {string} to
 * @property {string} [toName]
 * @property {string} subject
 * @property {string} [text]
 * @property {string} [html]
 * @property {string} [fromEmail] — sinon BREVO_SENDER_EMAIL ou EMAIL_FROM
 * @property {string} [fromName] — sinon BREVO_SENDER_NAME ou « Ada Papers »
 */

/**
 * Envoie un email transactionnel via l’API Brevo (REST v3).
 * @see https://developers.brevo.com/reference/sendtransacemail
 */
async function sendViaBrevo({ to, toName, subject, text, html, fromEmail, fromName }) {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  if (!apiKey) {
    return { sent: false, reason: 'missing_brevo_key' };
  }

  const senderEmail = (fromEmail || process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || '').trim();
  if (!senderEmail) {
    return { sent: false, reason: 'missing_sender' };
  }

  const senderName = (fromName || process.env.BREVO_SENDER_NAME || 'Ada Papers').trim() || 'Ada Papers';

  const toItem = { email: String(to).trim() };
  if (toName && String(toName).trim()) {
    toItem.name = String(toName).trim();
  }

  const payload = {
    sender: { email: senderEmail, name: senderName },
    to: [toItem],
    subject: String(subject || '').trim(),
  };

  if (html) payload.htmlContent = html;
  if (text) payload.textContent = text;
  if (!payload.htmlContent && !payload.textContent) {
    return { sent: false, reason: 'no_content' };
  }

  let res;
  try {
    res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('❌ Brevo (réseau):', e?.message || e);
    return { sent: false, reason: 'brevo_network', error: e?.message };
  }

  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw };
  }

  if (!res.ok) {
    console.error('❌ Brevo API:', res.status, data);
    return { sent: false, reason: 'brevo_api_error', status: res.status, detail: data };
  }

  return { sent: true, via: 'brevo', messageId: data.messageId };
}

async function sendViaSmtp({ to, subject, text, html, fromEmail }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: fromEmail || EMAIL_FROM,
    to,
    subject,
    text,
    html,
  });

  return { sent: true, via: 'smtp' };
}

/** True si au moins un canal d’envoi est configurable. */
function isTransactionalEmailConfigured() {
  if ((process.env.BREVO_API_KEY || '').trim()) {
    const sender = (
      process.env.BREVO_SENDER_EMAIL ||
      process.env.EMAIL_FROM ||
      ''
    ).trim();
    return Boolean(sender);
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && EMAIL_FROM);
}

/**
 * Brevo si `BREVO_API_KEY` + expéditeur ; sinon SMTP classique si défini.
 * @param {SendTransactionalEmailOptions} opts
 * @returns {Promise<{ sent: boolean, via?: string, reason?: string, [key: string]: unknown }>}
 */
async function sendTransactionalEmail(opts) {
  const { to, toName, subject, text, html, fromEmail, fromName } = opts;

  if ((process.env.BREVO_API_KEY || '').trim()) {
    const brevo = await sendViaBrevo({ to, toName, subject, text, html, fromEmail, fromName });
    if (brevo.sent) return brevo;
    console.warn("⚠️ Échec ou indisponibilité Brevo, tentative SMTP si configuré…", brevo.reason);
  }

  const smtp = await sendViaSmtp({
    to,
    subject,
    text,
    html,
    fromEmail: fromEmail || process.env.EMAIL_FROM,
  });
  return smtp;
}

module.exports = {
  sendTransactionalEmail,
  isTransactionalEmailConfigured,
};
