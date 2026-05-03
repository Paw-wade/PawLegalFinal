'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { dossiersAPI, documentsAPI } from '@/lib/api';
import { ArrowLeft, FileText, Download, Eye, User } from 'lucide-react';
import Link from 'next/link';
import { DocumentPreview } from '@/components/DocumentPreview';
import { Toast } from '@/components/Toast';

export default function AdminDossierDocumentsPage() {
  const params = useParams();
  const dossierId = params.id as string;
  
  const [dossier, setDossier] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  
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
      const response = await dossiersAPI.getDossierDocuments(dossierId);
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
      setToast({ message: error.response?.data?.message || 'Erreur lors du téléchargement du document', type: 'error' });
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
  
  const getCategoryLabel = (categorie: string) => {
    const labels: Record<string, string> = {
      identite: 'Identité',
      titre_sejour: 'Titre de séjour',
      contrat: 'Contrat',
      facture: 'Facture',
      autre: 'Autre'
    };
    return labels[categorie] || categorie;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/5">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 pb-8">
        <Link 
          href={`/admin/dossiers/${dossierId}`}
          className="inline-flex items-center gap-2 text-sm sm:text-base text-gray-600 hover:text-primary mb-4 sm:mb-6 transition-colors min-h-[44px] sm:min-h-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour au dossier
        </Link>
        
        {/* En-tête du dossier */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6 border border-gray-200">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-2 text-foreground">
            Documents du dossier
          </h1>
          {dossier && (
            <div className="space-y-2">
              <p className="text-base sm:text-lg text-gray-700 font-medium break-words">
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
          <div className="bg-white rounded-xl shadow-lg p-8 sm:p-12 text-center border border-gray-200">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-lg font-medium">Aucun document dans ce dossier</p>
            <p className="text-gray-400 text-sm mt-2">Les documents ajoutés à ce dossier apparaîtront ici</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
            {documents.map((doc: any) => {
              const docId = doc._id || doc.id;
              const docNom = safeString(doc.nom) || 'Document';

              return (
                <div key={docId} className="p-4 sm:p-5 md:p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground mb-1 text-sm sm:text-base break-words sm:truncate">{docNom}</h3>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-md text-xs font-medium">
                          {getCategoryLabel(safeString(doc.categorie) || 'autre')}
                        </span>
                      </div>
                      {doc.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-3 sm:line-clamp-2">
                          {safeString(doc.description)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2 shrink-0 pt-1 border-t border-gray-100 sm:border-0 sm:pt-0">
                      <button
                        type="button"
                        onClick={() => handlePreview(doc)}
                        title="Prévisualiser"
                        aria-label="Prévisualiser"
                        className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] sm:h-9 sm:w-9 sm:min-h-0 sm:min-w-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(doc)}
                        title="Télécharger"
                        aria-label="Télécharger"
                        className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] sm:h-9 sm:w-9 sm:min-h-0 sm:min-w-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                      >
                        <Download className="h-4 w-4" />
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
        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </div>
    </div>
  );
}
