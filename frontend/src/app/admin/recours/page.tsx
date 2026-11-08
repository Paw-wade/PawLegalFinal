'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { recoursAPI } from '@/lib/recoursAPI';
import { documentsAPI, documentDownloadShareAPI, dossiersAPI } from '@/lib/api';
import { getPublicApiBaseUrl } from '@/lib/publicApiUrl';
import { Copy } from 'lucide-react';
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
const LINKS_ID = '__links__';
const isLinkTemplate = (tpl: RecoursTemplate) => tpl.mimeType === 'text/uri-list';

function getTemplateTypeId(tpl: RecoursTemplate): string {
  const raw = tpl.type?._id || (tpl.type as unknown as string) || '';
  return String(raw);
}

function FileTypeIcon({ mimeType, fileName, isLink }: { mimeType?: string; fileName?: string; isLink?: boolean }) {
  if (isLink) {
    return (
      <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-100 flex flex-col items-center justify-center gap-0.5 shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        <span className="text-[9px] font-bold text-blue-600 tracking-wide">LIEN</span>
      </div>
    );
  }
  const mime = (mimeType || '').toLowerCase();
  const name = (fileName || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) {
    return (
      <div className="w-14 h-14 rounded-xl bg-red-50 border border-red-100 flex flex-col items-center justify-center shrink-0">
        <span className="text-lg font-black text-red-600 leading-none tracking-tight">PDF</span>
      </div>
    );
  }
  if (mime.includes('word') || mime.includes('wordprocessingml') || name.match(/\.docx?$/)) {
    return (
      <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-100 flex flex-col items-center justify-center shrink-0">
        <span className="text-base font-black text-blue-700 leading-none tracking-tight">DOC</span>
      </div>
    );
  }
  if (mime.includes('spreadsheet') || mime.includes('excel') || name.match(/\.xlsx?$/)) {
    return (
      <div className="w-14 h-14 rounded-xl bg-green-50 border border-green-100 flex flex-col items-center justify-center shrink-0">
        <span className="text-base font-black text-green-700 leading-none tracking-tight">XLS</span>
      </div>
    );
  }
  if (mime.includes('presentation') || mime.includes('powerpoint') || name.match(/\.pptx?$/)) {
    return (
      <div className="w-14 h-14 rounded-xl bg-orange-50 border border-orange-100 flex flex-col items-center justify-center shrink-0">
        <span className="text-base font-black text-orange-600 leading-none tracking-tight">PPT</span>
      </div>
    );
  }
  const ext = name.split('.').pop()?.toUpperCase().slice(0, 4) || 'FIL';
  return (
    <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-200 flex flex-col items-center justify-center gap-0.5 shrink-0">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span className="text-[9px] font-bold text-gray-500">{ext}</span>
    </div>
  );
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
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file');
  const [linkUrl, setLinkUrl] = useState('');
  const [renamingTemplateId, setRenamingTemplateId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

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

  const linkCount = useMemo(() => allTemplates.filter(isLinkTemplate).length, [allTemplates]);

  const filteredTemplates = useMemo(() => {
    let list = allTemplates;
    if (selectedTypeId === LINKS_ID) {
      list = list.filter(isLinkTemplate);
    } else if (selectedTypeId !== ALL_TYPES_ID) {
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

  const handleAddLink = async () => {
    const url = linkUrl.trim();
    const title = linkTitle.trim() || url;
    if (!url) { setLinkError('URL requise.'); return; }
    if (!uploadTargetTypeId) { setLinkError('Veuillez choisir un theme.'); return; }
    setAddingLink(true);
    setLinkError(null);
    try {
      const res = await recoursAPI.createTemplate({
        typeId: uploadTargetTypeId,
        title,
        description: templateDescription,
        fileUrl: url,
        fileName: title,
        mimeType: 'text/uri-list',
        size: 0,
      });
      if (!res.data?.success) throw new Error(res.data?.message || 'Erreur');
      await refreshTemplates();
      setSelectedTypeId(uploadTargetTypeId);
      setShowUploadForm(false);
      setLinkUrl('');
      setLinkTitle('');
      setTemplateDescription('');
      setUploadMode('file');
      setToast({ message: 'Lien utile ajoute.', type: 'success' });
    } catch (e: any) {
      setLinkError(e.response?.data?.message || e.message || 'Erreur lors de l\'ajout du lien');
    } finally {
      setAddingLink(false);
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

  const renderTemplateCard = (tpl: RecoursTemplate, showThemeChip = false) => {
    const isLink = isLinkTemplate(tpl);
    const isDeleting = deletingTemplateId === tpl._id;
    const isMoving = movingTemplateId === tpl._id;
    return (
      <div
        key={tpl._id}
        className="group relative flex flex-col items-center bg-white border border-gray-200 rounded-xl p-3 hover:border-primary/40 hover:shadow-md transition-all min-h-[9rem]"
      >
        <div className="mb-2 mt-0.5">
          <FileTypeIcon mimeType={tpl.mimeType} fileName={tpl.fileName} isLink={isLink} />
        </div>
        <div className="w-full text-center min-h-[3rem] flex items-start justify-center px-1">
          {renamingTemplateId === tpl._id ? (
            <div className="w-full" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { void handleRenameTemplate(tpl._id, renameValue); setRenamingTemplateId(null); }
                  if (e.key === 'Escape') setRenamingTemplateId(null);
                }}
                autoFocus
                className="w-full text-xs border rounded-md px-1.5 py-1 text-center bg-white"
              />
              <div className="flex gap-1 mt-1">
                <button type="button" onClick={() => { void handleRenameTemplate(tpl._id, renameValue); setRenamingTemplateId(null); }} className="flex-1 text-[10px] bg-green-600 text-white rounded px-1 py-0.5 font-medium">OK</button>
                <button type="button" onClick={() => setRenamingTemplateId(null)} className="flex-1 text-[10px] border border-gray-300 rounded px-1 py-0.5">Annuler</button>
              </div>
            </div>
          ) : (
            <p className="text-[11px] font-semibold text-gray-800 line-clamp-3 text-center leading-snug break-words w-full">
              {tpl.title || tpl.fileName || 'Sans titre'}
            </p>
          )}
        </div>
        {isLink && (
          <p className="text-[10px] text-blue-400 truncate w-full text-center mt-0.5">{tpl.fileUrl}</p>
        )}
        {showThemeChip && tpl.type?.label && (
          <span className="mt-1 inline-flex shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
            {tpl.type.label}
          </span>
        )}
        <div className="absolute inset-0 rounded-xl bg-white/95 opacity-0 group-hover:opacity-100 flex flex-col items-stretch justify-center gap-1.5 p-2.5 transition-opacity pointer-events-none group-hover:pointer-events-auto">
          {isLink ? (
            <>
              <a
                href={tpl.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 h-8 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 8.5L8.5 5.5M6 3H3a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2v-3M9 1h4m0 0v4m0-4L6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Ouvrir
              </a>
              <button
                type="button"
                onClick={() => { try { navigator.clipboard.writeText(tpl.fileUrl); } catch {} setToast({ message: 'URL copiee.', type: 'success' }); }}
                className="flex items-center justify-center gap-1.5 h-8 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100"
              >
                <Copy width={11} height={11} strokeWidth={2} />
                Copier l'URL
              </button>
            </>
          ) : (
            <>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => { setPreviewTemplate(tpl); setPreviewTargetTypeId(tpl.type?._id || selectedTypeId || ''); }}
                  className="flex-1 flex items-center justify-center h-8 rounded-lg border border-gray-300 text-gray-700 text-xs hover:bg-gray-100"
                  title="Ouvrir"
                >
                  👁️
                </button>
                <button
                  type="button"
                  onClick={() => void openSendToDossierModal(tpl)}
                  className="flex-1 flex items-center justify-center h-8 rounded-lg border border-blue-300 text-blue-700 text-xs hover:bg-blue-50"
                  title="Ajouter au dossier"
                >
                  📁
                </button>
                <button
                  type="button"
                  onClick={() => openShareModal(tpl)}
                  className="flex-1 flex items-center justify-center h-8 rounded-lg border border-gray-300 text-gray-700 text-xs hover:bg-gray-100"
                  title="Lien public"
                >
                  🔗
                </button>
                <a
                  href={buildSecureFileUrl(tpl.fileUrl)}
                  download
                  className="flex-1 flex items-center justify-center h-8 rounded-lg border border-gray-300 text-gray-700 text-xs hover:bg-gray-100"
                  title="Telecharger"
                >
                  ⬇️
                </a>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => { setRenamingTemplateId(tpl._id); setRenameValue(tpl.title || tpl.fileName || ''); }}
                  className="flex-1 flex items-center justify-center h-8 rounded-lg border border-gray-300 text-gray-700 text-xs hover:bg-gray-100"
                  title="Renommer"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(tpl._id, tpl.title)}
                  disabled={isDeleting || isMoving}
                  className="flex-1 flex items-center justify-center h-8 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-60"
                  title="Supprimer"
                >
                  {isDeleting ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : '🗑️'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderTemplateList = () => {
    if (isLoading) {
      return (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Chargement...
        </div>
      );
    }

    if (filteredTemplates.length === 0) {
      const emptyLabel =
        searchQuery.trim().length > 0
          ? 'Aucun document ne correspond a votre recherche.'
          : selectedTypeId === ALL_TYPES_ID
            ? 'Aucun document dans la documentation pour le moment.'
            : 'Aucun document pour ce theme.';
      return (
        <div className="py-16 text-center text-sm text-muted-foreground border rounded-xl bg-gray-50">
          {emptyLabel}
        </div>
      );
    }

    if (selectedTypeId === ALL_TYPES_ID && !searchQuery.trim()) {
      return (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Dossiers</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {types.map((type) => {
              const count = typeCounts[type._id] || 0;
              return (
                <button
                  key={type._id}
                  type="button"
                  onClick={() => handleSelectType(type._id)}
                  className="group flex flex-col items-center bg-white border border-gray-200 rounded-xl p-3 hover:border-primary/40 hover:shadow-md transition-all text-center min-h-[8rem]"
                >
                  <div className="mb-2 mt-0.5">
                    <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="#bfdbfe" stroke="#93c5fd" strokeWidth="1.5" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">{type.label}</span>
                  <span className={`mt-1.5 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${count > 0 ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'}`}>
                    {count} fichier{count !== 1 ? 's' : ''}
                  </span>
                </button>
              );
            })}
            {/* Carte virtuelle Liens utiles */}
            <button
              type="button"
              onClick={() => handleSelectType(LINKS_ID)}
              className="group flex flex-col items-center bg-white border border-gray-200 rounded-xl p-3 hover:border-blue-400 hover:shadow-md transition-all text-center min-h-[8rem]"
            >
              <div className="mb-2 mt-0.5">
                <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
              <span className="text-xs font-medium text-gray-800 leading-tight">Liens utiles</span>
              <span className={`mt-1.5 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${linkCount > 0 ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                {linkCount} lien{linkCount !== 1 ? 's' : ''}
              </span>
            </button>
          </div>
        </div>
      );
    }

    const showThemeChip = selectedTypeId === ALL_TYPES_ID || Boolean(searchQuery.trim());
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Ressources et liens</h1>
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

          {/* Barre de navigation + actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            {selectedTypeId !== ALL_TYPES_ID && !searchQuery.trim() ? (
              <div className="flex items-center gap-2 text-sm min-w-0">
                <button
                  type="button"
                  onClick={() => handleSelectType(ALL_TYPES_ID)}
                  className="text-primary hover:underline flex items-center gap-1 shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L4 7l5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Dossiers
                </button>
                <span className="text-gray-400">/</span>
                <span className="font-semibold text-gray-800 truncate">
                  {selectedTypeId === LINKS_ID ? 'Liens utiles' : (types.find((t) => t._id === selectedTypeId)?.label || 'Dossier')}
                </span>
              </div>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => { setShowTypeForm((prev) => !prev); setTypeError(null); }}
                className="px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                {showTypeForm ? 'Annuler' : '+ Dossier'}
              </button>
              <button
                type="button"
                onClick={() => setShowUploadForm(true)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                + Ajouter un modèle
              </button>
            </div>
          </div>

          {showTypeForm && (
            <div className="mb-4 border border-gray-200 rounded-lg bg-white p-3 space-y-2">
              {typeError && <p className="text-xs text-red-600">{typeError}</p>}
              <input
                type="text"
                value={typeLabel}
                onChange={(e) => setTypeLabel(e.target.value)}
                placeholder="Nom du dossier (ex: Jurisprudence)"
                className="w-full border rounded-md px-2.5 py-1.5 text-xs"
              />
              <textarea
                value={typeDescription}
                onChange={(e) => setTypeDescription(e.target.value)}
                placeholder="Description (optionnelle)"
                className="w-full border rounded-md px-2.5 py-1.5 text-xs min-h-[52px]"
              />
              <button
                type="button"
                onClick={handleCreateType}
                disabled={creatingType || !typeLabel.trim()}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {creatingType ? 'Ajout...' : 'Créer le dossier'}
              </button>
            </div>
          )}

          <div>
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
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="text-sm font-semibold">Ajouter au repertoire</h2>
                    <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => setUploadMode('file')}
                        className={`px-3 py-1.5 font-medium transition-colors ${uploadMode === 'file' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                      >
                        Fichier
                      </button>
                      <button
                        type="button"
                        onClick={() => setUploadMode('link')}
                        className={`px-3 py-1.5 font-medium transition-colors ${uploadMode === 'link' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                      >
                        Lien utile
                      </button>
                    </div>
                  </div>

                  {uploadMode === 'link' && (
                    <div className="space-y-3">
                      {linkError && <p className="text-xs text-red-600">{linkError}</p>}
                      {selectedTypeId === ALL_TYPES_ID && (
                        <div>
                          <p className="text-xs font-medium text-gray-700 mb-1">Theme *</p>
                          <select
                            value={uploadTypeId}
                            onChange={(e) => setUploadTypeId(e.target.value)}
                            className="block w-full text-xs border rounded-md px-2 py-1.5 bg-white"
                          >
                            <option value="">Choisir un theme...</option>
                            {types.map((type) => (
                              <option key={type._id} value={type._id}>{type.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-medium text-gray-700 mb-1">URL *</p>
                        <input
                          type="url"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                          placeholder="https://..."
                          className="block w-full text-xs border rounded-md px-2 py-1.5"
                        />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-700 mb-1">Titre</p>
                        <input
                          type="text"
                          value={linkTitle}
                          onChange={(e) => setLinkTitle(e.target.value)}
                          placeholder="Nom du lien (optionnel)"
                          className="block w-full text-xs border rounded-md px-2 py-1.5"
                        />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-700 mb-1">Description</p>
                        <textarea
                          value={templateDescription}
                          onChange={(e) => setTemplateDescription(e.target.value)}
                          placeholder="Note interne (optionnelle)"
                          className="block w-full text-xs border rounded-md px-2 py-1.5 min-h-[52px]"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowUploadForm(false); setLinkUrl(''); setLinkTitle(''); setLinkError(null); setUploadMode('file'); }}
                          className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          disabled={addingLink || !linkUrl.trim() || !uploadTargetTypeId}
                          onClick={handleAddLink}
                          className="px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
                        >
                          {addingLink ? 'Ajout...' : 'Ajouter le lien'}
                        </button>
                      </div>
                    </div>
                  )}

                  {uploadMode === 'file' && uploadError && (
                    <p className="mb-2 text-xs text-red-600">{uploadError}</p>
                  )}
                  {uploadMode === 'file' && (<>
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
                  </>
                  )}
                </div>
              )}

              {renderTemplateList()}
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

