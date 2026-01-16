'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { dossiersAPI, documentsAPI } from '@/lib/api';
import { ArrowLeft, FileText, Download, Eye, Calendar, User } from 'lucide-react';
import Link from 'next/link';
import { DocumentPreview } from '@/components/DocumentPreview';

export default function AdminDossierDocumentsPage() {
  const params = useParams();
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
    if (typeof value === 'object' && value.toString) {
      try {
        return value.toString();
      } catch (e) {
        return '';
      }
    }
    return '';
  };
  
  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    try {
      return new Date(date).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'N/A';
    }
  };
  
  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Link 
          href={`/admin/dossiers/${dossierId}`}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour au dossier
        </Link>
        
        {/* En-tête du dossier */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <h1 className="text-3xl font-bold mb-2 text-foreground">
            Documents du dossier
          </h1>
          {dossier && (
            <div className="space-y-2">
              <p className="text-lg text-gray-700 font-medium">
                {safeString(dossier.titre) || safeString(dossier.numero) || 'Sans titre'}
              </p>
              {dossier.numero && (
                <p className="text-sm text-gray-500">
                  N° {safeString(dossier.numero)}
                </p>
              )}
              {dossier.user && typeof dossier.user === 'object' && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="w-4 h-4" />
                  <span>
                    {safeString(dossier.user.firstName)} {safeString(dossier.user.lastName)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Liste des documents */}
        {documents.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center border border-gray-200">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-lg font-medium">Aucun document dans ce dossier</p>
            <p className="text-gray-400 text-sm mt-2">Les documents ajoutés à ce dossier apparaîtront ici</p>
          </div>
        ) : (
          <div className="space-y-4">
            {documents.map((doc: any) => {
              const docId = doc._id || doc.id;
              const docNom = safeString(doc.nom) || 'Document';
              const docTaille = typeof doc.taille === 'number' ? formatFileSize(doc.taille) : 'N/A';
              const docType = safeString(doc.typeMime) || safeString(doc.categorie) || 'Document';
              const uploadDate = doc.createdAt || doc.uploadedAt;
              
              return (
                <div
                  key={docId}
                  className="bg-white rounded-xl shadow-md p-6 border border-gray-200 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg text-foreground mb-2">{docNom}</h3>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <span className="font-medium">Type:</span> {docType}
                          </span>
                          {docTaille !== 'N/A' && (
                            <span className="flex items-center gap-1">
                              <span className="font-medium">Taille:</span> {docTaille}
                            </span>
                          )}
                          {uploadDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {formatDate(uploadDate)}
                            </span>
                          )}
                        </div>
                        {doc.description && (
                          <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                            {safeString(doc.description)}
                          </p>
                        )}
                        {doc.user && typeof doc.user === 'object' && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-2">
                            <User className="w-3 h-3" />
                            <span>
                              Ajouté par {safeString(doc.user.firstName)} {safeString(doc.user.lastName)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handlePreview(doc)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        Voir
                      </button>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2 transition-colors shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                        Télécharger
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Modal de prévisualisation */}
        {selectedDocument && (
          <DocumentPreview
            document={selectedDocument}
            isOpen={showPreview}
            onClose={() => {
              setShowPreview(false);
              setSelectedDocument(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
