'use client';

import { useState, useEffect } from 'react';
import { documentsAPI } from '@/lib/api';
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

export function DocumentPreview({ document, isOpen, onClose }: DocumentPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const documentId = document._id || document.id;

  useEffect(() => {
    if (isOpen && documentId) {
      setIsLoading(true);
      setError(null);
      
      const isPDF = document.typeMime?.includes('pdf');
      const isImage = document.typeMime?.includes('image');
      
      if (isPDF || isImage) {
        // Pour PDF et images, utiliser l'URL directe avec token dans les headers via iframe
        const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
        
        if (!token) {
          console.error('❌ Aucun token trouvé pour la prévisualisation');
          setError('Vous devez être connecté pour prévisualiser ce document.');
          setIsLoading(false);
          return;
        }
        
        // Utiliser la même logique que api.ts pour éviter le double /api
        let baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
        // Si baseURL contient déjà /api, ne pas l'ajouter à nouveau
        const url = baseURL.endsWith('/api') 
          ? `${baseURL}/user/documents/${documentId}/preview`
          : `${baseURL}/api/user/documents/${documentId}/preview`;
        
        console.log('📄 URL de prévisualisation:', url);
        console.log('📄 Token présent:', token ? 'Oui' : 'Non');
        
        // Pour les PDF dans iframe, on peut utiliser l'URL directement
        // L'authentification sera gérée par le backend via les cookies ou headers
        if (isPDF) {
          // Créer une URL avec token pour l'iframe (le backend doit accepter le token en query param ou via cookie)
          const previewUrlWithToken = `${url}?token=${encodeURIComponent(token)}`;
          console.log('📄 URL PDF avec token:', previewUrlWithToken.substring(0, 100) + '...');
          setPreviewUrl(previewUrlWithToken);
          setIsLoading(false);
        } else if (isImage) {
          // Pour les images, charger le blob
          console.log('🖼️ Chargement de l\'image avec fetch...');
          fetch(url, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
            .then(response => {
              console.log('📄 Réponse fetch:', response.status, response.statusText);
              if (!response.ok) {
                if (response.status === 401) {
                  throw new Error('Token invalide ou expiré. Veuillez vous reconnecter.');
                } else if (response.status === 403) {
                  throw new Error('Accès non autorisé à ce document.');
                } else if (response.status === 404) {
                  throw new Error('Document non trouvé.');
                }
                throw new Error(`Erreur ${response.status}: ${response.statusText}`);
              }
              return response.blob();
            })
            .then(blob => {
              console.log('✅ Image chargée avec succès, taille:', blob.size);
              const objectUrl = URL.createObjectURL(blob);
              setPreviewUrl(objectUrl);
              setIsLoading(false);
            })
            .catch(err => {
              console.error('❌ Erreur lors de la prévisualisation:', err);
              setError(err.message || 'Impossible de prévisualiser ce document.');
              setIsLoading(false);
            });
        }
      } else {
        setError('La prévisualisation n\'est disponible que pour les PDF et les images.');
        setIsLoading(false);
      }
    }

    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [isOpen, documentId, document.typeMime]);

  if (!isOpen) return null;

  const isPDF = document.typeMime?.includes('pdf');
  const isImage = document.typeMime?.includes('image');
  const canPreview = isPDF || isImage;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {isPDF ? '📄' : isImage ? '🖼️' : '📎'}
            </span>
            <div>
              <h3 className="font-semibold text-lg">{document.nom}</h3>
              <p className="text-xs text-muted-foreground">
                {document.typeMime || 'Type inconnu'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-2xl font-bold"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 bg-gray-100">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Chargement de la prévisualisation...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-6xl mb-4">⚠️</div>
                <p className="text-muted-foreground mb-4">{error}</p>
                <button
                  onClick={async () => {
                    if (!documentId) return;
                    const url = await documentsAPI.previewDocument(documentId);
                    window.open(url, '_blank');
                  }}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
                >
                  Ouvrir dans un nouvel onglet
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
                      const link = document.createElement('a');
                      link.href = url;
                      link.setAttribute('download', document.nom);
                      document.body.appendChild(link);
                      link.click();
                      link.remove();
                      window.URL.revokeObjectURL(url);
                    } catch (err: any) {
                      console.error('Erreur lors du téléchargement:', err);
                      alert('Erreur lors du téléchargement du document');
                    }
                  }}
                />
              ) : isImage ? (
                <img
                  src={previewUrl}
                  alt={document.nom}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                />
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-6xl mb-4">📎</div>
                <p className="text-muted-foreground mb-4">
                  La prévisualisation n'est pas disponible pour ce type de fichier.
                </p>
                <p className="text-sm text-muted-foreground">
                  Veuillez télécharger le fichier pour l'ouvrir.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-white">
          <p className="text-xs text-muted-foreground">
            {canPreview ? 'Prévisualisation' : 'Téléchargement requis'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
                let baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
                // Si baseURL contient déjà /api, ne pas l'ajouter à nouveau
                const url = baseURL.endsWith('/api')
                  ? `${baseURL}/user/documents/${documentId}/preview?token=${encodeURIComponent(token)}`
                  : `${baseURL}/api/user/documents/${documentId}/preview?token=${encodeURIComponent(token)}`;
                window.open(url, '_blank');
              }}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition-colors"
            >
              Ouvrir dans un nouvel onglet
            </button>
            <button
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

