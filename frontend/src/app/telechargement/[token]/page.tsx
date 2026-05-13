'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { getPublicApiBaseUrl } from '@/lib/publicApiUrl';

type ShareInfo = {
  success: boolean;
  title?: string;
  fileName?: string;
  mimeType?: string;
  expiresAt?: string;
  message?: string;
  messageError?: string;
};

export default function PublicDownloadPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setInfo({ success: false, messageError: 'Lien invalide.' });
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const base = getPublicApiBaseUrl();
        const res = await fetch(
          `${base}/document-download-share/public/${encodeURIComponent(token)}`,
          { headers: { Accept: 'application/json' } }
        );
        const json = (await res.json()) as ShareInfo & { message?: string };
        if (!cancelled) {
          if (!res.ok || !json?.success) {
            setInfo({
              success: false,
              messageError: json?.messageError || json?.message || 'Lien indisponible.',
            });
          } else {
            setInfo(json);
          }
        }
      } catch {
        if (!cancelled) setInfo({ success: false, messageError: 'Impossible de charger le lien.' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const expiryLabel =
    info?.expiresAt &&
    new Date(info.expiresAt).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const handleDownload = () => {
    if (!token) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      const base = getPublicApiBaseUrl();
      window.location.assign(
        `${base}/document-download-share/public/${encodeURIComponent(token)}/file`
      );
    } catch {
      setDownloadError('Le téléchargement a échoué. Réessayez ou contactez Ada Papers.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-8 sm:flex-row sm:justify-between">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ada-papers-wordmark.svg" alt="Ada Papers" width={180} height={44} className="h-9 w-auto" />
          </Link>
          <span className="text-xs text-muted-foreground">Téléchargement sécurisé</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : !info?.success ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
            <h1 className="text-lg font-semibold text-destructive">Lien indisponible</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {info?.messageError || 'Ce lien est expiré ou invalide. Contactez Ada Papers pour en obtenir un nouveau.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold">{info.title || 'Document'}</h1>
              {info.fileName && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Fichier : <span className="font-medium text-foreground">{info.fileName}</span>
                </p>
              )}
              {expiryLabel && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Lien valable jusqu’au {expiryLabel} (plusieurs téléchargements possibles).
                </p>
              )}
              {info.message ? (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/80 p-4 text-sm text-blue-950">
                  <p className="font-medium">Message du cabinet</p>
                  <p className="mt-1 whitespace-pre-wrap">{info.message}</p>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm text-muted-foreground">
                Vous pouvez télécharger ce document sans créer de compte Ada Papers.
              </p>
              {downloadError && <p className="mt-3 text-sm text-destructive">{downloadError}</p>}
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden />
                {downloading ? 'Préparation…' : 'Télécharger le document'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
