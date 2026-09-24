const crypto = require('crypto');
const sanitizeHtml = require('sanitize-html');

const ALLOWED_STYLES = {
  '*': {
    color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i, /^[a-z]+$/i],
    'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i, /^[a-z]+$/i],
    'text-align': [/^(left|right|center|justify)$/],
    'font-weight': [/^(normal|bold|bolder|lighter|\d{3})$/],
    'font-style': [/^(normal|italic|oblique)$/],
    'text-decoration': [/^(none|underline|line-through)( (none|underline|line-through))*$/],
    'font-size': [/^\d+(\.\d+)?(px|pt|em|rem|%)$/],
    'font-family': [/^[\w\s,'"-]+$/],
    'line-height': [/^\d+(\.\d+)?(px|pt|em|rem|%)?$/],
    'margin-left': [/^-?\d+(\.\d+)?(px|pt|em|rem|%)$/],
    'padding-left': [/^\d+(\.\d+)?(px|pt|em|rem|%)$/],
    'text-indent': [/^-?\d+(\.\d+)?(px|pt|em|rem|%)$/],
    width: [/^\d+(\.\d+)?(px|pt|em|rem|%)$/],
    border: [/^[\w\s#.,()%-]+$/],
  },
};

/**
 * Nettoie le HTML colle par l'admin (Word, Google Docs, etc.) en conservant la mise en forme
 * (titres, gras, couleurs, listes, tableaux, alignements) et en retirant scripts et handlers.
 */
function sanitizeLettreHtml(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr', 'div', 'span', 'blockquote',
      'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
      'a',
    ],
    allowedAttributes: {
      '*': ['style'],
      a: ['href', 'target', 'rel'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
      ol: ['start', 'type'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedStyles: ALLOWED_STYLES,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  }).trim();
}

/** Retourne true si le HTML ne contient aucun texte visible. */
function isLettreHtmlEmpty(html) {
  const text = sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} });
  return text.replace(/&nbsp;|\s/g, '').length === 0;
}

function hashLettreHtml(html) {
  return crypto.createHash('sha256').update(String(html || ''), 'utf8').digest('hex');
}

module.exports = { sanitizeLettreHtml, isLettreHtmlEmpty, hashLettreHtml };
