'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { documentsAPI, getApiBaseUrl, getAuthToken } from '@/lib/api';
import { PDFViewer } from './PDFViewer';

interface DocumentPreviewProps {
  document: {
    _id?: string;
    id?: string;
    nom: string;
    typeMime: string;
  };
  isOpen: boolean;
  onClose: () => void;
}

function isPdfDoc(doc: { typeMime?: string; nom: string }) {
  if (doc.typeMime?.toLowerCase().includes('pdf')) return true;
  return /\.pdf$/i.test(doc.nom || '');
}

function isImageDoc(doc: { typeMime?: string; nom: string }) {
  if (doc.typeMime?.toLowerCase().includes('image')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(doc.nom || '');
}

function isWordDoc(doc: { typeMime?: string; nom: string }) {
  const mime = (doc.typeMime || '').toLowerCase();
  if (mime.includes('word') || mime.includes('officedocument.wordprocessingml.document')) return true;
  return /\.(docx?|odt)$/i.test(doc.nom || '');
}

export function DocumentPreview({ document, isOpen, onClose }: DocumentPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const blobRef = useRef<string | null>(null);

  const documentId = document._id || document.id;

  useEffect(() => {
    if (!isOpen || !documentId) {
      return;
    }

    let cancelled = false;

    const revokeCurrentBlob = () => {
      if (blobRef.current) {
        try {
          URL.revokeObjectURL(blobRef.current);
        } catch {
          /* ignore */
        }
        blobRef.current = null;
      }
    };

    const run = async () => {
      setIsLoading(true);
      setError(null);
      revokeCurrentBlob();
      setPreviewUrl(null);

      const canPdf = isPdfDoc(document);
      const canImg = isImageDoc(document);
      const canWord = isWordDoc(document);

      if (!canPdf && !canImg && !canWord) {
        setError("La prévisualisation n'est disponible que pour les PDF, images et fichiers Word.");
        setIsLoading(false);
        return;
      }

      const token = await getAuthToken();
      if (!token) {
        setError('Vous devez être connecté pour prévisualiser ce document.');
        setIsLoading(false);
        return;
      }

      const baseUrl = getApiBaseUrl();
      const url = `${baseUrl}/user/documents/${encodeURIComponent(documentId)}/preview`;

      // Utiliser le token en query param pour eviter le CORS sur le redirect 302 vers R2.
      // Le navigateur charge le contenu via navigation directe, sans fetch cross-origin.
      const secureUrl = `${url}?token=${encodeURIComponent(token)}`;

      if (canWord) {
        const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(secureUrl)}`;
        setPreviewUrl(officeViewerUrl);
        setIsLoading(false);
        return;
      }

      if (!cancelled) {
        revokeCurrentBlob();
        setPreviewUrl(secureUrl);
        setIsLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      revokeCurrentBlob();
      setPreviewUrl(null);
    };
  }, [isOpen, documentId, document.nom, document.typeMime]);

  useEffect(() => {
    if (!isOpen) return;
    const doc = globalThis.document;
    if (!doc?.body) return;
    const prev = doc.body.style.overflow;
    doc.body.style.overflow = 'hidden';
    return () => {
      doc.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;
  if (typeof window === 'undefined') return null;

  const isPDF = isPdfDoc(document);
  const isImage = isImageDoc(document);
  const isWord = isWordDoc(document);
  const canPreview = isPDF || isImage || isWord;


  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 p-0 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-[min(100dvh,100%)] w-full max-h-[100dvh] flex-col rounded-t-xl border border-gray-200 bg-white shadow-2xl sm:h-auto sm:max-h-[min(92dvh,56rem)] sm:max-w-[min(calc(100vw-2rem),72rem)] sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-preview-title"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-3 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <span className="shrink-0 text-xl sm:text-2xl" aria-hidden>
              {isPDF ? '📄' : isImage ? '🖼️' : isWord ? '📝' : '📎'}
            </span>
            <div className="min-w-0">
              <h3 id="document-preview-title" className="truncate text-base font-semibold sm:text-lg">
                {document.nom}
              </h3>
              <p className="truncate text-xs text-muted-foreground">{document.typeMime || 'Type inconnu'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-2 text-2xl leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            type="button"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Content - hauteur flexible, évite de dépasser sous la sidebar (z-index au-dessus) */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-100">
          {isLoading ? (
            <div className="flex min-h-[12rem] flex-1 items-center justify-center px-4 py-8">
              <div className="text-center">
                <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
                <p className="text-sm text-muted-foreground">Chargement de la prévisualisation…</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex min-h-[12rem] flex-1 items-center justify-center overflow-y-auto px-4 py-8">
              <div className="max-w-md px-4 text-center">
                <div className="mb-4 text-5xl sm:text-6xl">⚠️</div>
                <p className="mb-4 text-sm text-muted-foreground">{error}</p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const directUrl = await documentsAPI.previewDocument(documentId || '');
                      window.open(directUrl, '_blank', 'noopener,noreferrer');
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Echec de la nouvelle tentative.');
                    }
                  }}
                  className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
                >
                  Ouvrir dans un nouvel onglet
                </button>
              </div>
            </div>
          ) : canPreview && previewUrl ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {isPDF ? (
                <PDFViewer
                  variant="modal"
                  src={previewUrl}
                  title={document.nom}
                  documentId={documentId || ''}
                  onDownload={async () => {
                    try {
                      await documentsAPI.downloadAndSave(documentId || '', document.nom);
                    } catch (err: unknown) {
                      console.error('Erreur lors du téléchargement:', err);
                      alert('Erreur lors du téléchargement du document');
                    }
                  }}
                />
              ) : isWord ? (
                <iframe
                  src={previewUrl}
                  title={document.nom}
                  className="min-h-0 w-full flex-1 rounded-none border-0 border-gray-300 bg-white sm:min-h-[min(70vh,520px)] sm:rounded-lg sm:border"
                  allow="fullscreen"
                />
              ) : isImage ? (
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-4">
                  <img
                    src={previewUrl}
                    alt={document.nom}
                    className="max-h-[min(75dvh,calc(100dvh-10rem))] max-w-full object-contain rounded-lg shadow-lg"
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-[12rem] flex-1 items-center justify-center px-4 py-8">
              <div className="text-center">
                <div className="mb-4 text-5xl sm:text-6xl">📎</div>
                <p className="mb-4 text-sm text-muted-foreground">
                  La prévisualisation n'est pas disponible pour ce type de fichier.
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Veuillez télécharger le fichier pour l'ouvrir.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-white px-3 py-3 sm:px-4">
          <p className="min-w-0 text-xs text-muted-foreground">
            {canPreview ? 'Prévisualisation sécurisée' : 'Téléchargement requis'}
          </p>
          <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
            {previewUrl && (
              <button
                type="button"
                onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                className="flex-1 rounded-md bg-gray-100 px-3 py-2 text-sm transition-colors hover:bg-gray-200 sm:flex-none sm:px-4"
              >
                Nouvel onglet
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-sm text-white transition-colors hover:bg-primary/90 sm:flex-none sm:px-4"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, globalThis.document.body);
}
