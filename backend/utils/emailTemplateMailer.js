const EmailTemplate = require('../models/EmailTemplate');
const EmailLog = require('../models/EmailLog');
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

  try {
    const tpl = await EmailTemplate.findOne({ code: templateCode, isActive: true })
      .sort({ version: -1, updatedAt: -1 })
      .lean();
    if (tpl?.subject && tpl?.htmlContent) {
      subject = tpl.subject;
      htmlContent = tpl.htmlContent;
      textContent = tpl.textContent || '';
      templateCodeUsed = tpl.code;
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
      await EmailLog.create({
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
  sendTemplatedTransactionalEmail,
};
