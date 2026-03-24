'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { recoursAPI } from '@/lib/recoursAPI';
import { dossiersAPI, documentsAPI } from '@/lib/api';
import { Toast } from '@/components/Toast';

type RecoursType = {
  _id: string;
  code: string;
  label: string;
  description?: string;
  restrictedToSuperadmin?: boolean;
};

type RecoursTemplate = {
  _id: string;
  type?: { _id: string; code: string; label: string; restrictedToSuperadmin?: boolean };
  title: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  size?: number;
  createdAt?: string;
};

const buildSecureFileUrl = (rawUrl: string): string => {
  if (typeof window === 'undefined') return rawUrl;

  let url = rawUrl;
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) return url;

  try {
    const u = new URL(url, window.location.origin);
    // ne pas dupliquer le paramètre
    if (!u.searchParams.has('token')) {
      u.searchParams.set('token', token);
      url = u.toString();
    }
  } catch {
    // fallback simple si l'URL est relative ou invalide pour URL()
    const separator = url.includes('?') ? '&' : '?';
    if (!url.includes('token=')) {
      url = `${url}${separator}token=${encodeURIComponent(token)}`;
    }
  }

  return url;
};

export default function RecoursDirectoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [types, setTypes] = useState<RecoursType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<RecoursTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [dossierIdForSend, setDossierIdForSend] = useState<string>('');
  const [dossiersForSend, setDossiersForSend] = useState<any[]>([]);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    const role = (session?.user as any)?.role;
    if (role !== 'admin' && role !== 'superadmin') {
      router.push('/client');
      return;
    }
    loadTypes();
    loadDossiersForSend();
  }, [session, status, router]);

  const loadDossiersForSend = async () => {
    try {
      const res = await dossiersAPI.getAllDossiers();
      if (res.data?.success) {
        setDossiersForSend(res.data.dossiers || []);
      }
    } catch (e) {
      console.error('Erreur loadDossiersForSend:', e);
      setDossiersForSend([]);
    }
  };

  const loadTypes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await recoursAPI.getTypes();
      if (res.data?.success) {
        const list: RecoursType[] = res.data.types || [];
        setTypes(list);
        if (list.length > 0) {
          setSelectedTypeId(list[0]._id);
          await loadTemplates(list[0]._id);
        }
      } else {
        setError(res.data?.message || 'Erreur lors du chargement des types de recours');
      }
    } catch (e: any) {
      console.error('Erreur loadTypes:', e);
      setError(e.response?.data?.message || 'Erreur lors du chargement des types de recours');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTemplates = async (typeId?: string | null) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await recoursAPI.getTemplates(typeId ? { typeId } : undefined);
      if (res.data?.success) {
        setTemplates(res.data.templates || []);
      } else {
        setError(res.data?.message || 'Erreur lors du chargement des modèles');
      }
    } catch (e: any) {
      console.error('Erreur loadTemplates:', e);
      setError(e.response?.data?.message || 'Erreur lors du chargement des modèles');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectType = async (typeId: string) => {
    setSelectedTypeId(typeId);
    await loadTemplates(typeId);
  };

  const handleSendToDossier = async (templateId: string) => {
    const rawInput = dossierIdForSend.trim();
    if (!rawInput) {
      alert('Veuillez saisir un numéro ou un ID de dossier.');
      return;
    }
    setIsSending(templateId);
    try {
      // Permettre la recherche par numéro de dossier ou id
      let dossierId = rawInput;
      const selectedByDisplay = dossiersForSend.find((d: any) => {
        const id = String(d._id || d.id || '');
        const numero = String(d.numero || d.numeroDossier || '').trim();
        const titre = String(d.titre || 'Sans titre').trim();
        const display = numero ? `${numero} - ${titre}` : `${id} - ${titre}`;
        return display === rawInput;
      });
      if (selectedByDisplay) {
        dossierId = String(selectedByDisplay._id || selectedByDisplay.id || dossierId);
      }
      if (!dossierId.match(/^[0-9a-fA-F]{24}$/)) {
        // tenter de récupérer par numéro de dossier (vue admin: tous les dossiers)
        try {
          const res = await dossiersAPI.getAllDossiers({ search: dossierId });
          const dossiers = res.data?.dossiers || [];
          const match = dossiers.find(
            (d: any) =>
              String(d.numero || '').trim().toLowerCase() === dossierId.toLowerCase() ||
              String(d.numeroDossier || '').trim().toLowerCase() === dossierId.toLowerCase() ||
              `${String(d.numero || d.numeroDossier || '').trim()} - ${String(d.titre || 'Sans titre').trim()}`.toLowerCase() === dossierId.toLowerCase() ||
              String(d._id || d.id || '') === dossierId
          );
          if (match) {
            dossierId = match._id || match.id;
          } else {
            alert("Dossier introuvable. Vérifiez l'ID ou le numéro saisi.");
            return;
          }
        } catch {
          // en cas d'échec du endpoint admin, tentative fallback
          try {
            const fallback = await dossiersAPI.getMyDossiers();
            const dossiers = fallback.data?.dossiers || [];
            const match = dossiers.find(
              (d: any) =>
                String(d.numero || '').trim().toLowerCase() === dossierId.toLowerCase() ||
                String(d.numeroDossier || '').trim().toLowerCase() === dossierId.toLowerCase() ||
                `${String(d.numero || d.numeroDossier || '').trim()} - ${String(d.titre || 'Sans titre').trim()}`.toLowerCase() === dossierId.toLowerCase() ||
                String(d._id || d.id || '') === dossierId
            );
            if (match) {
              dossierId = match._id || match.id;
            } else {
              alert("Dossier introuvable. Vérifiez l'ID ou le numéro saisi.");
              return;
            }
          } catch {
            alert("Impossible de rechercher le dossier pour l'instant. Réessayez.");
            return;
          }
        }
      }

      const res = await recoursAPI.sendTemplateToDossier(templateId, { dossierId });
      if (res.data?.success) {
        setToast({ message: '✅ Modèle envoyé avec succès vers le dossier.', type: 'success' });
        setDossierIdForSend('');
      } else {
        setToast({ message: res.data?.message || "Erreur lors de l'envoi vers le dossier", type: 'error' });
      }
    } catch (e: any) {
      console.error('Erreur handleSendToDossier:', e);
      setToast({ message: e.response?.data?.message || "Erreur lors de l'envoi vers le dossier", type: 'error' });
    } finally {
      setIsSending(null);
    }
  };

  const handleDeleteTemplate = async (templateId: string, title: string) => {
    const ok = window.confirm(`Supprimer définitivement le modèle "${title}" ?`);
    if (!ok) return;

    setDeletingTemplateId(templateId);
    try {
      const res = await recoursAPI.deleteTemplate(templateId);
      if (res.data?.success) {
        await loadTemplates(selectedTypeId);
        setToast({ message: '✅ Modèle supprimé avec succès.', type: 'success' });
      } else {
        setToast({ message: res.data?.message || 'Erreur lors de la suppression du modèle', type: 'error' });
      }
    } catch (e: any) {
      console.error('Erreur suppression modèle recours:', e);
      setToast({ message: e.response?.data?.message || 'Erreur lors de la suppression du modèle', type: 'error' });
    } finally {
      setDeletingTemplateId(null);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement du répertoire des recours...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full px-4 py-8">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Répertoire des recours</h1>
              <p className="text-sm text-muted-foreground">
                Gérez les modèles de recours et envoyez-les comme documents en préparation sur vos dossiers.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Colonne gauche : types */}
            <div className="md:col-span-1">
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Types de recours
                </p>
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {types.map((type) => (
                    <button
                      key={type._id}
                      type="button"
                      onClick={() => handleSelectType(type._id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedTypeId === type._id
                          ? 'bg-primary text-white'
                          : 'bg-white text-gray-800 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{type.label}</span>
                        {type.restrictedToSuperadmin && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold">
                            Superadmin
                          </span>
                        )}
                      </div>
                      {type.description && (
                        <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-2">
                          {type.description}
                        </p>
                      )}
                    </button>
                  ))}
                  {types.length === 0 && !isLoading && (
                    <p className="text-xs text-muted-foreground">
                      Aucun type de recours défini pour le moment.
                    </p>
                  )}
                </div>
                {/* Bouton pour afficher le formulaire de création (admin/superadmin) */}
                <button
                  type="button"
                  onClick={() => setShowUploadForm(true)}
                  className="mt-3 w-full px-3 py-2 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-colors"
                >
                  + Ajouter un modèle
                </button>
              </div>
            </div>

            {/* Colonne droite : modèles */}
            <div className="md:col-span-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <p className="text-sm text-muted-foreground">
                  {selectedTypeId
                    ? 'Modèles de recours pour le type sélectionné.'
                    : 'Sélectionnez un type de recours pour voir les modèles associés.'}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={dossierIdForSend}
                    onChange={(e) => setDossierIdForSend(e.target.value)}
                    placeholder="Choisir un dossier (N° - Titre) ou saisir un ID"
                    className="w-full sm:w-64 border rounded-md px-3 py-1.5 text-sm"
                    list="recours-dossiers-list"
                  />
                  <datalist id="recours-dossiers-list">
                    {dossiersForSend.map((d: any) => {
                      const id = String(d._id || d.id || '');
                      const numero = String(d.numero || d.numeroDossier || '').trim();
                      const titre = String(d.titre || 'Sans titre').trim();
                      const display = numero ? `${numero} - ${titre}` : `${id} - ${titre}`;
                      return <option key={id} value={display} />;
                    })}
                  </datalist>
                </div>
              </div>

              {/* Formulaire d'upload de modèle de recours */}
              {showUploadForm && (
                <div className="mb-4 border rounded-lg p-4 bg-white shadow-sm">
                  <h2 className="text-sm font-semibold mb-2">Nouveau modèle de recours</h2>
                  {uploadError && (
                    <p className="mb-2 text-xs text-red-600">{uploadError}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-1">Fichier (PDF / Word)</p>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setSelectedFile(file || null);
                          if (file && !templateTitle) {
                            setTemplateTitle(file.name);
                          }
                        }}
                        className="block w-full text-xs border rounded-md px-2 py-1.5"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-1">Titre du modèle</p>
                      <input
                        type="text"
                        value={templateTitle}
                        onChange={(e) => setTemplateTitle(e.target.value)}
                        className="block w-full text-xs border rounded-md px-2 py-1.5"
                        placeholder="Titre lisible du modèle"
                      />
                    </div>
                  </div>
                  <div className="mb-3">
                    <p className="text-xs font-medium text-gray-700 mb-1">Description</p>
                    <textarea
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                      className="block w-full text-xs border rounded-md px-2 py-1.5 min-h-[60px]"
                      placeholder="Optionnel, note interne sur ce modèle..."
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowUploadForm(false);
                        setUploadError(null);
                        setUploading(false);
                        setSelectedFile(null);
                        setTemplateTitle('');
                        setTemplateDescription('');
                      }}
                      className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={uploading || !selectedFile || !selectedTypeId || !templateTitle.trim()}
                      onClick={async () => {
                        if (!selectedFile || !selectedTypeId || !templateTitle.trim()) {
                          setUploadError('Veuillez sélectionner un type, un fichier et un titre.');
                          return;
                        }
                        setUploading(true);
                        setUploadError(null);
                        try {
                          const formData = new FormData();
                          formData.append('document', selectedFile);
                          formData.append('nom', templateTitle);
                          formData.append('description', templateDescription);
                          formData.append('categorie', 'autre');

                          // téléverser le fichier via l'API documents existante
                          const uploadRes = await documentsAPI.uploadDocument(formData);
                          if (!uploadRes.data?.success || !uploadRes.data?.document) {
                            throw new Error(uploadRes.data?.message || 'Erreur lors du téléversement du fichier');
                          }
                          const doc = uploadRes.data.document;

                          // construire une URL exploitable pour ouvrir le fichier
                          // on réutilise la route de prévisualisation existante
                          const baseURL =
                            process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
                          let fileUrl = baseURL.endsWith('/api')
                            ? `${baseURL}/user/documents/${doc._id}/preview`
                            : `${baseURL}/api/user/documents/${doc._id}/preview`;

                          // ajouter le token en query pour les ouvertures directes (nouvel onglet)
                          if (typeof window !== 'undefined') {
                            const token =
                              localStorage.getItem('token') ||
                              sessionStorage.getItem('token');
                            if (token) {
                              const separator = fileUrl.includes('?') ? '&' : '?';
                              fileUrl = `${fileUrl}${separator}token=${encodeURIComponent(
                                token
                              )}`;
                            }
                          }

                          // créer le modèle de recours à partir du document
                          const tplRes = await recoursAPI.createTemplate({
                            typeId: selectedTypeId,
                            title: templateTitle,
                            description: templateDescription,
                            fileUrl,
                            fileName: doc.nom || doc.fileName || selectedFile.name,
                            mimeType: doc.typeMime || selectedFile.type,
                            size: doc.taille || selectedFile.size,
                          });
                          if (!tplRes.data?.success) {
                            throw new Error(tplRes.data?.message || 'Erreur lors de la création du modèle');
                          }

                          await loadTemplates(selectedTypeId);
                          setShowUploadForm(false);
                          setSelectedFile(null);
                          setTemplateTitle('');
                          setTemplateDescription('');
                          setToast({ message: '✅ Modèle de recours enregistré avec succès.', type: 'success' });
                        } catch (e: any) {
                          console.error('Erreur upload modèle recours:', e);
                          setUploadError(e.response?.data?.message || e.message || 'Erreur lors de la création du modèle');
                          setToast({ message: e.response?.data?.message || e.message || 'Erreur lors de la création du modèle', type: 'error' });
                        } finally {
                          setUploading(false);
                        }
                      }}
                      className="px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
                    >
                      {uploading ? 'Enregistrement...' : 'Enregistrer le modèle'}
                    </button>
                  </div>
                </div>
              )}

              {isLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Chargement des modèles de recours...
                </div>
              ) : templates.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground border rounded-lg bg-gray-50">
                  Aucun modèle de recours trouvé pour ce type.
                </div>
              ) : (
                <div className="space-y-3">
                  {templates.map((tpl) => (
                    <div
                      key={tpl._id}
                      className="border rounded-lg p-3 sm:p-4 bg-white hover:shadow-md transition-shadow flex flex-col sm:flex-row sm:items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {tpl.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 break-words">
                          {tpl.description || tpl.fileName}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {tpl.mimeType.includes('pdf') ? 'PDF' : 'Document'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                        <Link href={buildSecureFileUrl(tpl.fileUrl)} target="_blank" rel="noopener noreferrer">
                          <button
                            type="button"
                            className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                          >
                            👁️ Ouvrir
                          </button>
                        </Link>
                        <a href={buildSecureFileUrl(tpl.fileUrl)} download className="inline-block">
                          <button
                            type="button"
                            className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                          >
                            ⬇️ Télécharger
                          </button>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleSendToDossier(tpl._id)}
                          disabled={isSending === tpl._id || !dossierIdForSend.trim()}
                          className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                          title={!dossierIdForSend.trim() ? "Saisissez d'abord un ID ou N° de dossier" : 'Envoyer le modèle vers le dossier'}
                        >
                          {isSending === tpl._id ? 'Envoi...' : '📤 Envoyer vers un dossier'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(tpl._id, tpl.title)}
                          disabled={deletingTemplateId === tpl._id}
                          className="px-3 py-1.5 text-xs rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                          title="Supprimer ce modèle"
                        >
                          {deletingTemplateId === tpl._id ? 'Suppression...' : '🗑️ Supprimer'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

