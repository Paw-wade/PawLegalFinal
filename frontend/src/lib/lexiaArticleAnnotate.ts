/**
 * Enrichit le markdown Paw AI : références type « L. 521-1 CJA » → span interactif
 * (aperçu Légifrance au survol / clic). Ne modifie pas le contenu des blocs ```…```.
 */
const INLINE_ARTICLE_RE =
  /\b((?:L|R|D)\.\s*[\d]+(?:\s*[–-]\s*[\d]+)*)\s+((?:du\s+|de\s+la\s+)?)(CJA|CESEDA|CESÉDA|CRPA|CSTLRF)\b/giu;

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

export function annotateLawArticleRefsInMarkdown(md: string): string {
  if (!md) return md;
  if (!/\b(?:L|R|D)\./i.test(md)) return md;
  const chunks = md.split(/(```[\s\S]*?```)/g);
  return chunks
    .map((chunk, idx) => {
      if (idx % 2 === 1) return chunk;
      if (chunk.includes('lexia-article-ref')) return chunk;
      return chunk.replace(INLINE_ARTICLE_RE, (full, articleNum, _mid, code) => {
        const q = buildSearchQuery(String(articleNum), String(code).replace(/^CESÉDA$/i, 'CESEDA'));
        const enc = encodeURIComponent(q);
        const safeInner = escapeHtmlText(full);
        return `<span class="lexia-article-ref" data-lexia-article-query="${enc}">${safeInner}</span>`;
      });
    })
    .join('');
}
