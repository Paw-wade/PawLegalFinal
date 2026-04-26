'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { documentsAPI, dossiersAPI } from '@/lib/api';
import Link from 'next/link';
import { DocumentPreview } from '@/components/DocumentPreview';

function Button({ children, variant = 'default', className = '', disabled, ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent',
    ghost: 'hover:bg-accent',
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
  const [previewDocument, setPreviewDocument] = useState<any | null>(null);
  const [dossierInfoMap, setDossierInfoMap] = useState<Record<string, any>>({});
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (session && (session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin') {
      router.push('/client');
    } else if (status === 'authenticated') {
      loadDocuments();
      loadDossiers();
    }
  }, [session, status, router]);

  // Initialiser toutes les sections comme dépliées par défaut
  useEffect(() => {
    if (documents.length > 0 && expandedUsers.size === 0) {
      const allUserKeys = new Set(
        documents
          .map((doc: any) => {
            const userId = doc.user?._id || doc.user?.id || 'unknown';
            return userId.toString();
          })
          .filter(Boolean)
      );
      setExpandedUsers(allUserKeys);
    }
  }, [documents]);

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
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (typeMime: string) => {
    if (typeMime.includes('pdf')) return '📄';
    if (typeMime.includes('image')) return '🖼️';
    if (typeMime.includes('word') || typeMime.includes('document')) return '📝';
    if (typeMime.includes('excel') || typeMime.includes('spreadsheet')) return '📊';
    return '📎';
  };

  const filteredDocuments = documents.filter((doc) => {
    const search = searchTerm.toLowerCase();
    return (
      (doc.nom || '').toLowerCase().includes(search) ||
      (doc.description || '').toLowerCase().includes(search) ||
      (doc.user?.firstName || '').toLowerCase().includes(search) ||
      (doc.user?.lastName || '').toLowerCase().includes(search) ||
      (doc.user?.email || '').toLowerCase().includes(search)
    );
  });

  // Grouper les documents par utilisateur
  const groupedDocuments = filteredDocuments.reduce((acc: any, doc: any) => {
    const userId = doc.user?._id || doc.user?.id || 'unknown';
    const userKey = userId.toString();
    
    if (!acc[userKey]) {
      acc[userKey] = {
        user: doc.user || { firstName: 'Inconnu', lastName: '', email: 'N/A' },
        documents: []
      };
    }
    acc[userKey].documents.push(doc);
    return acc;
  }, {});

  // Convertir en tableau et trier par nom d'utilisateur
  const groupedDocumentsArray = Object.values(groupedDocuments).map((group: any) => {
    const userId = group.user?._id || group.user?.id || 'unknown';
    const userKey = userId.toString();
    return {
      ...group,
      userKey,
      totalSize: group.documents.reduce((sum: number, doc: any) => sum + (doc.taille || 0), 0)
    };
  }).sort((a: any, b: any) => {
    const nameA = `${a.user.firstName} ${a.user.lastName}`.toLowerCase();
    const nameB = `${b.user.firstName} ${b.user.lastName}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const toggleUserExpanded = (userKey: string) => {
    setExpandedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userKey)) {
        newSet.delete(userKey);
      } else {
        newSet.add(userKey);
      }
      return newSet;
    });
  };

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
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <main className="w-full px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Tous les Documents</h1>
            <p className="text-muted-foreground">Gérez tous les documents téléversés par les utilisateurs</p>
          </div>
          <Button onClick={() => setShowUploadForm(!showUploadForm)}>
            {showUploadForm ? 'Annuler' : '+ Téléverser un document'}
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">{success}</p>
          </div>
        )}

        {showUploadForm && (
          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
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

        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="mb-4 flex items-center justify-between">
            <input
              type="text"
              placeholder="Rechercher un document..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button onClick={loadDocuments} variant="outline">
              Actualiser
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Chargement des documents...</p>
            </div>
          ) : groupedDocumentsArray.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {searchTerm ? 'Aucun document ne correspond à votre recherche' : 'Aucun document trouvé'}
            </p>
          ) : (
            <div className="space-y-6">
              {groupedDocumentsArray.map((group: any, groupIndex: number) => {
                const isExpanded = expandedUsers.has(group.userKey);
                return (
                  <div key={groupIndex} className="bg-white rounded-lg shadow-md border border-border overflow-hidden">
                    {/* En-tête de l'utilisateur */}
                    <div 
                      className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border p-4 cursor-pointer hover:from-primary/15 hover:to-primary/10 transition-colors"
                      onClick={() => toggleUserExpanded(group.userKey)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                            {group.user.firstName?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg text-foreground">
                              {group.user.firstName} {group.user.lastName}
                            </h3>
                            <p className="text-sm text-muted-foreground truncate">{group.user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {!isExpanded && (
                            <div className="text-right">
                              <p className="text-sm font-medium text-foreground">
                                {group.documents.length} document{group.documents.length > 1 ? 's' : ''}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(group.totalSize)}
                              </p>
                            </div>
                          )}
                          {isExpanded && (
                            <div className="text-right">
                              <p className="text-sm font-medium text-foreground">
                                {group.documents.length} document{group.documents.length > 1 ? 's' : ''}
                              </p>
                            </div>
                          )}
                          <button
                            className="ml-2 p-1 rounded hover:bg-primary/20 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleUserExpanded(group.userKey);
                            }}
                            aria-label={isExpanded ? 'Plier' : 'Déplier'}
                          >
                            <span className="text-xl">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Liste des documents de l'utilisateur */}
                    {isExpanded && (
                      <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-4 font-semibold text-sm">Document</th>
                          <th className="text-left p-4 font-semibold text-sm">Catégorie</th>
                          <th className="text-left p-4 font-semibold text-sm">Taille</th>
                          <th className="text-left p-4 font-semibold text-sm">Date</th>
                          <th className="text-left p-4 font-semibold text-sm">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.documents.map((doc: any) => (
                          <tr key={doc._id || doc.id} className="border-b hover:bg-muted/20 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">{getFileIcon(doc.typeMime)}</span>
                                <div>
                                  <p className="font-medium text-sm">{doc.nom}</p>
                                  {doc.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-1">{doc.description}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="px-2 py-1 bg-primary/10 text-primary rounded-md text-xs font-medium">
                                {doc.categorie || 'autre'}
                              </span>
                            </td>
                            <td className="p-4 text-sm text-muted-foreground">{formatFileSize(doc.taille)}</td>
                            <td className="p-4 text-sm text-muted-foreground">
                              {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="p-4">
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setPreviewDocument(doc)}
                                  className="text-xs"
                                  title="Prévisualiser"
                                >
                                  👁️
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDownload(doc._id || doc.id, doc.nom)}
                                  className="text-xs"
                                  title="Télécharger"
                                >
                                  📥
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDelete(doc._id || doc.id)}
                                  className="text-xs"
                                  title="Supprimer"
                                >
                                  🗑️
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!isLoading && documents.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground">
              <p>
                Total: {filteredDocuments.length} document{filteredDocuments.length > 1 ? 's' : ''} 
                réparti{filteredDocuments.length > 1 ? 's' : ''} sur {groupedDocumentsArray.length} utilisateur{groupedDocumentsArray.length > 1 ? 's' : ''}
              </p>
              {searchTerm && filteredDocuments.length !== documents.length && (
                <p className="mt-1">
                  (sur {documents.length} document{documents.length > 1 ? 's' : ''} au total)
                </p>
              )}
            </div>
          )}
        </div>
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

