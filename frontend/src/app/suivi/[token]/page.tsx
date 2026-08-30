'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { dossiersAPI } from '@/lib/api';
import { getStatutColor, getStatutLabelWithEtapes } from '@/lib/dossierUtils';

interface SuiviData {
  dossier: {
    id: string;
    titre: string;
    numero: string | null;
    statut: string;
    etapesSupplementaires: any[];
    categorie: string;
    createdAt: string;
    updatedAt: string;
    clientPrenom: string;
  };
  compte?: { existe: boolean; email: string };
  documents: Array<{ id: string; nom: string; createdAt: string }>;
  mesDocuments: Array<{ id: string; nom: string; createdAt: string }>;
  documentRequests: Array<{ id: string; libelle: string; description: string; status: string }>;
}

export default function SuiviDossierPage() {
  const params = useParams();
  const token = String((params as any)?.token || '');
  const [data, setData] = useState<SuiviData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    try {
      const res = await dossiersAPI.getSuivi(token);
      if (res.data?.success) {
        setData(res.data);
        setError(null);
      } else {
        setError('Lien de suivi introuvable.');
      }
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
          (e?.response?.status === 404 ? 'Lien de suivi introuvable ou expiré.' : 'Impossible de charger le suivi.')
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
      return '';
    }
  };

  const handleUpload = async (file: File | undefined, requestId: string | null, key: string) => {
    if (!file) return;
    setUploadingId(key);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append('document', file);
      if (requestId) fd.append('requestId', requestId);
      const res = await dossiersAPI.uploadSuiviDocument(token, fd);
      if (res.data?.success) {
        setMessage('Document transmis avec succès. Merci.');
        await load();
      } else {
        setMessage('Le dépôt a échoué. Veuillez réessayer.');
      }
    } catch {
      setMessage('Le dépôt a échoué. Veuillez réessayer.');
    } finally {
      setUploadingId(null);
      if (fileInputs.current[key]) fileInputs.current[key]!.value = '';
    }
  };

  const handleDownload = async (docId: string, nom: string) => {
    try {
      const res = await dossiersAPI.downloadSuiviDocument(token, docId);
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nom || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMessage('Le téléchargement a échoué. Veuillez réessayer.');
    }
  };

  const etapes = data
    ? [...(data.dossier.etapesSupplementaires || [])].sort((a: any, b: any) => (a?.ordre ?? 0) - (b?.ordre ?? 0))
    : [];
  const fmtDate = (v: any) => {
    if (!v) return '';
    try {
      return new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-secondary/10">
      <Header variant="home" />

      <main className="container mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        {loading ? (
          <p className="py-16 text-center text-muted-foreground">Chargement du suivi…</p>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-700">{error}</p>
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* En-tête dossier */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suivi de votre demande</p>
              <h1 className="mt-1 text-2xl font-bold text-foreground">{data.dossier.titre || 'Votre dossier'}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatutColor(data.dossier.statut)}`}>
                  Statut : {getStatutLabelWithEtapes(data.dossier.statut, data.dossier.etapesSupplementaires)}
                </span>
                {data.dossier.numero && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                    Dossier n° {data.dossier.numero}
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Demande déposée le {formatDate(data.dossier.createdAt)}
              </p>
            </div>

            {message && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>
            )}

            {/* Avancement */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">Avancement</h2>
              <div className="mb-4 flex items-center gap-3 rounded-lg bg-primary/5 p-3">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary text-white">✓</span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Statut actuel</p>
                  <p className="text-sm font-semibold text-foreground">
                    {getStatutLabelWithEtapes(data.dossier.statut, data.dossier.etapesSupplementaires)}
                  </p>
                </div>
              </div>
              {etapes.length > 0 ? (
                <ol className="ml-1 space-y-4 border-l-2 border-primary/20 pl-5">
                  {etapes.map((e: any, i: number) => (
                    <li key={e.id || e._id || i} className="relative">
                      <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-white" />
                      <p className="text-sm font-medium text-foreground">{e.label}</p>
                      {e.date && <p className="text-xs text-muted-foreground">{fmtDate(e.date)}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Votre demande est bien enregistrée. Son avancement s'affichera ici au fur et à mesure du traitement.
                </p>
              )}
            </div>

            {/* Documents demandés */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">Documents demandés</h2>
              {data.documentRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun document n'est demandé pour l'instant.</p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {data.documentRequests.map((r) => (
                    <li key={r.id} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                      <p className="text-sm font-medium text-foreground">{r.libelle}</p>
                      {r.description && <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>}
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          ref={(el) => { fileInputs.current[r.id] = el; }}
                          type="file"
                          disabled={uploadingId === r.id}
                          onChange={(e) => handleUpload(e.target.files?.[0], r.id, r.id)}
                          className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-primary/90"
                        />
                        {uploadingId === r.id && <span className="text-xs text-muted-foreground">Envoi…</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Dépôt libre (document supplémentaire) */}
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="mb-2 text-xs text-muted-foreground">Vous pouvez aussi ajouter un autre document :</p>
                <input
                  ref={(el) => { fileInputs.current['__free'] = el; }}
                  type="file"
                  disabled={uploadingId === '__free'}
                  onChange={(e) => handleUpload(e.target.files?.[0], null, '__free')}
                  className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-50"
                />
                {uploadingId === '__free' && <span className="text-xs text-muted-foreground">Envoi…</span>}
              </div>
            </div>

            {/* Vos documents transmis */}
            {data.mesDocuments.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Vos documents transmis</h2>
                <ul className="space-y-2">
                  {data.mesDocuments.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm text-foreground">📎 {d.nom}</span>
                      <div className="flex flex-none items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatDate(d.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => handleDownload(d.id, d.nom)}
                          className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Télécharger
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Documents partagés */}
            {data.documents.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Documents partagés par le cabinet</h2>
                <ul className="space-y-2">
                  {data.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-foreground">📄 {d.nom}</span>
                      <div className="flex flex-none items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatDate(d.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => handleDownload(d.id, d.nom)}
                          className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Télécharger
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Invitation compte / connexion */}
            {data.compte && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center sm:p-6">
                {data.compte.existe ? (
                  <>
                    <p className="text-sm font-medium text-foreground">Vous avez déjà un compte Ada Papers.</p>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Connectez-vous pour retrouver votre dossier et un suivi complet dans votre espace personnel.
                    </p>
                    <a
                      href={`/auth/signin${data.compte.email ? `?email=${encodeURIComponent(data.compte.email)}` : ''}`}
                      className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                    >
                      Se connecter
                    </a>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">Suivez votre dossier en permanence.</p>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Créez votre compte avec la même adresse e-mail : votre dossier y sera automatiquement rattaché.
                    </p>
                    <a
                      href={`/auth/signup${data.compte.email ? `?email=${encodeURIComponent(data.compte.email)}` : ''}`}
                      className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                    >
                      Créer mon compte
                    </a>
                  </>
                )}
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground">
              Conservez ce lien : il vous permet de suivre votre dossier et de déposer vos documents à tout moment.
            </p>
          </div>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
