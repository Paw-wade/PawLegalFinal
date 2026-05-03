'use client';

import { useState, useRef, useEffect } from 'react';
import { getPublicApiBaseUrl } from '@/lib/publicApiUrl';

interface PDFViewerProps {
  src: string;
  title: string;
  documentId: string;
  onDownload?: () => void;
}

export function PDFViewer({ src, title, documentId, onDownload }: PDFViewerProps) {
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Vérifier si le PDF se charge correctement
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      setError(null);
    };

    const handleError = () => {
      setError('Impossible de charger le PDF. Le fichier peut être corrompu ou inaccessible.');
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      iframe.removeEventListener('error', handleError);
    };
  }, [src]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 25, 50));
  };

  const handleZoomReset = () => {
    setZoom(100);
  };

  const handleOpenInNewTab = () => {
    window.open(src, '_blank');
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else {
      // Télécharger directement via l'API
      const downloadUrl = `${getPublicApiBaseUrl()}/user/documents/${documentId}/download`;
      
      // Créer un lien de téléchargement avec authentification
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', title);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Barre d'outils */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Zoom:</span>
          <button
            onClick={handleZoomOut}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
            title="Zoom arrière"
            disabled={zoom <= 50}
          >
            −
          </button>
          <span className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-medium min-w-[60px] text-center">
            {zoom}%
          </span>
          <button
            onClick={handleZoomIn}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
            title="Zoom avant"
            disabled={zoom >= 200}
          >
            +
          </button>
          <button
            onClick={handleZoomReset}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium ml-2"
            title="Réinitialiser le zoom"
          >
            ⟲
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenInNewTab}
            className="px-4 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm font-medium"
            title="Ouvrir dans un nouvel onglet"
          >
            🔗 Ouvrir
          </button>
          <button
            onClick={handleDownload}
            className="px-4 py-1.5 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
            title="Télécharger le document"
          >
            📥 Télécharger
          </button>
        </div>
      </div>

      {/* Viewer PDF */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto bg-gray-200 p-4"
        style={{ minHeight: '600px' }}
      >
        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center bg-white rounded-lg p-8 shadow-lg max-w-md">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold mb-2 text-red-600">Erreur de chargement</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
                >
                  Télécharger le document
                </button>
                <button
                  onClick={handleOpenInNewTab}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  Ouvrir dans un nouvel onglet
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <iframe
              ref={iframeRef}
              src={src}
              className="border border-gray-300 rounded-lg shadow-lg bg-white"
              style={{
                width: `${zoom}%`,
                height: '800px',
                minHeight: '600px',
                transition: 'width 0.3s ease',
              }}
              title={title}
              allow="fullscreen"
            />
          </div>
        )}
      </div>
    </div>
  );
}




