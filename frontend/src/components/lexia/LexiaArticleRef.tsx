'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getApiBaseUrl, getAuthToken } from '@/lib/api';

type CrossRefItem = {
  id: string;
  title?: string | null;
  legifranceUrl?: string;
};

type PreviewPayload = {
  success?: boolean;
  title?: string;
  text?: string;
  legifranceUrl?: string;
  vigueurHint?: string | null;
  referencesSortantes?: CrossRefItem[];
  articlesQuiCitent?: CrossRefItem[];
  crossRefNote?: string;
  error?: string;
  configured?: boolean;
};

/** N’utilise la voie « id » API que si la chaîne contient un vrai identifiant LEGIARTI… */
function extractLegiartiApiId(raw: string | undefined): string | undefined {
  if (!raw || raw.length < 8) return undefined;
  const m = raw.match(/LEGIARTI[0-9A-Z]+/i);
  return m ? m[0].toUpperCase() : undefined;
}

type LexiaArticleRefProps = {
  children: ReactNode;
  className?: string;
  /** Requête texte (recherche Légifrance puis premier article). */
  query?: string;
  /** Identifiant LEGIARTI… (consultation directe). */
  legiartiId?: string;
};

export function LexiaArticleRef({ children, className, query, legiartiId }: LexiaArticleRefProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PreviewPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const visible = hoverOpen || pinnedOpen;

  const updatePos = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: Math.min(420, Math.max(280, r.width)) });
  }, []);

  const loadPreview = useCallback(async () => {
    if (data?.text) return;
    setLoading(true);
    setErr(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    let slowKill: ReturnType<typeof setTimeout> | undefined;
    try {
      const token = await getAuthToken();
      const base = getApiBaseUrl().replace(/\/+$/, '');
      const apiLegiarti = extractLegiartiApiId(legiartiId);
      const body = apiLegiarti
        ? { id: apiLegiarti, enriched: true }
        : {
            query: (query || legiartiId || '').trim(),
            fond: 'CODE_DATE',
            enriched: true,
          };
      slowKill = setTimeout(() => ac.abort(), 90000);

      const res = await fetch(`${base}/legal/article-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const json = (await res.json().catch(() => ({}))) as PreviewPayload;
      if (!res.ok) {
        setErr(typeof json.error === 'string' ? json.error : res.statusText);
        setData(json);
        return;
      }
      setData(json);
    } catch (e: unknown) {
      if ((e as Error)?.name === 'AbortError') return;
      setErr(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      if (slowKill) clearTimeout(slowKill);
      setLoading(false);
    }
  }, [data?.text, legiartiId, query]);

  useEffect(() => {
    setData(null);
    setErr(null);
  }, [query, legiartiId]);

  useEffect(() => {
    if (!visible) return;
    updatePos();
    const onScroll = () => updatePos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [visible, updatePos]);

  useEffect(() => {
    if (!pinnedOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinnedOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pinnedOpen]);

  const clearHoverTimer = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  const onMouseEnter = () => {
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => {
      setHoverOpen(true);
      void loadPreview();
    }, 380);
  };

  const onMouseLeave = () => {
    clearHoverTimer();
    if (!pinnedOpen) {
      setHoverOpen(false);
    }
  };

  const onClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    setPinnedOpen((v) => !v);
    setHoverOpen(true);
    void loadPreview();
    updatePos();
  };

  const closePinned = () => {
    setPinnedOpen(false);
    setHoverOpen(false);
  };

  const panelContent = (
    <>
      {pinnedOpen && (
        <button
          type="button"
          className="lexia-article-popover-backdrop"
          aria-label="Fermer"
          onClick={closePinned}
        />
      )}
      <div
        role="dialog"
        aria-modal={pinnedOpen}
        className={`lexia-article-popover ${pinnedOpen ? 'lexia-article-popover--pinned' : ''}`}
        style={{
          position: 'fixed',
          top: pinnedOpen ? '50%' : pos.top,
          left: pinnedOpen ? '50%' : pos.left,
          transform: pinnedOpen ? 'translate(-50%, -50%)' : 'none',
          width: pinnedOpen ? 'min(92vw, 520px)' : pos.width,
          maxWidth: pinnedOpen ? 'min(92vw, 520px)' : 'min(92vw, 420px)',
          maxHeight: pinnedOpen ? 'min(80vh, 560px)' : 'min(40vh, 320px)',
          zIndex: pinnedOpen ? 10002 : 10001,
        }}
        onMouseEnter={() => {
          if (!pinnedOpen) setHoverOpen(true);
        }}
        onMouseLeave={() => {
          if (!pinnedOpen) setHoverOpen(false);
        }}
      >
        {loading && <p className="lexia-article-popover-loading">Chargement du texte officiel…</p>}
        {!loading && err && (
          <div className="lexia-article-popover-err">
            <p>{err}</p>
            {data?.configured === false && (
              <p className="text-xs opacity-80 mt-2">L&apos;aperçu Légifrance nécessite la configuration serveur.</p>
            )}
          </div>
        )}
        {!loading && !err && data?.text && (
          <>
            {data.title && <p className="lexia-article-popover-title">{data.title}</p>}
            {data.vigueurHint && (
              <p className="lexia-article-popover-vigueur">{data.vigueurHint}</p>
            )}
            <div className="lexia-article-popover-body">{data.text}</div>
            {data.legifranceUrl && (
              <a
                href={data.legifranceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="lexia-article-popover-link"
              >
                Ouvrir sur Légifrance (texte consolidé) →
              </a>
            )}
            {!!data.referencesSortantes?.length && (
              <div className="lexia-article-popover-cross">
                <h4 className="lexia-article-popover-cross-title">Références liées (extrait API)</h4>
                <ul className="lexia-article-popover-cross-ul">
                  {data.referencesSortantes.map((it) => (
                    <li key={it.id}>
                      <a href={it.legifranceUrl || '#'} target="_blank" rel="noopener noreferrer">
                        {it.title || it.id}
                      </a>
                      <span className="lexia-article-popover-id">{it.id}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!data.articlesQuiCitent?.length && (
              <div className="lexia-article-popover-cross">
                <h4 className="lexia-article-popover-cross-title">
                  Autres textes repérés (recherche Légifrance)
                </h4>
                <ul className="lexia-article-popover-cross-ul">
                  {data.articlesQuiCitent.map((it) => (
                    <li key={it.id}>
                      <a href={it.legifranceUrl || '#'} target="_blank" rel="noopener noreferrer">
                        {it.title || it.id}
                      </a>
                      <span className="lexia-article-popover-id">{it.id}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.crossRefNote && (
              <p className="lexia-article-popover-note">{data.crossRefNote}</p>
            )}
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      <span
        ref={wrapRef}
        className={`lexia-article-ref-wrap ${className || ''}`.trim()}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(e as unknown as React.MouseEvent);
          }
        }}
        role="button"
        tabIndex={0}
        title="Survol ou clic : texte officiel et références (Légifrance)"
      >
        {children}
      </span>
      {visible && typeof document !== 'undefined' && createPortal(panelContent, document.body)}
      <style jsx global>{`
        .lexia-article-ref-wrap {
          cursor: help;
          border-bottom: 1px dotted hsl(var(--primary) / 0.55);
          color: hsl(var(--primary));
          font-weight: 600;
        }
        .lexia-article-ref-wrap:hover {
          border-bottom-color: hsl(var(--primary));
        }
        .lexia-article-popover-backdrop {
          position: fixed;
          inset: 0;
          z-index: 10001;
          background: rgba(0, 0, 0, 0.25);
          border: none;
          cursor: default;
        }
        .lexia-article-popover {
          overflow: auto;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--popover, var(--background)));
          color: hsl(var(--popover-foreground, var(--foreground)));
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
          font-size: 12.5px;
          line-height: 1.55;
        }
        .lexia-article-popover--pinned {
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
        }
        .lexia-article-popover-title {
          font-weight: 700;
          margin: 0 0 8px;
          font-size: 13px;
        }
        .lexia-article-popover-body {
          white-space: pre-wrap;
          word-break: break-word;
        }
        .lexia-article-popover-loading,
        .lexia-article-popover-err {
          margin: 0;
          font-size: 12.5px;
        }
        .lexia-article-popover-err {
          color: hsl(var(--destructive, 0 72% 45%));
        }
        .lexia-article-popover-link {
          display: inline-block;
          margin-top: 10px;
          font-size: 12px;
          font-weight: 600;
          color: hsl(var(--primary));
        }
        .lexia-article-popover-vigueur {
          margin: 0 0 8px;
          font-size: 11px;
          opacity: 0.85;
          font-style: italic;
        }
        .lexia-article-popover-cross {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid hsl(var(--border) / 0.6);
        }
        .lexia-article-popover-cross-title {
          margin: 0 0 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          opacity: 0.9;
        }
        .lexia-article-popover-cross-ul {
          margin: 0;
          padding-left: 1.1rem;
          font-size: 11.5px;
        }
        .lexia-article-popover-cross-ul li {
          margin-bottom: 4px;
        }
        .lexia-article-popover-cross-ul a {
          color: hsl(var(--primary));
          font-weight: 600;
        }
        .lexia-article-popover-id {
          display: block;
          font-family: ui-monospace, monospace;
          font-size: 10px;
          opacity: 0.65;
          margin-top: 1px;
        }
        .lexia-article-popover-note {
          margin: 12px 0 0;
          font-size: 10.5px;
          line-height: 1.45;
          opacity: 0.8;
        }
      `}</style>
    </>
  );
}
