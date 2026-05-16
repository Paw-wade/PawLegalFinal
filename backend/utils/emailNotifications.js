const nodemailer = require('nodemailer');
const { sendEmail: sendBrevoEmail } = require('../services/brevoService');
const { getTenantEmailConfig } = require('../lib/tenant/tenantEmail');
const EMAIL_PROVIDER_TIMEOUT_MS = Number(process.env.EMAIL_PROVIDER_TIMEOUT_MS || 12000);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hasBrevoConfigured(tenantConfig) {
  return Boolean(
    tenantConfig?.brevoApiKey ||
      process.env.BREVO_API_KEY ||
      process.env.SENDINBLUE_API_KEY
  );
}

function hasSmtpConfigured() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && EMAIL_FROM);
}

function toPlainTextFromHtml(html = '') {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function ensureProfessionalEmailContent({
  toName = '',
  htmlContent = '',
  textContent = '',
  teamName = 'Ada Papers',
}) {
  const fallbackName = toName && String(toName).trim() ? String(toName).trim() : 'Madame, Monsieur';
  const team = String(teamName || 'Ada Papers').trim() || 'Ada Papers';
  const hello = `Bonjour ${escapeHtml(fallbackName)},`;
  const helloText = `Bonjour ${fallbackName},`;
  const closingHtml = `<p>Cordialement,<br/>L’équipe ${escapeHtml(team)}</p>`;
  const closingText = `Cordialement,\nL’équipe ${team}`;

  let html = String(htmlContent || '').trim();
  let text = String(textContent || '').trim();

  if (!html && text) {
    html = `<p>${escapeHtml(text).replace(/\n/g, '<br/>')}</p>`;
  }
  if (!text && html) {
    text = toPlainTextFromHtml(html);
  }

  if (!/bonjour|madame|monsieur/i.test(html)) {
    html = `<p>${hello}</p>\n${html}`;
  }
  if (!/cordialement|bien à vous|salutations distinguées/i.test(html)) {
    html = `${html}\n${closingHtml}`;
  }

  if (!/bonjour|madame|monsieur/i.test(text)) {
    text = `${helloText}\n\n${text}`;
  }
  if (!/cordialement|bien à vous|salutations distinguées/i.test(text)) {
    text = `${text}\n\n${closingText}`;
  }

  return { htmlContent: html, textContent: text };
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

async function sendEmailViaSmtp({
  to,
  toName = '',
  subject,
  htmlContent,
  textContent = '',
  fromAddress,
}) {
  if (!hasSmtpConfigured()) {
    throw new Error('SMTP non configuré (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM)');
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  const from = fromAddress || EMAIL_FROM;
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
    from,
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
async function sendTransactionalEmailDetailed({
  to,
  toName = '',
  subject,
  htmlContent,
  textContent = '',
  req,
}) {
  const addr = to && String(to).trim();
  if (!addr) {
    return { ok: false, error: 'no_recipient' };
  }

  const tenantEmail = getTenantEmailConfig(req);
  const normalizedContent = ensureProfessionalEmailContent({
    toName,
    htmlContent,
    textContent,
    teamName: tenantEmail.teamName,
  });
  const payload = {
    to: addr,
    toName,
    subject,
    htmlContent: normalizedContent.htmlContent,
    textContent: normalizedContent.textContent || '',
    sender: { email: tenantEmail.from, name: tenantEmail.senderName },
    apiKey: tenantEmail.brevoApiKey,
    replyTo: tenantEmail.replyTo,
    fromAddress: tenantEmail.from,
  };

  if (hasBrevoConfigured(tenantEmail)) {
    try {
      await withTimeout(sendBrevoEmail(payload), EMAIL_PROVIDER_TIMEOUT_MS, 'brevo');
      return { ok: true, provider: 'brevo', sender: tenantEmail.from };
    } catch (e) {
      console.warn('⚠️ Brevo indisponible ou refusé, tentative SMTP:', e.message || e);
    }
  } else {
    console.warn('⚠️ BREVO_API_KEY absente — envoi via SMTP si configuré.');
  }

  try {
    await withTimeout(sendEmailViaSmtp(payload), EMAIL_PROVIDER_TIMEOUT_MS, 'smtp');
    return { ok: true, provider: 'smtp', sender: tenantEmail.from };
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
  ensureProfessionalEmailContent,
};
