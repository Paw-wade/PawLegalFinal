'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { recoursAPI } from '@/lib/recoursAPI';
import { documentsAPI } from '@/lib/api';
import { Toast } from '@/components/Toast';

type RecoursType = {
  _id: string;
  code: string;
  label: string;
  order?: number;
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

const isWordLikeFile = (mimeType?: string, fileName?: string) => {
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('word') || mime.includes('officedocument.wordprocessingml.document')) return true;
  return /\.(docx?|odt)$/i.test(fileName || '');
};

export default function RecoursDirectoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [types, setTypes] = useState<RecoursType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<RecoursTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [movingTemplateId, setMovingTemplateId] = useState<string | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeLabel, setTypeLabel] = useState('');
  const [typeDescription, setTypeDescription] = useState('');
  const [typeError, setTypeError] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<RecoursTemplate | null>(null);
  const [previewTargetTypeId, setPreviewTargetTypeId] = useState('');
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
  }, [session, status, router]);

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

  const handleMoveTemplateType = async (templateId: string, targetTypeId: string) => {
    if (!targetTypeId || !templateId) return;
    setMovingTemplateId(templateId);
    try {
      const res = await recoursAPI.moveTemplateToType(templateId, { typeId: targetTypeId });
      if (res.data?.success) {
        await loadTemplates(selectedTypeId);
        setToast({ message: '✅ Document déplacé vers le nouveau thème.', type: 'success' });
      } else {
        setToast({ message: res.data?.message || 'Erreur lors du déplacement du document', type: 'error' });
      }
    } catch (e: any) {
      console.error('Erreur déplacement modèle recours:', e);
      setToast({ message: e.response?.data?.message || 'Erreur lors du déplacement du document', type: 'error' });
    } finally {
      setMovingTemplateId(null);
    }
  };

  const buildTypeCode = (label: string) => {
    const normalized = label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized || 'TYPE_PERSONNALISE';
  };

  const handleCreateType = async () => {
    const trimmedLabel = typeLabel.trim();
    if (!trimmedLabel) {
      setTypeError('Veuillez renseigner un nom de thème.');
      return;
    }

    setCreatingType(true);
    setTypeError(null);
    try {
      const res = await recoursAPI.createType({
        code: buildTypeCode(trimmedLabel),
        label: trimmedLabel,
        description: typeDescription.trim(),
      });

      if (!res.data?.success || !res.data?.type) {
        throw new Error(res.data?.message || 'Erreur lors de la création du thème');
      }

      const newType: RecoursType = res.data.type;
      const nextTypes = [...types, newType].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setTypes(nextTypes);
      setSelectedTypeId(newType._id);
      await loadTemplates(newType._id);
      setTypeLabel('');
      setTypeDescription('');
      setShowTypeForm(false);
      setToast({ message: '✅ Thème ajouté avec succès.', type: 'success' });
    } catch (e: any) {
      const message = e.response?.data?.message || e.message || 'Erreur lors de la création du thème';
      setTypeError(message);
      setToast({ message, type: 'error' });
    } finally {
      setCreatingType(false);
    }
  };

  const handleReorderType = async (typeId: string, direction: 'up' | 'down') => {
    const idx = types.findIndex((t) => t._id === typeId);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= types.length) return;

    const next = [...types];
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;
    setTypes(next);

    try {
      await recoursAPI.reorderTypes(next.map((t) => t._id));
      setToast({ message: '✅ Ordre des thèmes mis à jour.', type: 'success' });
    } catch (e: any) {
      console.error('Erreur réorganisation des thèmes:', e);
      setToast({ message: e.response?.data?.message || 'Erreur lors de la réorganisation des thèmes', type: 'error' });
      await loadTypes();
    }
  };

  const handleDeleteType = async (type: RecoursType) => {
    const ok = window.confirm(`Supprimer le thème "${type.label}" ?`);
    if (!ok) return;

    try {
      const res = await recoursAPI.deleteType(type._id);
      if (!res.data?.success) {
        setToast({ message: res.data?.message || 'Erreur lors de la suppression du thème', type: 'error' });
        return;
      }

      const remaining = types.filter((t) => t._id !== type._id);
      setTypes(remaining);
      if (selectedTypeId === type._id) {
        const fallback = remaining[0]?._id || null;
        setSelectedTypeId(fallback);
        await loadTemplates(fallback);
      }
      setToast({ message: '✅ Thème supprimé avec succès.', type: 'success' });
    } catch (e: any) {
      console.error('Erreur suppression thème:', e);
      setToast({ message: e.response?.data?.message || 'Erreur lors de la suppression du thème', type: 'error' });
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
              <h1 className="text-2xl font-bold text-foreground">Répertoire des documents importants</h1>
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
                  Type de document
                </p>
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {types.map((type, index) => (
                    <div
                      key={type._id}
                      className={`group w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                        selectedTypeId === type._id
                          ? 'bg-primary/10 border border-primary/20'
                          : 'bg-white border border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSelectType(type._id)}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium whitespace-normal break-words">{type.label}</span>
                            {type.restrictedToSuperadmin && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold">
                                Superadmin
                              </span>
                            )}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReorderType(type._id, 'up')}
                          disabled={index === 0}
                          className="h-6 w-6 rounded border border-gray-300 text-[11px] hover:bg-gray-100 disabled:opacity-40 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                          title="Monter"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReorderType(type._id, 'down')}
                          disabled={index === types.length - 1}
                          className="h-6 w-6 rounded border border-gray-300 text-[11px] hover:bg-gray-100 disabled:opacity-40 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                          title="Descendre"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteType(type)}
                          className="h-6 w-6 rounded border border-red-300 text-[11px] text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                          title="Supprimer le thème"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                  {types.length === 0 && !isLoading && (
                    <p className="text-xs text-muted-foreground">
                      Aucun type de recours défini pour le moment.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowTypeForm((prev) => !prev);
                    setTypeError(null);
                  }}
                  className="mt-3 w-full px-3 py-2 rounded-md text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  {showTypeForm ? 'Annuler le nouveau thème' : '+ Ajouter un thème'}
                </button>

                {showTypeForm && (
                  <div className="mt-2 space-y-2 border border-gray-200 rounded-md bg-white p-2.5">
                    {typeError && <p className="text-xs text-red-600">{typeError}</p>}
                    <input
                      type="text"
                      value={typeLabel}
                      onChange={(e) => setTypeLabel(e.target.value)}
                      placeholder="Nom du thème (ex: Jurisprudence)"
                      className="w-full border rounded-md px-2.5 py-1.5 text-xs"
                    />
                    <textarea
                      value={typeDescription}
                      onChange={(e) => setTypeDescription(e.target.value)}
                      placeholder="Description (optionnelle)"
                      className="w-full border rounded-md px-2.5 py-1.5 text-xs min-h-[58px]"
                    />
                    <button
                      type="button"
                      onClick={handleCreateType}
                      disabled={creatingType || !typeLabel.trim()}
                      className="w-full px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
                    >
                      {creatingType ? 'Ajout...' : 'Créer le thème'}
                    </button>
                  </div>
                )}

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
                          const rawBaseURL =
                            process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
                          // Normaliser pour éviter les doublons `/api` (ex: ".../api/" ou ".../api ")
                          const baseURL = String(rawBaseURL)
                            .replace(/[\s\u200B-\u200D\uFEFF\xA0]+/g, '')
                            .trim()
                            .replace(/\/+$/, '');
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
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewTemplate(tpl);
                            setPreviewTargetTypeId(tpl.type?._id || selectedTypeId || '');
                          }}
                          className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                        >
                          👁️ Ouvrir
                        </button>
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
                          onClick={() => handleDeleteTemplate(tpl._id, tpl.title)}
                          disabled={deletingTemplateId === tpl._id || movingTemplateId === tpl._id}
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
      {previewTemplate && (
        <div
          className="fixed inset-0 z-50 bg-black/70 p-3 sm:p-6 flex items-center justify-center"
          onClick={() => setPreviewTemplate(null)}
        >
          <div
            className="w-full max-w-6xl h-[88vh] bg-white rounded-xl shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
              <p className="text-sm font-semibold text-foreground truncate">
                {previewTemplate.title || previewTemplate.fileName}
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={previewTargetTypeId}
                  onChange={(e) => setPreviewTargetTypeId(e.target.value)}
                  disabled={movingTemplateId === previewTemplate._id}
                  className="px-2.5 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 bg-white disabled:opacity-60"
                  title="Choisir un thème de destination"
                >
                  {types.map((type) => (
                    <option key={type._id} value={type._id}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!previewTargetTypeId || previewTargetTypeId === previewTemplate.type?._id) return;
                    void handleMoveTemplateType(previewTemplate._id, previewTargetTypeId);
                    setPreviewTemplate(null);
                  }}
                  disabled={
                    movingTemplateId === previewTemplate._id ||
                    !previewTargetTypeId ||
                    previewTargetTypeId === previewTemplate.type?._id
                  }
                  className="px-2.5 py-1 rounded-md border border-gray-300 text-xs hover:bg-gray-100 disabled:opacity-60"
                >
                  Déplacer
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(null)}
                  className="px-2.5 py-1 rounded-md border border-gray-300 text-xs hover:bg-gray-100"
                >
                  Fermer
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100">
              {isWordLikeFile(previewTemplate.mimeType, previewTemplate.fileName) ? (
                <iframe
                  src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
                    buildSecureFileUrl(previewTemplate.fileUrl)
                  )}`}
                  title={previewTemplate.title || previewTemplate.fileName}
                  className="w-full h-full border-0"
                />
              ) : (
                <iframe
                  src={buildSecureFileUrl(previewTemplate.fileUrl)}
                  title={previewTemplate.title || previewTemplate.fileName}
                  className="w-full h-full border-0"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

