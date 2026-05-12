/**
 * Enrichit le markdown Paw AI : références type « L. 521-1 CJA » → span + lien Légifrance
 * (nouvel onglet, sans API). Ne modifie pas le contenu des blocs ```…```.
 */
const INLINE_ARTICLE_RE =
  /\b((?:L|R|D)\.\s*[\d]+(?:\s*[–-]\s*[\d]+)*)\s+((?:du\s+|de\s+la\s+)?)(CJA|CESEDA|CESÉDA|CRPA|CSTLRF|CSP)\b/giu;

/** Ex. « L. 123-45 code du travail » → requête Légifrance. */
const INLINE_CODE_NAMED_RE =
  /\b((?:L|R|D)\.\s*[\d]+(?:\s*[–-]\s*[\d]+)*)\s+(?:du\s+|de\s+la\s+)?(code\s+du\s+travail|code\s+civil|code\s+pénal|code\s+de\s+commerce|code\s+de\s+la\s+sécurité\s+intérieure|code\s+de\s+la\s+sécurité\s+sociale)\b/giu;

function escapeHtmlText(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSearchQuery(articlePart: string, codePart: string) {
  return `${articlePart} ${codePart}`.replace(/\s+/g, ' ').trim();
}

function wrapArticleRef(full: string, query: string) {
  const enc = encodeURIComponent(query);
  const safeInner = escapeHtmlText(full);
  return `<span class="lexia-article-ref" data-lexia-article-query="${enc}">${safeInner}</span>`;
}

export function annotateLawArticleRefsInMarkdown(md: string): string {
  if (!md) return md;
  if (!/\b(?:L|R|D)\./i.test(md)) return md;
  const chunks = md.split(/(```[\s\S]*?```)/g);
  return chunks
    .map((chunk, idx) => {
      if (idx % 2 === 1) return chunk;
      if (chunk.includes('lexia-article-ref')) return chunk;
      let out = chunk.replace(INLINE_ARTICLE_RE, (full, articleNum, _mid, code) => {
        const q = buildSearchQuery(String(articleNum), String(code).replace(/^CESÉDA$/i, 'CESEDA'));
        return wrapArticleRef(full, q);
      });
      out = out.replace(INLINE_CODE_NAMED_RE, (full, articleNum, codePhrase) => {
        const q = buildSearchQuery(String(articleNum), String(codePhrase));
        return wrapArticleRef(full, q);
      });
      return out;
    })
    .join('');
}
