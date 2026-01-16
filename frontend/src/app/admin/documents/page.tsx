'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { documentsAPI, dossiersAPI } from '@/lib/api';
import Link from 'next/link';
import { DocumentPreview } from '@/components/DocumentPreview';
import { FileText, Download, Folder, Calendar, Upload, Search, Filter, User } from 'lucide-react';

function Button({ children, variant = 'default', className = '', disabled, ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClasses = {
    default: 'bg-primary text-white hover:bg-primary/90 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-red-500 text-white hover:bg-red-600',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} disabled={disabled} {...props}>{children}</button>;
}

function Input({ className = '', ...props }: any) {
  return (
    <input
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function Label({ htmlFor, children, className = '' }: any) {
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>
      {children}
    </label>
  );
}

export default function AdminDocumentsPage() {
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
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [previewDocument, setPreviewDocument] = useState<any | null>(null);
  const [expandedDossiers, setExpandedDossiers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (session) {
      const userRole = (session.user as any)?.role;
      const isAuthorized = userRole === 'admin' || userRole === 'superadmin';
      if (!isAuthorized) {
        router.push('/client');
      } else if (status === 'authenticated') {
        loadDocuments();
        loadDossiers();
      }
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
      const response = await dossiersAPI.getAllDossiers();
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
      const response = await documentsAPI.getAllDocuments();
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
    if (file) {
      if (!uploadData.nom) {
        setUploadData({ ...uploadData, nom: file.name });
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!fileInputRef.current?.files?.[0]) {
      setError('Veuillez sélectionner un fichier');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('document', fileInputRef.current.files[0]);
      formData.append('nom', uploadData.nom);
      formData.append('description', uploadData.description);
      formData.append('categorie', uploadData.categorie);
      if (uploadData.dossierId && uploadData.dossierId.trim() !== '') {
        formData.append('dossierId', uploadData.dossierId);
      }

      const response = await documentsAPI.uploadDocument(formData);
      if (response.data.success) {
        setSuccess('Document téléversé avec succès !');
        setUploadData({ nom: '', description: '', categorie: 'autre', dossierId: '' });
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setShowUploadForm(false);
        loadDocuments();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Erreur lors du téléversement:', err);
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
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Erreur lors de la suppression:', err);
      setError(err.response?.data?.message || 'Erreur lors de la suppression du document');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date: string | Date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileIcon = (typeMime: string) => {
    if (!typeMime) return '📎';
    if (typeMime.includes('pdf')) return '📄';
    if (typeMime.includes('image')) return '🖼️';
    if (typeMime.includes('word') || typeMime.includes('document')) return '📝';
    if (typeMime.includes('excel') || typeMime.includes('spreadsheet')) return '📊';
    return '📎';
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
    const client = dossier?.user || doc.user;
    const clientName = client 
      ? `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.email || 'Client inconnu'
      : 'Client inconnu';
    const clientEmail = client?.email || '';
    
    const key = dossierId;
    
    if (!acc[key]) {
      acc[key] = {
        dossierId,
        dossierNumero,
        dossierTitre,
        clientName,
        clientEmail,
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
        doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.clientEmail?.toLowerCase().includes(searchTerm.toLowerCase());
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

  if (!session || ((session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/5">
      <main className="w-full px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Tous les Documents
            </h1>
            <p className="text-muted-foreground">Gérez tous les documents téléversés par les utilisateurs</p>
          </div>
          <Button onClick={() => setShowUploadForm(!showUploadForm)} className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
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
                <p className="text-xs text-muted-foreground mt-1">
                  Types acceptés: PDF, images (JPG, PNG), Word, Excel. Taille max: 10 MB
                </p>
              </div>
              <div>
                <Label htmlFor="nom">Nom du document *</Label>
                <Input
                  id="nom"
                  value={uploadData.nom}
                  onChange={(e) => setUploadData({ ...uploadData, nom: e.target.value })}
                  required
                  className="mt-1"
                  placeholder="Ex: Document administratif..."
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
                    {dossiers.map((dossier) => {
                      const clientName = dossier.user 
                        ? `${dossier.user.firstName || ''} ${dossier.user.lastName || ''}`.trim() || dossier.user.email
                        : dossier.clientNom && dossier.clientPrenom
                        ? `${dossier.clientPrenom} ${dossier.clientNom}`.trim()
                        : dossier.clientEmail || 'Client inconnu';
                      return (
                        <option key={dossier._id || dossier.id} value={dossier._id || dossier.id}>
                          {dossier.titre || 'Dossier sans titre'} - {clientName} {dossier.categorie ? `(${dossier.categorie})` : ''}
                        </option>
                      );
                    })}
                  </select>
                  {isLoadingDossiers && (
                    <p className="text-xs text-muted-foreground mt-1">Chargement des dossiers...</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => {
                  setShowUploadForm(false);
                  setUploadData({ nom: '', description: '', categorie: 'autre', dossierId: '' });
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }} disabled={uploading}>
                  Annuler
                </Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? 'Téléversement...' : 'Téléverser'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Filtres */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="search" className="flex items-center gap-2 mb-2">
                <Search className="w-4 h-4" />
                Rechercher
              </Label>
              <Input
                id="search"
                placeholder="Nom, description, client..."
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
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement des documents...</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-16 text-center border border-gray-200">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-muted-foreground text-lg mb-2">
              {searchTerm || categoryFilter 
                ? 'Aucun document ne correspond aux filtres sélectionnés' 
                : 'Aucun document trouvé'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredGroups.map((group: any) => {
              const isExpanded = expandedDossiers.has(group.dossierId);
              const dossierId = group.dossierId;
              
              return (
                <div
                  key={group.dossierId}
                  className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden"
                >
                  {/* En-tête du groupe (Dossier + Client) */}
                  <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => {
                          const newExpanded = new Set(expandedDossiers);
                          if (newExpanded.has(dossierId)) {
                            newExpanded.delete(dossierId);
                          } else {
                            newExpanded.add(dossierId);
                          }
                          setExpandedDossiers(newExpanded);
                        }}
                        className="flex items-center gap-3 hover:opacity-80 transition-opacity flex-1 text-left"
                      >
                        <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                          <Folder className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-lg font-bold text-foreground">
                              {group.dossierTitre}
                            </h2>
                            {group.dossierNumero && group.dossierNumero !== 'Sans numéro' && (
                              <span className="px-2 py-0.5 bg-primary/20 text-primary rounded text-xs font-semibold">
                                N° {group.dossierNumero}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <User className="w-4 h-4" />
                              <span className="font-medium">{group.clientName}</span>
                              {group.clientEmail && (
                                <span className="text-xs">({group.clientEmail})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <FileText className="w-4 h-4" />
                              <span>{group.documents.length} document{group.documents.length > 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        </div>
                        <div className="ml-auto">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={`h-5 w-5 text-gray-500 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {group.dossierId !== 'sans-dossier' && (
                        <div className="ml-4">
                          <Link href={`/admin/dossiers/${group.dossierId}`}>
                            <Button variant="outline" size="sm">
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
                        const docType = doc.type || doc.categorie || 'Type inconnu';
                        const docTaille = doc.taille ? formatFileSize(doc.taille) : '';
                        const docDate = doc.createdAt ? formatDate(doc.createdAt) : '';
                        const originalName = doc.originalName || doc.nom || doc.filename || 'document';
                        const uploadedBy = doc.user 
                          ? `${doc.user.firstName || ''} ${doc.user.lastName || ''}`.trim() || doc.user.email || 'Utilisateur inconnu'
                          : 'Utilisateur inconnu';

                        return (
                          <div
                            key={docId}
                            className="p-6 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                                  <span className="text-2xl">{getFileIcon(doc.typeMime)}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-foreground mb-1 truncate">
                                    {docNom}
                                  </h3>
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                                    <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-md text-xs font-medium">
                                      {getCategoryLabel(doc.categorie || 'autre')}
                                    </span>
                                    {docTaille && (
                                      <span className="flex items-center gap-1">
                                        <span>💾</span>
                                        <span>{docTaille}</span>
                                      </span>
                                    )}
                                    {docDate && (
                                      <span className="flex items-center gap-1 font-medium text-foreground">
                                        <Calendar className="w-4 h-4" />
                                        <span>Téléversé le {docDate}</span>
                                      </span>
                                    )}
                                    {uploadedBy && (
                                      <span className="flex items-center gap-1">
                                        <User className="w-4 h-4" />
                                        <span>Par {uploadedBy}</span>
                                      </span>
                                    )}
                                  </div>
                                  {doc.description && (
                                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                      {doc.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setPreviewDocument(doc)}
                                  title="Prévisualiser"
                                >
                                  👁️ Prévisualiser
                                </Button>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleDownload(docId, originalName)}
                                  className="flex items-center gap-2"
                                  title="Télécharger"
                                >
                                  <Download className="w-4 h-4" />
                                  Télécharger
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDelete(docId)}
                                  title="Supprimer"
                                >
                                  🗑️
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
                const dossierId = doc.dossierId?._id?.toString() || doc.dossierId?.toString() || doc.dossierId || 'sans-dossier';
                const dossier = dossiers.find((d: any) => (d._id || d.id)?.toString() === dossierId) || doc.dossierId;
                const client = dossier?.user || doc.user;
                const clientName = client 
                  ? `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.email || ''
                  : '';
                const clientEmail = client?.email || '';
                
                const matchesSearch = !searchTerm || 
                  doc.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  clientEmail?.toLowerCase().includes(searchTerm.toLowerCase());
                const matchesCategory = !categoryFilter || doc.categorie === categoryFilter;
                return matchesSearch && matchesCategory;
              }).length} document{(documents.filter((doc: any) => {
                const dossierId = doc.dossierId?._id?.toString() || doc.dossierId?.toString() || doc.dossierId || 'sans-dossier';
                const dossier = dossiers.find((d: any) => (d._id || d.id)?.toString() === dossierId) || doc.dossierId;
                const client = dossier?.user || doc.user;
                const clientName = client 
                  ? `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.email || ''
                  : '';
                const clientEmail = client?.email || '';
                
                const matchesSearch = !searchTerm || 
                  doc.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  clientEmail?.toLowerCase().includes(searchTerm.toLowerCase());
                const matchesCategory = !categoryFilter || doc.categorie === categoryFilter;
                return matchesSearch && matchesCategory;
              }).length) > 1 ? 's' : ''} trouvé{(documents.filter((doc: any) => {
                const dossierId = doc.dossierId?._id?.toString() || doc.dossierId?.toString() || doc.dossierId || 'sans-dossier';
                const dossier = dossiers.find((d: any) => (d._id || d.id)?.toString() === dossierId) || doc.dossierId;
                const client = dossier?.user || doc.user;
                const clientName = client 
                  ? `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.email || ''
                  : '';
                const clientEmail = client?.email || '';
                
                const matchesSearch = !searchTerm || 
                  doc.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  clientEmail?.toLowerCase().includes(searchTerm.toLowerCase());
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
