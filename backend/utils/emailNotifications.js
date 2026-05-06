const nodemailer = require('nodemailer');
const { sendEmail: sendBrevoEmail } = require('../services/brevoService');
const EMAIL_PROVIDER_TIMEOUT_MS = Number(process.env.EMAIL_PROVIDER_TIMEOUT_MS || 12000);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hasBrevoConfigured() {
  return Boolean(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY);
}

function hasSmtpConfigured() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && EMAIL_FROM);
}

async function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout (${timeoutMs}ms)`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sendEmailViaSmtp({ to, toName = '', subject, htmlContent, textContent = '' }) {
  if (!hasSmtpConfigured()) {
    throw new Error('SMTP non configuré (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM)');
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    connectionTimeout: EMAIL_PROVIDER_TIMEOUT_MS,
    greetingTimeout: EMAIL_PROVIDER_TIMEOUT_MS,
    socketTimeout: EMAIL_PROVIDER_TIMEOUT_MS,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  await transporter.sendMail({
    from: EMAIL_FROM,
    to: toName ? `${toName} <${to}>` : to,
    subject,
    text: textContent || undefined,
    html: htmlContent,
  });
}

/**
 * Brevo si clé présente, sinon ou en échec → SMTP (mêmes variables que l’ancien reset password).
 * @returns {{ ok: boolean, provider?: string, error?: string }}
 */
async function sendTransactionalEmailDetailed({ to, toName = '', subject, htmlContent, textContent = '' }) {
  const addr = to && String(to).trim();
  if (!addr) {
    return { ok: false, error: 'no_recipient' };
  }

  const payload = {
    to: addr,
    toName,
    subject,
    htmlContent,
    textContent: textContent || '',
  };

  if (hasBrevoConfigured()) {
    try {
      await withTimeout(sendBrevoEmail(payload), EMAIL_PROVIDER_TIMEOUT_MS, 'brevo');
      return { ok: true, provider: 'brevo' };
    } catch (e) {
      console.warn('⚠️ Brevo indisponible ou refusé, tentative SMTP:', e.message || e);
    }
  } else {
    console.warn('⚠️ BREVO_API_KEY absente — envoi via SMTP si configuré.');
  }

  try {
    await withTimeout(sendEmailViaSmtp(payload), EMAIL_PROVIDER_TIMEOUT_MS, 'smtp');
    return { ok: true, provider: 'smtp' };
  } catch (e) {
    console.error('❌ Email non envoyé (Brevo + SMTP):', e.message || e);
    return { ok: false, error: e.message || String(e) };
  }
}

/** Compat : la plupart des routes attendent un booléen. */
async function sendTransactionalEmail(params) {
  const r = await sendTransactionalEmailDetailed(params);
  return r.ok;
}

module.exports = {
  escapeHtml,
  sendTransactionalEmail,
  sendTransactionalEmailDetailed,
  sendEmailViaSmtp,
  hasBrevoConfigured,
  hasSmtpConfigured,
};
