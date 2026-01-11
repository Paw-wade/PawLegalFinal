'use client';

import { useEffect, useState } from 'react';
import { documentsAPI } from '@/lib/api';
import { FileText, Download } from 'lucide-react';

export default function PartenaireDocumentsPage() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Fonction pour convertir en string de manière sécurisée
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    // Si c'est un objet, ne pas le convertir, retourner une chaîne vide
    if (typeof value === 'object') {
      console.warn('Tentative de convertir un objet en string:', value);
      return '';
    }
    return '';
  };
  
  useEffect(() => {
    loadDocuments();
  }, []);
  
  const loadDocuments = async () => {
    try {
      setLoading(true);
      const response = await documentsAPI.getMyDocuments();
      if (response.data.success) {
        setDocuments(response.data.documents || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des documents:', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Documents</h1>
      
      {documents.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Aucun document pour le moment</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc: any) => {
            const docId = safeString(doc._id) || safeString(doc.id) || '';
            const docNom = safeString(doc.nom) || safeString(doc.filename) || 'Document';
            const docType = safeString(doc.type) || 'Type inconnu';
            const docTaille = typeof doc.taille === 'number' ? `${(doc.taille / 1024).toFixed(2)} KB` : '';
            const downloadUrl = docId ? `/api/user/documents/${docId}/download` : '#';
            
            return (
              <div
                key={docId || `doc-${Math.random()}`}
                className="bg-white rounded-lg shadow p-6 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <FileText className="w-8 h-8 text-primary" />
                  <div>
                    <h3 className="font-semibold">{docNom}</h3>
                    <p className="text-sm text-gray-600">
                      {docType}{docTaille ? ` • ${docTaille}` : ''}
                    </p>
                  </div>
                </div>
                {docId && (
                  <a
                    href={downloadUrl}
                    download
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Télécharger
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

