'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { dossiersAPI, documentsAPI } from '@/lib/api';
import { ArrowLeft, FileText, Download, Eye } from 'lucide-react';
import Link from 'next/link';

export default function PartenaireDossierDocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const dossierId = params.id as string;
  
  const [dossier, setDossier] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  
  useEffect(() => {
    if (dossierId) {
      loadDossier();
      loadDocuments();
    }
  }, [dossierId]);
  
  const loadDossier = async () => {
    try {
      const response = await dossiersAPI.getDossierById(dossierId);
      if (response.data.success && response.data.dossier) {
        setDossier(response.data.dossier);
      }
    } catch (error) {
      console.error('Erreur lors du chargement du dossier:', error);
    }
  };
  
  const loadDocuments = async () => {
    try {
      setLoading(true);
      // Utiliser la route spécifique pour récupérer les documents du dossier
      const response = await documentsAPI.getDossierDocuments(dossierId);
      if (response.data.success) {
        setDocuments(response.data.documents || []);
      } else {
        // Fallback : essayer avec getAllDocuments
        const fallbackResponse = await documentsAPI.getAllDocuments();
        if (fallbackResponse.data.success) {
          const allDocs = fallbackResponse.data.documents || fallbackResponse.data.data || [];
          const dossierDocs = allDocs.filter((doc: any) => {
            const docDossierId = doc.dossierId?._id || doc.dossierId;
            return docDossierId && docDossierId.toString() === dossierId;
          });
          setDocuments(dossierDocs);
        }
      }
    } catch (error: any) {
      console.error('Erreur lors du chargement des documents:', error);
      // Si l'erreur est 403, c'est que le partenaire n'a pas accès
      if (error.response?.status === 403) {
        console.error('Accès refusé aux documents du dossier');
      }
    } finally {
      setLoading(false);
    }
  };
  
  const handleDownload = async (doc: any) => {
    try {
      const docId = doc._id || doc.id;
      const response = await documentsAPI.downloadDocument(docId);
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.nom || 'document';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Erreur lors du téléchargement:', error);
      alert(error.response?.data?.message || 'Erreur lors du téléchargement du document');
    }
  };
  
  const handlePreview = (doc: any) => {
    setSelectedDocument(doc);
    setShowPreview(true);
  };
  
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    return '';
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
      <Link 
        href={`/partenaire/dossiers/${dossierId}`}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour au dossier
      </Link>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h1 className="text-2xl font-bold mb-2">
          Documents du dossier
        </h1>
        {dossier && (
          <p className="text-gray-600">
            {safeString(dossier.titre) || safeString(dossier.numero) || 'Sans titre'}
          </p>
        )}
      </div>
      
      {documents.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Aucun document dans ce dossier</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc: any) => {
            const docId = doc._id || doc.id;
            const docNom = safeString(doc.nom) || 'Document';
            const docTaille = typeof doc.taille === 'number' ? `${(doc.taille / 1024).toFixed(2)} KB` : '';
            const docType = safeString(doc.typeMime) || safeString(doc.categorie) || 'Document';
            
            return (
              <div
                key={docId}
                className="bg-white rounded-lg shadow p-6 flex items-center justify-between"
              >
                <div className="flex items-center gap-4 flex-1">
                  <FileText className="w-10 h-10 text-primary" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{docNom}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {docType}{docTaille ? ` • ${docTaille}` : ''}
                    </p>
                    {doc.description && (
                      <p className="text-sm text-gray-500 mt-1">{safeString(doc.description)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePreview(doc)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Voir
                  </button>
                  <button
                    onClick={() => handleDownload(doc)}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Télécharger
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Modal de prévisualisation */}
      {showPreview && selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{safeString(selectedDocument.nom)}</h2>
              <button
                onClick={() => {
                  setShowPreview(false);
                  setSelectedDocument(null);
                }}
                className="text-gray-600 hover:text-gray-800"
              >
                ✕
              </button>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Type: {safeString(selectedDocument.typeMime)} • 
                Taille: {typeof selectedDocument.taille === 'number' ? `${(selectedDocument.taille / 1024).toFixed(2)} KB` : 'N/A'}
              </p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => handleDownload(selectedDocument)}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Télécharger
              </button>
              <button
                onClick={() => {
                  setShowPreview(false);
                  setSelectedDocument(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Fermer
              </button>
            </div>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Pour prévisualiser le document, veuillez le télécharger.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
