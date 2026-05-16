const M = require('../tenantModels');
const { sendTransactionalEmailDetailed, escapeHtml } = require('./emailNotifications');

function renderTemplateWithVariables(template, variables = {}) {
  const normalize = (value) => (value === undefined || value === null ? '' : String(value));
  return String(template || '').replace(/\{\{(.*?)\}\}/g, (_, key) =>
    normalize(variables[String(key).trim()])
  );
}

function buildCabinetMessageVariables(message) {
  const trimmed = String(message || '').trim();
  if (!trimmed) {
    return { cabinetMessageBlock: '', cabinetMessageText: '' };
  }
  return {
    cabinetMessageBlock: `<p><strong>Message du cabinet :</strong><br/>${escapeHtml(trimmed)}</p>`,
    cabinetMessageText: `\nMessage du cabinet :\n${trimmed}\n`,
  };
}

function buildEmailCtaButton(url, label = 'Ouvrir') {
  const safeUrl = String(url || '').trim();
  if (!safeUrl) return '';
  const safeLabel = escapeHtml(String(label || 'Ouvrir').trim() || 'Ouvrir');
  return `<p style="margin:24px 0;"><a href="${escapeHtml(safeUrl)}" style="display:inline-block;padding:12px 20px;background:#ea580c;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">${safeLabel}</a></p>`;
}

async function sendTemplatedTransactionalEmail({
  templateCode,
  eventKey = '',
  to,
  toName = '',
  variables = {},
  fallback,
}) {
  let subject = fallback?.subject || '';
  let htmlContent = fallback?.htmlContent || '';
  let textContent = fallback?.textContent || '';
  let templateCodeUsed = templateCode;

  if (templateCode === 'document_download_share' && variables.downloadUrl) {
    variables.downloadButtonBlock =
      variables.downloadButtonBlock ||
      buildEmailCtaButton(variables.downloadUrl, 'Télécharger le document');
  }

  try {
    const tpl = await M.EmailTemplate.findOne({ code: templateCode, isActive: true })
      .sort({ version: -1, updatedAt: -1 })
      .lean();
    if (tpl?.subject && tpl?.htmlContent) {
      subject = tpl.subject;
      htmlContent = tpl.htmlContent;
      textContent = tpl.textContent || '';
      templateCodeUsed = tpl.code;
      if (
        templateCode === 'document_download_share' &&
        htmlContent.includes('>{{downloadUrl}}</a>') &&
        fallback?.htmlContent
      ) {
        htmlContent = fallback.htmlContent;
        if (fallback.textContent) textContent = fallback.textContent;
      }
    }
  } catch (error) {
    console.warn(`⚠️ Lecture template ${templateCode} impossible, fallback inline:`, error.message || error);
  }

  subject = renderTemplateWithVariables(subject, variables);
  htmlContent = renderTemplateWithVariables(htmlContent, variables);
  textContent = renderTemplateWithVariables(textContent, variables);

  const result = await sendTransactionalEmailDetailed({
    to,
    toName,
    subject,
    htmlContent,
    textContent,
  });

  if (eventKey) {
    try {
      await M.EmailLog.create({
        eventKey,
        templateCode: templateCodeUsed,
        to,
        toName,
        subject,
        htmlContent,
        textContent,
        variables,
        status: result.ok ? 'sent' : 'failed',
        provider: result.provider || '',
        error: result.ok ? '' : result.error || '',
      });
    } catch (logError) {
      console.warn('⚠️ Log email impossible:', logError.message || logError);
    }
  }

  return result;
}

module.exports = {
  renderTemplateWithVariables,
  buildCabinetMessageVariables,
  buildEmailCtaButton,
  sendTemplatedTransactionalEmail,
};
