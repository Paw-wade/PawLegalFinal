'use client';

import { useMemo, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';

/** Extrait un identifiant LEGIARTI pour l’URL article consolidé. */
function extractLegiartiApiId(raw: string | undefined): string | undefined {
  if (!raw || raw.length < 8) return undefined;
  const m = raw.match(/LEGIARTI[0-9A-Z]+/i);
  return m ? m[0].toUpperCase() : undefined;
}

function buildLegifranceUrl(query?: string, legiartiId?: string): string {
  const apiId = extractLegiartiApiId(legiartiId);
  if (apiId) {
    return `https://www.legifrance.gouv.fr/codes/article_lc/${encodeURIComponent(apiId)}`;
  }
  const q = (query || legiartiId || '').trim();
  if (q) {
    return `https://www.legifrance.gouv.fr/search/all?tab_selection=all&searchField=ALL&query=${encodeURIComponent(q)}`;
  }
  return 'https://www.legifrance.gouv.fr';
}

type LexiaArticleRefProps = {
  children: ReactNode;
  className?: string;
  /** Requête texte (recherche sur Légifrance). */
  query?: string;
  /** Identifiant LEGIARTI… (lien direct vers l’article consolidé). */
  legiartiId?: string;
};

/**
 * Référence d’article : mise en évidence du texte + lien externe vers Légifrance
 * (sans aperçu API — recherche publique ou article_lc si LEGIARTI connu).
 */
export function LexiaArticleRef({ children, className, query, legiartiId }: LexiaArticleRefProps) {
  const href = useMemo(() => buildLegifranceUrl(query, legiartiId), [query, legiartiId]);
  const labelHint = (query || legiartiId || '').trim() || 'Légifrance';

  return (
    <span className={`lexia-article-ref-wrap ${className || ''}`.trim()}>
      <span className="lexia-article-ref-label">{children}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="lexia-article-ext"
        aria-label={`Ouvrir sur Légifrance : ${labelHint}`}
        title="Ouvrir sur Légifrance (nouvel onglet)"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink size={14} strokeWidth={2.25} aria-hidden />
      </a>
      <style jsx global>{`
        .lexia-article-ref-wrap {
          display: inline-flex;
          align-items: baseline;
          gap: 3px;
          vertical-align: baseline;
          max-width: 100%;
        }
        .lexia-article-ref-label {
          border-bottom: 1px dotted hsl(var(--primary) / 0.55);
          color: hsl(var(--primary));
          font-weight: 600;
        }
        .lexia-article-ext {
          display: inline-flex;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          color: hsl(var(--primary));
          opacity: 0.88;
          line-height: 1;
          padding: 2px;
          margin-left: 1px;
          border-radius: 4px;
          text-decoration: none;
        }
        .lexia-article-ext:hover {
          opacity: 1;
          background: hsl(var(--primary) / 0.12);
        }
        .lexia-article-ext:focus-visible {
          outline: 2px solid hsl(var(--ring));
          outline-offset: 1px;
        }
      `}</style>
    </span>
  );
}
