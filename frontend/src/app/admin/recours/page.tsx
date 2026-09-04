'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { recoursAPI } from '@/lib/recoursAPI';
import { documentsAPI, documentDownloadShareAPI, dossiersAPI } from '@/lib/api';
import { getPublicApiBaseUrl } from '@/lib/publicApiUrl';
import { Copy } from 'lucide-react';
import { InlineDocumentRename } from '@/components/InlineDocumentRename';
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

const ALL_TYPES_ID = '__all__';

function getTemplateTypeId(tpl: RecoursTemplate): string {
  const raw = tpl.type?._id || (tpl.type as unknown as string) || '';
  return String(raw);
}

function DocCountBadge({ count, active }: { count: number; active?: boolean }) {
  return (
    <span
      className={`inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
        active ? 'bg-primary text-white' : count > 0 ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-500'
      }`}
      title={`${count} document${count !== 1 ? 's' : ''}`}
    >
      {count}
    </span>
  );
}

export default function RecoursDirectoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [types, setTypes] = useState<RecoursType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>(ALL_TYPES_ID);
  const [allTemplates, setAllTemplates] = useState<RecoursTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadTypeId, setUploadTypeId] = useState('');
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
  const [shareModalTemplate, setShareModalTemplate] = useState<RecoursTemplate | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sendToDossierTemplate, setSendToDossierTemplate] = useState<RecoursTemplate | null>(null);
  const [dossierOptions, setDossierOptions] = useState<any[]>([]);
  const [dossierPickerLoading, setDossierPickerLoading] = useState(false);
  const [dossierSearch, setDossierSearch] = useState('');
  const [selectedDossierId, setSelectedDossierId] = useState('');
  const [sendVisibleToClient, setSendVisibleToClient] = useState(true);
  const [sendToDossierBusy, setSendToDossierBusy] = useState(false);
  const [sendToDossierError, setSendToDossierError] = useState<string | null>(null);
  const [lastSentDossierLink, setLastSentDossierLink] = useState<string | null>(null);

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
    const token = (session?.user as any)?.accessToken;
    if (token && typeof window !== 'undefined' && !localStorage.getItem('token')) {
      localStorage.setItem('token', token);
    }
    loadTypes();
  }, [session, status, router]);

  const parseDossiersList = (data: any): any[] => {
    if (Array.isArray(data?.dossiers)) return data.dossiers;
    if (Array.isArray(data)) return data;
    return [];
  };

  const loadDossierPickerOptions = async (): Promise<any[]> => {
    const res = await dossiersAPI.getAllDossiers();
    let list = parseDossiersList(res.data);
    if (list.length === 0 && res.data?.success !== true) {
      const fallback = await dossiersAPI.getMyDossiers();
      if (fallback.data?.success) {
        list = parseDossiersList(fallback.data);
      } else if (fallback.data?.message) {
        throw new Error(fallback.data.message);
      } else if (res.data?.message) {
        throw new Error(res.data.message);
      } else {
        throw new Error('Impossible de charger les dossiers');
      }
    }
    return list;
  };

  useEffect(() => {
    if (status !== 'authenticated' || !session) return;
    void (async () => {
      try {
        const list = await loadDossierPickerOptions();
        setDossierOptions(list);
      } catch {
        /* chargement à l’ouverture du modal si échec ici */
      }
    })();
  }, [session, status]);

  const loadAllTemplates = async () => {
    try {
      const res = await recoursAPI.getTemplates();
      if (res.data?.success) {
        setAllTemplates(res.data.templates || []);
      } else {
        setError(res.data?.message || 'Erreur lors du chargement des modèles');
      }
    } catch (e: any) {
      console.error('Erreur loadAllTemplates:', e);
      setError(e.response?.data?.message || 'Erreur lors du chargement des modèles');
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
        setSelectedTypeId(ALL_TYPES_ID);
        await loadAllTemplates();
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

  const refreshTemplates = async () => {
    await loadAllTemplates();
  };

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const type of types) {
      counts[type._id] = 0;
    }
    for (const tpl of allTemplates) {
      const typeId = getTemplateTypeId(tpl);
      if (typeId in counts) {
        counts[typeId] += 1;
      }
    }
    return counts;
  }, [types, allTemplates]);

  const totalDocumentCount = allTemplates.length;
  const emptyThemeCount = types.filter((t) => (typeCounts[t._id] || 0) === 0).length;

  const filteredTemplates = useMemo(() => {
    let list = allTemplates;
    if (selectedTypeId !== ALL_TYPES_ID) {
      list = list.filter((tpl) => getTemplateTypeId(tpl) === selectedTypeId);
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((tpl) => {
      const haystack = [
        tpl.title,
        tpl.description || '',
        tpl.fileName,
        tpl.type?.label || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allTemplates, selectedTypeId, searchQuery]);

  const uploadTargetTypeId =
    selectedTypeId !== ALL_TYPES_ID ? selectedTypeId : uploadTypeId;

  const handleSelectType = (typeId: string) => {
    setSelectedTypeId(typeId);
    setSearchQuery('');
  };

  const handleDeleteTemplate = async (templateId: string, title: string) => {
    const ok = window.confirm(`Supprimer définitivement le modèle "${title}" ?`);
    if (!ok) return;

    setDeletingTemplateId(templateId);
    try {
      const res = await recoursAPI.deleteTemplate(templateId);
      if (res.data?.success) {
        await refreshTemplates();
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

  const handleRenameTemplate = async (templateId: string, title: string) => {
    const res = await recoursAPI.updateTemplate(templateId, { title });
    if (!res.data?.success) {
      throw new Error(res.data?.message || 'Erreur lors du renommage');
    }
    const updated = res.data.template;
    setAllTemplates((prev) =>
      prev.map((tpl) => (tpl._id === templateId ? { ...tpl, ...updated, title: updated?.title || title } : tpl))
    );
    setToast({ message: 'Document renommé.', type: 'success' });
  };

  const handleMoveTemplateType = async (templateId: string, targetTypeId: string) => {
    if (!targetTypeId || !templateId) return;
    setMovingTemplateId(templateId);
    try {
      const res = await recoursAPI.moveTemplateToType(templateId, { typeId: targetTypeId });
      if (res.data?.success) {
        await refreshTemplates();
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

  const openShareModal = (tpl: RecoursTemplate) => {
    setShareModalTemplate(tpl);
    setShareEmail('');
    setShareMessage('');
    setShareUrl(null);
    setShareError(null);
  };

  const closeShareModal = () => {
    if (shareBusy) return;
    setShareModalTemplate(null);
    setShareEmail('');
    setShareMessage('');
    setShareUrl(null);
    setShareError(null);
  };

  const openSendToDossierModal = async (tpl: RecoursTemplate) => {
    setSendToDossierTemplate(tpl);
    setDossierSearch('');
    setSelectedDossierId('');
    setSendVisibleToClient(true);
    setSendToDossierError(null);
    setLastSentDossierLink(null);
    setDossierPickerLoading(dossierOptions.length === 0);
    try {
      const list = await loadDossierPickerOptions();
      setDossierOptions(list);
    } catch (e: any) {
      setSendToDossierError(
        e?.message || e.response?.data?.message || 'Impossible de charger les dossiers'
      );
    } finally {
      setDossierPickerLoading(false);
    }
  };

  const closeSendToDossierModal = () => {
    if (sendToDossierBusy) return;
    setSendToDossierTemplate(null);
    setDossierSearch('');
    setSelectedDossierId('');
    setSendToDossierError(null);
    setLastSentDossierLink(null);
  };

  const filteredDossierOptions = useMemo(() => {
    const q = dossierSearch.trim().toLowerCase();
    if (!q) return dossierOptions;
    return dossierOptions.filter((d: any) => {
      const titre = String(d.titre || '').toLowerCase();
      const numero = String(d.numero || d.numeroDossier || '').toLowerCase();
      const client =
        d.user && typeof d.user === 'object'
          ? `${d.user.firstName || ''} ${d.user.lastName || ''} ${d.user.email || ''}`.toLowerCase()
          : `${d.clientPrenom || ''} ${d.clientNom || ''} ${d.clientEmail || ''}`.toLowerCase();
      return `${titre} ${numero} ${client}`.includes(q);
    });
  }, [dossierOptions, dossierSearch]);

  const handleSendTemplateToDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendToDossierTemplate || !selectedDossierId) {
      setSendToDossierError('Veuillez sélectionner un dossier.');
      return;
    }
    setSendToDossierBusy(true);
    setSendToDossierError(null);
    setLastSentDossierLink(null);
    try {
      const res = await recoursAPI.sendTemplateToDossier(sendToDossierTemplate._id, {
        dossierId: selectedDossierId,
        visibleToClient: sendVisibleToClient,
      });
      if (!res.data?.success) {
        throw new Error(res.data?.message || 'Impossible d\'ajouter le document au dossier');
      }
      const dossierId = String(res.data?.dossier?._id || selectedDossierId);
      setLastSentDossierLink(`/admin/dossiers/${dossierId}`);
      setToast({
        message: `✅ « ${sendToDossierTemplate.title} » ajouté au dossier.`,
        type: 'success',
      });
    } catch (e: any) {
      setSendToDossierError(
        e.response?.data?.message || e.message || 'Erreur lors de l\'envoi vers le dossier'
      );
    } finally {
      setSendToDossierBusy(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setToast({ message: 'Lien copié dans le presse-papiers.', type: 'success' });
        return;
      }
    } catch {
      /* fallback ci-dessous */
    }
    setToast({ message: 'Copie impossible. Sélectionnez le lien manuellement.', type: 'error' });
  };

  const handleCreateDownloadShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareModalTemplate) return;
    setShareBusy(true);
    setShareError(null);
    setShareUrl(null);
    try {
      const response = await documentDownloadShareAPI.createShare({
        resourceType: 'recours_template',
        resourceId: shareModalTemplate._id,
        recipientEmail: shareEmail.trim() || undefined,
        message: shareMessage.trim() || undefined,
      });
      if (!response.data?.success || !response.data?.url) {
        throw new Error(response.data?.message || 'Impossible de créer le lien.');
      }
      setShareUrl(response.data.url);
      setToast({
        message: shareEmail.trim() ? 'Lien de téléchargement envoyé par e-mail.' : 'Lien de téléchargement créé.',
        type: 'success',
      });
    } catch (e: any) {
      setShareError(e?.response?.data?.message || e?.message || 'Erreur lors de la création du lien.');
    } finally {
      setShareBusy(false);
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
      await refreshTemplates();
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
        setSelectedTypeId(ALL_TYPES_ID);
      }
      await refreshTemplates();
      setToast({ message: '✅ Thème supprimé avec succès.', type: 'success' });
    } catch (e: any) {
      console.error('Erreur suppression thème:', e);
      setToast({ message: e.response?.data?.message || 'Erreur lors de la suppression du thème', type: 'error' });
    }
  };

  const renderTemplateCard = (tpl: RecoursTemplate, showThemeChip = false) => (
    <div
      key={tpl._id}
      className="px-3 py-2 min-w-0 border-b border-gray-100 last:border-0"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-2">
        {/* Nom + chip : pleine largeur sur mobile, flex-1 sur desktop */}
        <div className="flex items-start gap-1.5 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <InlineDocumentRename
              value={tpl.title || tpl.fileName || 'Sans titre'}
              className="text-sm text-gray-800 whitespace-normal md:truncate"
              onSave={(nextName) => handleRenameTemplate(tpl._id, nextName)}
            />
          </div>
          {showThemeChip && tpl.type?.label ? (
            <span className="mt-0.5 inline-flex shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
              {tpl.type.label}
            </span>
          ) : null}
        </div>
        {/* Boutons : taille tactile sur mobile, compacts sur desktop */}
        <div className="flex items-center gap-2 md:gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setPreviewTemplate(tpl);
              setPreviewTargetTypeId(tpl.type?._id || selectedTypeId || '');
            }}
            className="inline-flex h-9 w-9 md:h-7 md:w-7 items-center justify-center rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
            title="Ouvrir"
            aria-label="Ouvrir"
          >
            👁️
          </button>
          <button
            type="button"
            onClick={() => void openSendToDossierModal(tpl)}
            className="inline-flex h-9 w-9 md:h-7 md:w-7 items-center justify-center rounded-md border border-blue-300 text-sm text-blue-700 hover:bg-blue-50"
            title="Envoyer vers un dossier"
            aria-label="Envoyer vers un dossier"
          >
            📁
          </button>
          <button
            type="button"
            onClick={() => openShareModal(tpl)}
            className="inline-flex h-9 w-9 md:h-7 md:w-7 items-center justify-center rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
            title="Lien public"
            aria-label="Lien public"
          >
            🔗
          </button>
          <a
            href={buildSecureFileUrl(tpl.fileUrl)}
            download
            className="inline-flex h-9 w-9 md:h-7 md:w-7 items-center justify-center rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
            title="Telecharger"
            aria-label="Telecharger"
          >
            ⬇️
          </a>
          <button
            type="button"
            onClick={() => handleDeleteTemplate(tpl._id, tpl.title)}
            disabled={deletingTemplateId === tpl._id || movingTemplateId === tpl._id}
            className="inline-flex h-9 w-9 md:h-7 md:w-7 items-center justify-center rounded-md bg-red-600 text-sm text-white hover:bg-red-700 disabled:opacity-60"
            title={deletingTemplateId === tpl._id ? 'Suppression...' : 'Supprimer'}
            aria-label={deletingTemplateId === tpl._id ? 'Suppression en cours' : 'Supprimer'}
          >
            {deletingTemplateId === tpl._id ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              '🗑️'
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const renderTemplateList = () => {
    if (isLoading) {
      return (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Chargement des modèles de recours...
        </div>
      );
    }

    if (filteredTemplates.length === 0) {
      const emptyLabel =
        searchQuery.trim().length > 0
          ? 'Aucun document ne correspond à votre recherche.'
          : selectedTypeId === ALL_TYPES_ID
            ? 'Aucun document dans la documentation pour le moment.'
            : 'Aucun document pour ce thème.';
      return (
        <div className="py-10 text-center text-sm text-muted-foreground border rounded-lg bg-gray-50">
          {emptyLabel}
        </div>
      );
    }

    if (selectedTypeId === ALL_TYPES_ID && !searchQuery.trim()) {
      return (
        <div className="space-y-5">
          {types.map((type) => {
            const sectionTemplates = filteredTemplates.filter(
              (tpl) => getTemplateTypeId(tpl) === type._id
            );
            if (sectionTemplates.length === 0) return null;
            return (
              <section key={type._id} className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleSelectType(type._id)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100 transition-colors"
                >
                  <span className="text-sm font-semibold text-foreground">{type.label}</span>
                  <DocCountBadge count={sectionTemplates.length} />
                </button>
                <div className="pl-0 sm:pl-2 border border-gray-100 rounded-lg overflow-hidden bg-white">
                  {sectionTemplates.map((tpl) => renderTemplateCard(tpl))}
                </div>
              </section>
            );
          })}
        </div>
      );
    }

    const showThemeChip = selectedTypeId === ALL_TYPES_ID || Boolean(searchQuery.trim());
    return (
      <div className="border border-gray-100 rounded-lg overflow-hidden bg-white">
        {filteredTemplates.map((tpl) => renderTemplateCard(tpl, showThemeChip))}
      </div>
    );
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
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-4 sm:mb-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Répertoire des documents importants</h1>
              {!isLoading && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {totalDocumentCount} document{totalDocumentCount !== 1 ? 's' : ''} · {types.length} thème
                  {types.length !== 1 ? 's' : ''}
                  {emptyThemeCount > 0
                    ? ` · ${emptyThemeCount} thème${emptyThemeCount !== 1 ? 's' : ''} vide${emptyThemeCount !== 1 ? 's' : ''}`
                    : ''}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowUploadForm((v) => !v)}
              className="md:hidden shrink-0 px-3 py-2 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90"
            >
              + Ajouter
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-4">
            {/* Colonne gauche : types (desktop seulement) */}
            <div className="hidden md:block md:col-span-1">
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Thèmes
                </p>
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  <div
                    className={`w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                      selectedTypeId === ALL_TYPES_ID
                        ? 'bg-primary/10 border border-primary/20'
                        : 'bg-white border border-gray-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectType(ALL_TYPES_ID)}
                      className="flex w-full items-center justify-between gap-2 text-left min-w-0"
                    >
                      <span className="font-medium">Tous les documents</span>
                      <DocCountBadge count={totalDocumentCount} active={selectedTypeId === ALL_TYPES_ID} />
                    </button>
                  </div>
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
                          <div className="flex items-center justify-between gap-2 min-w-0 flex-1">
                            <span className="font-medium whitespace-normal break-words">{type.label}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <DocCountBadge
                                count={typeCounts[type._id] || 0}
                                active={selectedTypeId === type._id}
                              />
                              {type.restrictedToSuperadmin && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold">
                                  Superadmin
                                </span>
                              )}
                            </div>
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
              {/* Mobile : themes en chips horizontaux */}
              <div className="md:hidden mb-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => handleSelectType(ALL_TYPES_ID)}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    selectedTypeId === ALL_TYPES_ID
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Tous ({totalDocumentCount})
                </button>
                {types.map((type) => (
                  <button
                    key={type._id}
                    type="button"
                    onClick={() => handleSelectType(type._id)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      selectedTypeId === type._id
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {type.label}{(typeCounts[type._id] || 0) > 0 ? ` (${typeCounts[type._id]})` : ''}
                  </button>
                ))}
              </div>

              <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher un document (titre, description, thème…)"
                  className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                />
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="px-3 py-2 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 shrink-0"
                  >
                    Effacer
                  </button>
                )}
              </div>

              {/* Formulaire d'upload de modèle de recours */}
              {showUploadForm && (
                <div className="mb-4 border rounded-lg p-4 bg-white shadow-sm">
                  <h2 className="text-sm font-semibold mb-2">Nouveau modèle de recours</h2>
                  {uploadError && (
                    <p className="mb-2 text-xs text-red-600">{uploadError}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    {selectedTypeId === ALL_TYPES_ID && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-medium text-gray-700 mb-1">Thème *</p>
                        <select
                          value={uploadTypeId}
                          onChange={(e) => setUploadTypeId(e.target.value)}
                          className="block w-full text-xs border rounded-md px-2 py-1.5 bg-white"
                        >
                          <option value="">Choisir un thème…</option>
                          {types.map((type) => (
                            <option key={type._id} value={type._id}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
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
                      disabled={uploading || !selectedFile || !uploadTargetTypeId || !templateTitle.trim()}
                      onClick={async () => {
                        if (!selectedFile || !uploadTargetTypeId || !templateTitle.trim()) {
                          setUploadError('Veuillez sélectionner un thème, un fichier et un titre.');
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
                          let fileUrl = `${getPublicApiBaseUrl()}/user/documents/${doc._id}/preview`;

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
                            typeId: uploadTargetTypeId,
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

                          await refreshTemplates();
                          setSelectedTypeId(uploadTargetTypeId);
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

              {renderTemplateList()}
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
      {shareModalTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold">Lien de téléchargement public</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Modèle : {shareModalTemplate.title || shareModalTemplate.fileName}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Lien valable 7 jours, plusieurs téléchargements possibles, sans connexion Ada Papers.
            </p>
            <form onSubmit={handleCreateDownloadShare} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700" htmlFor="recoursShareEmail">
                  E-mail du destinataire (optionnel)
                </label>
                <input
                  id="recoursShareEmail"
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  className="mt-1 block w-full text-xs border rounded-md px-2 py-1.5"
                  placeholder="Laisser vide pour copier le lien uniquement"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700" htmlFor="recoursShareMessage">
                  Message (optionnel)
                </label>
                <textarea
                  id="recoursShareMessage"
                  value={shareMessage}
                  onChange={(e) => setShareMessage(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full text-xs border rounded-md px-2 py-1.5"
                />
              </div>
              {shareError && <p className="text-xs text-red-600">{shareError}</p>}
              {shareUrl && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-900">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 break-all">
                      <span className="font-medium">Lien :</span> {shareUrl}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCopyShareUrl()}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-green-300 text-green-800 hover:bg-green-100"
                      title="Copier le lien"
                      aria-label="Copier le lien de téléchargement"
                    >
                      <Copy aria-hidden width={14} height={14} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeShareModal}
                  disabled={shareBusy}
                  className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={shareBusy}
                  className="px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
                >
                  {shareBusy ? 'Création…' : shareEmail.trim() ? 'Créer et envoyer' : 'Créer le lien'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {sendToDossierTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold">Envoyer vers un dossier</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Document : {sendToDossierTemplate.title || sendToDossierTemplate.fileName}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Le fichier sera ajouté aux documents du dossier sélectionné (copie depuis la documentation).
            </p>
            <form onSubmit={handleSendTemplateToDossier} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700" htmlFor="recoursDossierSearch">
                  Rechercher un dossier
                </label>
                <input
                  id="recoursDossierSearch"
                  type="search"
                  value={dossierSearch}
                  onChange={(e) => setDossierSearch(e.target.value)}
                  className="mt-1 block w-full text-sm border rounded-md px-3 py-2"
                  placeholder="Titre, référence, client…"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700" htmlFor="recoursDossierSelect">
                  Dossier *
                </label>
                {dossierPickerLoading ? (
                  <p className="mt-2 text-xs text-muted-foreground">Chargement des dossiers…</p>
                ) : (
                  <select
                    id="recoursDossierSelect"
                    value={selectedDossierId}
                    onChange={(e) => setSelectedDossierId(e.target.value)}
                    className="mt-1 block w-full text-sm border rounded-md px-3 py-2 bg-white"
                    required
                  >
                    <option value="">Choisir un dossier…</option>
                    {filteredDossierOptions.map((d: any) => {
                      const id = String(d._id || d.id);
                      const ref = d.numero || d.numeroDossier;
                      const client =
                        d.user && typeof d.user === 'object'
                          ? `${d.user.firstName || ''} ${d.user.lastName || ''}`.trim()
                          : `${d.clientPrenom || ''} ${d.clientNom || ''}`.trim();
                      const label = [d.titre || 'Sans titre', ref ? `Réf. ${ref}` : '', client].filter(Boolean).join(' · ');
                      return (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                )}
                {!dossierPickerLoading && !sendToDossierError && dossierOptions.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">Aucun dossier disponible.</p>
                )}
                {!dossierPickerLoading &&
                  !sendToDossierError &&
                  dossierOptions.length > 0 &&
                  filteredDossierOptions.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Aucun dossier ne correspond à la recherche.
                    </p>
                  )}
              </div>
              <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendVisibleToClient}
                  onChange={(e) => setSendVisibleToClient(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Rendre ce document visible pour le client sur le dossier</span>
              </label>
              {sendToDossierError && <p className="text-xs text-red-600">{sendToDossierError}</p>}
              {lastSentDossierLink && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-900">
                  Document ajouté.{' '}
                  <Link href={lastSentDossierLink} className="font-semibold underline">
                    Ouvrir le dossier →
                  </Link>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeSendToDossierModal}
                  disabled={sendToDossierBusy}
                  className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={sendToDossierBusy || !selectedDossierId || dossierPickerLoading}
                  className="px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
                >
                  {sendToDossierBusy ? 'Envoi…' : 'Ajouter au dossier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

