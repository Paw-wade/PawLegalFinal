'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { documentsAPI, dossiersAPI } from '@/lib/api';
import { DocumentPreview } from '@/components/DocumentPreview';
import { FileText, Download, Folder, Upload, Search, Filter, Eye, Trash2 } from 'lucide-react';
import Link from 'next/link';

function Button({ children, variant = 'default', className = '', disabled, ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-red-500 text-white hover:bg-red-600',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} disabled={disabled} {...props}>{children}</button>;
}

const Input = React.forwardRef<HTMLInputElement, any>(({ className = '', ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
});
Input.displayName = 'Input';

function Label({ htmlFor, children, className = '' }: any) {
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>
      {children}
    </label>
  );
}

export default function DocumentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadData, setUploadData] = useState({
    nom: '',
    description: '',
    categorie: 'autre',
    dossierId: ''
  });
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [isLoadingDossiers, setIsLoadingDossiers] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [expandedDossiers, setExpandedDossiers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      if (session && (session.user as any)?.accessToken && typeof window !== 'undefined') {
        const token = (session.user as any).accessToken;
        if (!localStorage.getItem('token')) {
          localStorage.setItem('token', token);
        }
      }
      loadDocuments();
      loadDossiers();
    }
  }, [session, status, router]);

  // Déplier tous les dossiers par défaut
  useEffect(() => {
    if (dossiers.length > 0 && expandedDossiers.size === 0) {
      const dossierIds = dossiers.map((d: any) => (d._id || d.id)?.toString()).filter(Boolean);
      setExpandedDossiers(new Set(dossierIds));
    }
  }, [dossiers]);

  const loadDossiers = async () => {
    setIsLoadingDossiers(true);
    try {
      const response = await dossiersAPI.getMyDossiers();
      if (response.data.success) {
        setDossiers(response.data.dossiers || []);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des dossiers:', err);
    } finally {
      setIsLoadingDossiers(false);
    }
  };

  const loadDocuments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await documentsAPI.getMyDocuments();
      if (response.data.success) {
        setDocuments(response.data.documents || []);
      } else {
        setError('Erreur lors du chargement des documents');
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des documents:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement des documents');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && !uploadData.nom) {
      setUploadData({ ...uploadData, nom: file.name });
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!fileInputRef.current?.files?.[0]) {
      setError('Veuillez sélectionner un fichier');
      return;
    }

    if (!uploadData.nom || uploadData.nom.trim() === '') {
      setError('Veuillez saisir un nom pour le document');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('document', fileInputRef.current.files[0]);
      formData.append('nom', uploadData.nom.trim());
      formData.append('description', uploadData.description.trim());
      formData.append('categorie', uploadData.categorie);
      if (uploadData.dossierId && uploadData.dossierId.trim() !== '') {
        formData.append('dossierId', uploadData.dossierId);
      }

      const response = await documentsAPI.uploadDocument(formData);
      console.log('📄 Réponse téléversement:', response.data);
      
      if (response.data.success) {
        setSuccess('Document téléversé avec succès !');
        setUploadData({ nom: '', description: '', categorie: 'autre', dossierId: '' });
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setShowUploadForm(false);
        setTimeout(() => {
          loadDocuments();
        }, 500);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(response.data.message || 'Erreur lors du téléversement du document');
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du téléversement:', err);
      setError(err.response?.data?.message || 'Erreur lors du téléversement du document');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (documentId: string, nom: string) => {
    try {
      const response = await documentsAPI.downloadDocument(documentId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', nom);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Erreur lors du téléchargement:', err);
      setError('Erreur lors du téléchargement du document');
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce document ?')) {
      return;
    }

    try {
      const response = await documentsAPI.deleteDocument(documentId);
      if (response.data.success) {
        setSuccess('Document supprimé avec succès');
        loadDocuments();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('documentsUpdated'));
        }
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Erreur lors de la suppression:', err);
      setError(err.response?.data?.message || 'Erreur lors de la suppression du document');
    }
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

  // Grouper les documents par dossier
  const groupedDocuments = documents.reduce((acc: any, doc: any) => {
    const dossierId = doc.dossierId?._id?.toString() || doc.dossierId?.toString() || doc.dossierId || 'sans-dossier';
    const dossier = dossiers.find((d: any) => (d._id || d.id)?.toString() === dossierId) || doc.dossierId;
    
    const dossierNumero = dossier?.numero || dossier?.numeroDossier || 'Sans numéro';
    const dossierTitre = dossier?.titre || 'Sans titre';
    
    const key = dossierId;
    
    if (!acc[key]) {
      acc[key] = {
        dossierId,
        dossierNumero,
        dossierTitre,
        documents: []
      };
    }
    
    acc[key].documents.push(doc);
    return acc;
  }, {});

  // Trier les groupes par numéro de dossier
  const sortedGroups = Object.values(groupedDocuments).sort((a: any, b: any) => {
    const numA = a.dossierNumero || '';
    const numB = b.dossierNumero || '';
    return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Filtrer les documents
  const filteredGroups = sortedGroups.filter((group: any) => {
    const filteredDocs = group.documents.filter((doc: any) => {
      const matchesSearch = !searchTerm || 
        doc.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !categoryFilter || doc.categorie === categoryFilter;
      return matchesSearch && matchesCategory;
    });
    
    // Retourner le groupe seulement s'il a des documents après filtrage
    if (filteredDocs.length > 0) {
      group.documents = filteredDocs;
      return true;
    }
    return false;
  });

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/5">
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 pb-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-1 sm:mb-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Mes documents
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">Gérez et consultez tous vos documents</p>
          </div>
          <Button onClick={() => setShowUploadForm(!showUploadForm)} className="flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px] sm:min-h-10 shrink-0">
            <Upload className="w-4 h-4 shrink-0" />
            {showUploadForm ? 'Annuler' : 'Téléverser un document'}
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg shadow-sm">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg shadow-sm">
            <p className="text-sm text-green-600">{success}</p>
          </div>
        )}

        {/* Formulaire de téléversement */}
        {showUploadForm && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 mb-8">
            <h2 className="text-2xl font-bold mb-6">Téléverser un document</h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <Label htmlFor="file">Fichier *</Label>
                <Input
                  ref={fileInputRef}
                  id="file"
                  type="file"
                  onChange={handleFileSelect}
                  required
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="nom">Nom du document *</Label>
                <Input
                  id="nom"
                  value={uploadData.nom}
                  onChange={(e) => setUploadData({ ...uploadData, nom: e.target.value })}
                  required
                  className="mt-1"
                  placeholder="Ex: Passeport, Contrat..."
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  value={uploadData.description}
                  onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                  placeholder="Description du document..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="categorie">Catégorie</Label>
                  <select
                    id="categorie"
                    value={uploadData.categorie}
                    onChange={(e) => setUploadData({ ...uploadData, categorie: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                  >
                    <option value="identite">Identité</option>
                    <option value="titre_sejour">Titre de séjour</option>
                    <option value="contrat">Contrat</option>
                    <option value="facture">Facture</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="dossierId">Dossier associé (optionnel)</Label>
                  <select
                    id="dossierId"
                    value={uploadData.dossierId}
                    onChange={(e) => setUploadData({ ...uploadData, dossierId: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                    disabled={isLoadingDossiers}
                  >
                    <option value="">Aucun dossier</option>
                    {dossiers.map((dossier) => (
                      <option key={dossier._id || dossier.id} value={dossier._id || dossier.id}>
                        {dossier.titre || 'Dossier sans titre'} {dossier.numero ? `(${dossier.numero})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => {
                  setShowUploadForm(false);
                  setUploadData({ nom: '', description: '', categorie: 'autre', dossierId: '' });
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }} disabled={uploading} className="min-h-[44px] sm:min-h-10 w-full sm:w-auto">
                  Annuler
                </Button>
                <Button type="submit" disabled={uploading} className="min-h-[44px] sm:min-h-10 w-full sm:w-auto">
                  {uploading ? 'Téléversement...' : 'Téléverser'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Filtres */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="search" className="flex items-center gap-2 mb-2">
                <Search className="w-4 h-4" />
                Rechercher
              </Label>
              <Input
                id="search"
                placeholder="Nom, description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="category-filter" className="flex items-center gap-2 mb-2">
                <Filter className="w-4 h-4" />
                Catégorie
              </Label>
              <select
                id="category-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Toutes les catégories</option>
                <option value="identite">Identité</option>
                <option value="titre_sejour">Titre de séjour</option>
                <option value="contrat">Contrat</option>
                <option value="facture">Facture</option>
                <option value="autre">Autre</option>
              </select>
            </div>
          </div>
        </div>

        {/* Liste des documents groupés par dossier */}
        {isLoading ? (
          <div className="text-center py-12 sm:py-16 px-2">
            <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-2 border-primary border-t-transparent mx-auto mb-3 sm:mb-4"></div>
            <p className="text-sm sm:text-base text-muted-foreground">Chargement des documents...</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-8 sm:p-12 lg:p-16 text-center border border-gray-200">
            <FileText className="w-14 h-14 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-muted-foreground text-base sm:text-lg mb-2 px-1">
              {searchTerm || categoryFilter 
                ? 'Aucun document ne correspond aux filtres sélectionnés' 
                : 'Aucun document trouvé'}
            </p>
            {!searchTerm && !categoryFilter && (
              <Button onClick={() => setShowUploadForm(true)} className="mt-4 w-full sm:w-auto min-h-[44px] sm:min-h-10 max-w-md mx-auto sm:mx-0">
                Téléverser votre premier document
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {filteredGroups.map((group: any) => {
              const isExpanded = expandedDossiers.has(group.dossierId);
              const dossierId = group.dossierId;
              
              return (
                <div
                  key={group.dossierId}
                  className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden"
                >
                  {/* En-tête du groupe (Dossier) — aligné admin */}
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
                          <div
                            className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground"
                            title={`${group.documents.length} document${group.documents.length > 1 ? 's' : ''}`}
                          >
                            <FileText className="w-4 h-4 shrink-0" />
                            <span className="tabular-nums font-medium">{group.documents.length}</span>
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
                          <Link href={`/client/dossiers/${group.dossierId}`} className="block w-full sm:w-auto">
                            <Button variant="outline" className="w-full sm:w-auto min-h-[44px] sm:min-h-9 text-sm justify-center">
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
                        const docId = (doc._id || doc.id)?.toString();
                        const docNom = doc.nom || doc.filename || 'Document';
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
                                    {getCategoryLabel(doc.categorie || 'autre')}
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
                                  onClick={() => setPreviewDocument(doc)}
                                  title="Prévisualiser"
                                  aria-label="Prévisualiser"
                                  className="h-11 w-11 min-h-[44px] min-w-[44px] sm:h-9 sm:w-9 sm:min-h-0 sm:min-w-0 shrink-0 p-0"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="default"
                                  onClick={() => handleDownload(docId, originalName)}
                                  title="Télécharger"
                                  aria-label="Télécharger"
                                  className="h-11 w-11 min-h-[44px] min-w-[44px] sm:h-9 sm:w-9 sm:min-h-0 sm:min-w-0 shrink-0 p-0"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => handleDelete(docId)}
                                  title="Supprimer"
                                  aria-label="Supprimer"
                                  className="h-11 w-11 min-h-[44px] min-w-[44px] sm:h-9 sm:w-9 sm:min-h-0 sm:min-w-0 shrink-0 p-0"
                                >
                                  <Trash2 className="h-4 w-4" />
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

        {/* Compteur de documents */}
        {!isLoading && filteredGroups.length > 0 && (
          <div className="mt-6 text-sm text-muted-foreground text-center">
            <p>
              {documents.filter((doc: any) => {
                const matchesSearch = !searchTerm || 
                  doc.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  doc.description?.toLowerCase().includes(searchTerm.toLowerCase());
                const matchesCategory = !categoryFilter || doc.categorie === categoryFilter;
                return matchesSearch && matchesCategory;
              }).length} document{(documents.filter((doc: any) => {
                const matchesSearch = !searchTerm || 
                  doc.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  doc.description?.toLowerCase().includes(searchTerm.toLowerCase());
                const matchesCategory = !categoryFilter || doc.categorie === categoryFilter;
                return matchesSearch && matchesCategory;
              }).length) > 1 ? 's' : ''} trouvé{(documents.filter((doc: any) => {
                const matchesSearch = !searchTerm || 
                  doc.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  doc.description?.toLowerCase().includes(searchTerm.toLowerCase());
                const matchesCategory = !categoryFilter || doc.categorie === categoryFilter;
                return matchesSearch && matchesCategory;
              }).length) > 1 ? 's' : ''}
            </p>
          </div>
        )}
      </main>

      {/* Modal de prévisualisation */}
      {previewDocument && (
        <DocumentPreview
          document={previewDocument}
          isOpen={!!previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      )}
    </div>
  );
}
