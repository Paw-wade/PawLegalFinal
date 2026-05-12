'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LexiaMarkdown } from '@/components/lexia/LexiaMarkdown';
import { getPublicApiBaseUrl } from '@/lib/publicApiUrl';

type ShareMsg = { role: 'user' | 'assistant'; content: string; isError?: boolean };

type SharePayload = {
  success: boolean;
  title?: string;
  scope?: string;
  messages?: ShareMsg[];
  createdAt?: string;
  error?: string;
};

export default function PawAiPublicSharePage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [data, setData] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setData({ success: false, error: 'Lien invalide.' });
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const base = getPublicApiBaseUrl();
        const res = await fetch(`${base}/lexia/public-share/${encodeURIComponent(token)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const json = (await res.json()) as SharePayload;
        if (!cancelled) {
          setData(json);
          if (json.success && json.title) {
            document.title = `${json.title} | Paw AI — Ada Papers`;
          }
        }
      } catch {
        if (!cancelled) setData({ success: false, error: 'Impossible de charger le contenu.' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const scopeLabel =
    data?.scope === 'full'
      ? 'Conversation complète'
      : data?.scope === 'since_last_user'
        ? 'Depuis la dernière question'
        : data?.scope === 'this_exchange'
          ? 'Échange ciblé'
          : '';

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-8 sm:flex-row sm:justify-between sm:py-6">
          <Link href="/" className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ada-papers-wordmark.svg"
              alt="Ada Papers"
              width={200}
              height={48}
              className="h-10 w-auto max-w-[220px]"
            />
            <span className="hidden text-xs font-medium text-muted-foreground sm:inline">adapapers.fr</span>
          </Link>
          <div className="text-center text-xs text-muted-foreground sm:text-right">
            <p className="font-semibold text-foreground">Paw AI</p>
            <p>Analyse partagée (lecture seule)</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {loading ? (
          <p className="text-center text-muted-foreground">Chargement…</p>
        ) : !data?.success ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
            <p className="font-medium text-destructive">{data?.error || 'Contenu introuvable.'}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Le lien a peut-être expiré ou est incorrect. Les partages publics sont conservés 90 jours.
            </p>
            <Link href="/" className="mt-6 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline">
              Retour au site Ada Papers
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
              <h1 className="text-lg font-semibold leading-snug sm:text-xl">{data.title || 'Discussion Paw AI'}</h1>
              {scopeLabel ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Portée du partage : {scopeLabel}
                  {data.createdAt ? ` · ${new Date(data.createdAt).toLocaleString('fr-FR')}` : ''}
                </p>
              ) : null}
            </div>

            <div className="space-y-8">
              {(data.messages || []).map((m, i) => (
                <article
                  key={i}
                  className={`rounded-lg border p-4 sm:p-5 ${
                    m.role === 'user' ? 'border-primary/25 bg-primary/5' : 'border-border bg-card'
                  }`}
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {m.role === 'user' ? 'Question' : m.isError ? 'Paw AI (erreur)' : 'Paw AI'}
                  </p>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <LexiaMarkdown content={m.content} />
                  </div>
                </article>
              ))}
            </div>

            <footer className="mt-10 rounded-lg border border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
              <p>
                Contenu généré par Paw AI à titre informatif. Vérifier les sources officielles. Non substitutif d’un
                accompagnement personnalisé par{' '}
                <Link href="/" className="font-semibold text-primary underline-offset-2 hover:underline">
                  Ada Papers
                </Link>
                .
              </p>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
