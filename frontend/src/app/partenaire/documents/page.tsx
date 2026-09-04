'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { documentsAPI, dossiersAPI } from '@/lib/api';
import { FileText, Download, Folder, User, Eye } from 'lucide-react';
import Link from 'next/link';
import { DocumentPreview } from '@/components/DocumentPreview';
import { Toast } from '@/components/Toast';

function Button({ children, variant = 'default', size = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClasses = {
    default: 'bg-primary text-white hover:bg-primary/90 shadow-sm hover:shadow',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  const sizeClasses = {
    default: 'px-4 py-2 text-sm',
    sm: 'px-3 py-1.5 text-xs',
    lg: 'px-6 py-3 text-base',
  };
  return (
    <button 
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} 
      {...props}
    >
      {children}
    </button>
  );
}

export default function PartenaireDocumentsPage() {
  const { data: session } = useSession();
  const [documents, setDocuments] = useState<any[]>([]);
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewDocument, setPreviewDocument] = useState<any | null>(null);
  const [expandedDossiers, setExpandedDossiers] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  
  // Fonction pour convertir en string de manière sécurisée
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'object') {
      if (value.toString && typeof value.toString === 'function') {
        try {
          return value.toString();
        } catch (e) {
          console.warn('Erreur lors de la conversion toString:', value);
        }
      }
      if (value._id) return safeString(value._id);
      if (value.id) return safeString(value.id);
    }
    return '';
  };
  
  useEffect(() => {
    loadData();
  }, [session]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Charger les documents des dossiers transmis (via /admin qui filtre pour les partenaires)
      const [documentsRes, dossiersRes] = await Promise.all([
        documentsAPI.getAllDocuments(),
        dossiersAPI.getMyDossiers()
      ]);
      
      if (documentsRes.data.success) {
        setDocuments(documentsRes.data.documents || []);
      }
      
      if (dossiersRes.data.success) {
        setDossiers(dossiersRes.data.dossiers || []);
        // Déplier tous les dossiers par défaut
        const dossierIds = (dossiersRes.data.dossiers || []).map((d: any) => safeString(d._id || d.id));
        setExpandedDossiers(new Set(dossierIds));
      }
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
    } finally {
      setLoading(false);
    }
  };

  // Grouper les documents par dossier et client
  const groupedDocuments = documents.reduce((acc: any, doc: any) => {
    const dossierId = doc.dossierId?._id?.toString() || doc.dossierId?.toString() || doc.dossierId || 'sans-dossier';
    const dossier = dossiers.find((d: any) => safeString(d._id || d.id) === dossierId) || doc.dossierId;
    
    const dossierNumero = dossier?.numero || dossier?.numeroDossier || 'Sans numéro';
    const dossierTitre = dossier?.titre || 'Sans titre';
    const client = dossier?.user || doc.user;
    const clientId = client?._id?.toString() || client?.id?.toString() || client?.toString() || 'sans-client';
    const clientName = client 
      ? `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.email || 'Client inconnu'
      : 'Client inconnu';
    
    const key = `${dossierId}-${clientId}`;
    
    if (!acc[key]) {
      acc[key] = {
        dossierId,
        dossierNumero,
        dossierTitre,
        clientId,
        clientName,
        clientEmail: client?.email || '',
        documents: []
      };
    }
    
    acc[key].documents.push(doc);
    return acc;
  }, {});

  // Trier les groupes par numéro de dossier puis par nom de client
  const sortedGroups = Object.values(groupedDocuments).sort((a: any, b: any) => {
    // D'abord par numéro de dossier
    const numA = a.dossierNumero || '';
    const numB = b.dossierNumero || '';
    if (numA !== numB) {
      return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
    }
    // Puis par nom de client
    return a.clientName.localeCompare(b.clientName);
  });

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

  const handleDownload = async (documentId: string, originalName: string) => {
    try {
      await documentsAPI.downloadAndSave(documentId, originalName);
    } catch (error: any) {
      console.error('Erreur lors du téléchargement:', error);
      setToast({ message: error.response?.data?.message || 'Erreur lors du téléchargement du document', type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement des documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/5">
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 pb-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-1 sm:mb-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Documents
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Documents des dossiers transmis, classés par dossier et client
          </p>
        </div>

        {documents.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-8 sm:p-12 lg:p-16 text-center border border-gray-200">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-lg mb-2">Aucun document disponible</p>
            <p className="text-gray-400 text-sm">
              Les documents des dossiers qui vous sont transmis apparaîtront ici
            </p>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {sortedGroups.map((group: any) => {
              const isExpanded = expandedDossiers.has(group.dossierId);
              const dossierId = group.dossierId;
              
              return (
                <div
                  key={`${group.dossierId}-${group.clientId}`}
                  className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden"
                >
                  {/* En-tête du groupe - aligné admin */}
                  <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-200">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const newExpanded = new Set(expandedDossiers);
                          if (newExpanded.has(dossierId)) {
                            newExpanded.delete(dossierId);
                          } else {
                            newExpanded.add(dossierId);
                          }
                          setExpandedDossiers(newExpanded);
                        }}
                        className="flex items-center gap-2 sm:gap-3 hover:opacity-90 active:opacity-100 transition-opacity flex-1 min-w-0 text-left rounded-lg sm:rounded-none -mx-1 px-1 sm:mx-0 sm:px-0 py-1 sm:py-0"
                      >
                        <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center shrink-0">
                          <Folder className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h2 className="text-base sm:text-lg font-bold text-foreground break-words">
                              {group.dossierTitre}
                            </h2>
                            {group.dossierNumero && group.dossierNumero !== 'Sans numéro' && (
                              <span className="px-2 py-0.5 bg-primary/20 text-primary rounded text-xs font-semibold shrink-0">
                                N° {group.dossierNumero}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <User className="w-4 h-4 shrink-0" />
                              <span className="font-medium truncate max-w-[12rem] sm:max-w-none">{group.clientName}</span>
                            </div>
                            <div
                              className="flex items-center gap-1.5"
                              title={`${group.documents.length} document${group.documents.length > 1 ? 's' : ''}`}
                            >
                              <FileText className="w-4 h-4 shrink-0" />
                              <span className="tabular-nums font-medium">{group.documents.length}</span>
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 self-center sm:self-auto">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={`h-5 w-5 text-gray-500 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {group.dossierId !== 'sans-dossier' && (
                        <div className="shrink-0 w-full sm:w-auto">
                          <Link href={`/partenaire/dossiers/${group.dossierId}`} className="block w-full sm:w-auto">
                            <Button variant="outline" size="sm" className="w-full sm:w-auto min-h-[44px] sm:min-h-9 text-sm justify-center">
                              Voir le dossier →
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Liste des documents (affichée si déplié) */}
                  {isExpanded && (
                    <div className="divide-y divide-gray-100">
                      {group.documents.map((doc: any) => {
                        const docId = safeString(doc._id || doc.id);
                        const docNom = safeString(doc.nom || doc.filename || 'Document');
                        const originalName = doc.originalName || doc.nom || doc.filename || 'document';

                        return (
                          <div
                            key={docId}
                            className="p-4 sm:p-5 md:p-6 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                              <div className="min-w-0 flex-1">
                                <h3 className="font-semibold text-foreground mb-1 text-sm sm:text-base break-words sm:truncate">
                                  {docNom}
                                </h3>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                                  <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-md text-xs font-medium">
                                    {getCategoryLabel(safeString(doc.categorie) || 'autre')}
                                  </span>
                                </div>
                                {doc.description && (
                                  <p className="text-sm text-muted-foreground mt-2 line-clamp-3 sm:line-clamp-2">
                                    {doc.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center justify-end gap-2 shrink-0 pt-1 border-t border-gray-100 sm:border-0 sm:pt-0 -mx-1 px-1 sm:mx-0 sm:px-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setPreviewDocument(doc)}
                                  title="Prévisualiser"
                                  aria-label="Prévisualiser"
                                  className="!h-11 !w-11 !min-h-[44px] !min-w-[44px] sm:!h-9 sm:!w-9 sm:!min-h-0 sm:!min-w-0 !p-0"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleDownload(docId, originalName)}
                                  title="Télécharger"
                                  aria-label="Télécharger"
                                  className="!h-11 !w-11 !min-h-[44px] !min-w-[44px] sm:!h-9 sm:!w-9 sm:!min-h-0 sm:!min-w-0 !p-0"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de prévisualisation */}
        {previewDocument && (
          <DocumentPreview
            document={previewDocument}
            isOpen={!!previewDocument}
            onClose={() => setPreviewDocument(null)}
          />
        )}
        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </main>
    </div>
  );
}
