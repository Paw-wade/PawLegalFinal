'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getPublicApiBaseUrl } from '@/lib/publicApiUrl';

type InviteInfo = {
  success: boolean;
  dossierTitle?: string;
  expiresAt?: string;
  message?: string;
  messageError?: string;
};

const CATEGORIES = [
  { value: 'identite', label: 'Pièce d’identité' },
  { value: 'titre_sejour', label: 'Titre de séjour' },
  { value: 'contrat', label: 'Contrat' },
  { value: 'facture', label: 'Facture' },
  { value: 'autre', label: 'Autre' },
];

export default function DossierGuestDepotPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [categorie, setCategorie] = useState('autre');
  const [contributorName, setContributorName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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
        const res = await fetch(`${base}/dossier-guest-upload/public/${encodeURIComponent(token)}`, {
          headers: { Accept: 'application/json' },
        });
        const json = (await res.json()) as InviteInfo;
        if (!cancelled) setInfo(json);
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    setUploadSuccess(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadError('Veuillez sélectionner un fichier.');
      return;
    }
    if (!nom.trim()) {
      setUploadError('Indiquez un nom pour le document.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('nom', nom.trim());
      formData.append('description', description.trim());
      formData.append('categorie', categorie);
      if (contributorName.trim()) formData.append('contributorName', contributorName.trim());

      const base = getPublicApiBaseUrl();
      const res = await fetch(`${base}/dossier-guest-upload/public/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Échec du dépôt.');
      }
      setUploadSuccess('Document transmis avec succès. Vous pouvez en déposer un autre si nécessaire.');
      setNom('');
      setDescription('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Erreur lors du dépôt.');
    } finally {
      setUploading(false);
    }
  };

  const expiryLabel =
    info?.expiresAt &&
    new Date(info.expiresAt).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-8 sm:flex-row sm:justify-between">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ada-papers-wordmark.svg" alt="Ada Papers" width={180} height={44} className="h-9 w-auto" />
          </Link>
          <span className="text-xs text-muted-foreground">Dépôt sécurisé de document</span>
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
              <h1 className="text-xl font-semibold">Transmettre un document</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Dossier : <span className="font-medium text-foreground">{info.dossierTitle}</span>
              </p>
              {expiryLabel && (
                <p className="mt-1 text-xs text-muted-foreground">Lien valable jusqu’au {expiryLabel} (plusieurs dépôts possibles).</p>
              )}
              {info.message ? (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/80 p-4 text-sm text-blue-950">
                  <p className="font-medium">Message de notre équipe</p>
                  <p className="mt-1 whitespace-pre-wrap">{info.message}</p>
                </div>
              ) : null}
            </div>

            <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
              <div>
                <label className="text-sm font-medium" htmlFor="contributorName">
                  Votre nom (optionnel)
                </label>
                <input
                  id="contributorName"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={contributorName}
                  onChange={(e) => setContributorName(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="nom">
                  Nom du document *
                </label>
                <input
                  id="nom"
                  required
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="categorie">
                  Catégorie
                </label>
                <select
                  id="categorie"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={categorie}
                  onChange={(e) => setCategorie(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="description">
                  Commentaire (optionnel)
                </label>
                <textarea
                  id="description"
                  rows={3}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="file">
                  Fichier * (max. 10 Mo)
                </label>
                <input
                  id="file"
                  ref={fileRef}
                  type="file"
                  required
                  className="mt-1 block w-full text-sm"
                />
              </div>
              {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
              {uploadSuccess && <p className="text-sm text-green-700">{uploadSuccess}</p>}
              <button
                type="submit"
                disabled={uploading}
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {uploading ? 'Envoi en cours…' : 'Envoyer le document'}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
