'use client';

import { useState, useEffect, useRef } from 'react';
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
    const abortController = new AbortController();

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

      if (!canPdf && !canImg) {
        setError("La prévisualisation n'est disponible que pour les PDF et les images.");
        setIsLoading(false);
        return;
      }

      const token = await getAuthToken();
      if (!token) {
        setError('Vous devez être connecté pour prévisualiser ce document.');
        setIsLoading(false);
        return;
      }

      const url = `${getApiBaseUrl()}/user/documents/${encodeURIComponent(documentId)}/preview`;

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: 'omit',
          signal: abortController.signal,
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Session expirée ou token invalide. Veuillez vous reconnecter.');
          }
          if (response.status === 403) {
            throw new Error('Accès non autorisé à ce document.');
          }
          if (response.status === 404) {
            let detail =
              'Document ou fichier introuvable. Si le document est ancien, le fichier peut avoir été perdu sur le serveur — importez-le à nouveau.';
            try {
              const ct = response.headers.get('content-type');
              if (ct?.includes('application/json')) {
                const j = (await response.json()) as { code?: string; message?: string };
                if (j.code === 'FILE_NOT_FOUND') {
                  detail =
                    'Le fichier est absent du dossier de stockage du serveur (uploads). Ré-uploadez le document ou contactez l’administrateur.';
                } else if (j.code === 'DOCUMENT_NOT_FOUND') {
                  detail = "Ce document n'existe plus en base de données.";
                } else if (j.message) {
                  detail = j.message;
                }
              }
            } catch {
              /* ignore parse */
            }
            throw new Error(detail);
          }
          const t = await response.text().catch(() => '');
          throw new Error(
            `Erreur ${response.status}${t ? `: ${t.slice(0, 160)}` : ''}`
          );
        }

        const blob = await response.blob();
        if (cancelled) return;

        const objectUrl = URL.createObjectURL(blob);
        revokeCurrentBlob();
        blobRef.current = objectUrl;
        setPreviewUrl(objectUrl);
      } catch (err: unknown) {
        if (cancelled || (err instanceof Error && err.name === 'AbortError')) return;
        const message = err instanceof Error ? err.message : 'Impossible de prévisualiser ce document.';
        setError(message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      abortController.abort();
      revokeCurrentBlob();
      setPreviewUrl(null);
    };
  }, [isOpen, documentId, document.nom, document.typeMime]);

  if (!isOpen) return null;

  const isPDF = isPdfDoc(document);
  const isImage = isImageDoc(document);
  const canPreview = isPDF || isImage;

  const openBlobInNewTab = () => {
    if (previewUrl?.startsWith('blob:')) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl flex-shrink-0">
              {isPDF ? '📄' : isImage ? '🖼️' : '📎'}
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold text-lg truncate">{document.nom}</h3>
              <p className="text-xs text-muted-foreground truncate">
                {document.typeMime || 'Type inconnu'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-2xl font-bold flex-shrink-0"
            type="button"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 bg-gray-100">
          {isLoading ? (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                <p className="text-muted-foreground">Chargement de la prévisualisation…</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <div className="text-center max-w-md px-4">
                <div className="text-6xl mb-4">⚠️</div>
                <p className="text-muted-foreground mb-4">{error}</p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const blobUrl = await documentsAPI.previewDocument(documentId || '');
                      window.open(blobUrl, '_blank', 'noopener,noreferrer');
                      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Échec de la nouvelle tentative.');
                    }
                  }}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
                >
                  Réessayer dans un nouvel onglet
                </button>
              </div>
            </div>
          ) : canPreview && previewUrl ? (
            <div className="flex items-center justify-center h-full">
              {isPDF ? (
                <PDFViewer
                  src={previewUrl}
                  title={document.nom}
                  documentId={documentId || ''}
                  onDownload={async () => {
                    try {
                      const response = await documentsAPI.downloadDocument(documentId || '');
                      const url = window.URL.createObjectURL(new Blob([response.data]));
                      const link = window.document.createElement('a');
                      link.href = url;
                      link.setAttribute('download', document.nom);
                      window.document.body.appendChild(link);
                      link.click();
                      link.remove();
                      window.URL.revokeObjectURL(url);
                    } catch (err: unknown) {
                      console.error('Erreur lors du téléchargement:', err);
                      alert('Erreur lors du téléchargement du document');
                    }
                  }}
                />
              ) : isImage ? (
                <img
                  src={previewUrl}
                  alt={document.nom}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                />
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <div className="text-center">
                <div className="text-6xl mb-4">📎</div>
                <p className="text-muted-foreground mb-4">
                  La prévisualisation n&apos;est pas disponible pour ce type de fichier.
                </p>
                <p className="text-sm text-muted-foreground">Veuillez télécharger le fichier pour l&apos;ouvrir.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-white gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {canPreview ? 'Prévisualisation sécurisée (fichier chargé en mémoire)' : 'Téléchargement requis'}
          </p>
          <div className="flex gap-2">
            {previewUrl?.startsWith('blob:') && (
              <button
                type="button"
                onClick={openBlobInNewTab}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition-colors"
              >
                Ouvrir dans un nouvel onglet
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 text-sm transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
