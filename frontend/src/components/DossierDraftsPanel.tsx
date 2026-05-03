"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collaborativeDraftsAPI, userAPI, dossiersAPI } from '@/lib/api';
import { RichTextEditor } from './RichTextEditor';
import { exportDraftAsPdf, exportDraftAsWord } from '@/utils/exportDraft';

function toInputDateValue(iso?: string | Date | null) {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

type DossierDraftsPanelProps = {
  dossierId: string;
  /** Lien vers la page dédiée "Documents en préparation" (ex: /partenaire/dossiers/[id]/documents-en-preparation). Si fourni, un bouton permet d'y accéder. */
  linkToDedicatedPageHref?: string;
  /** Ouvre directement ce brouillon (ex. depuis la liste globale admin ?draft=). */
  initialDraftId?: string | null;
};

type PartnerAccessEntry = {
  partner: string | { _id: string; firstName?: string; lastName?: string; email?: string };
  canEdit: boolean;
};

type Draft = {
  _id: string;
  title: string;
  content: any;
  dueDate?: string | Date | null;
  completedAt?: string | Date | null;
  createdBy?: { _id?: string; firstName?: string; lastName?: string; role?: string };
  updatedAt?: string;
  canEdit?: boolean;
  canManagePermissions?: boolean;
  visibleToAdmins?: boolean;
  excludedAdminIds?: string[];
  partnerAccess?: PartnerAccessEntry[];
};

function isDraftOverdue(due?: string | Date | null, completed?: boolean) {
  if (completed || !due) return false;
  const d = typeof due === 'string' ? new Date(due) : due;
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

const ADMIN_ROLES = ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'];

export function DossierDraftsPanel({ dossierId, linkToDedicatedPageHref, initialDraftId }: DossierDraftsPanelProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTitle, setCurrentTitle] = useState('');
  const [currentContent, setCurrentContent] = useState('');
  const [currentDueDate, setCurrentDueDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDraftTitle, setNewDraftTitle] = useState('');
  const [newDraftDueDate, setNewDraftDueDate] = useState('');
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [permsVisibleToAdmins, setPermsVisibleToAdmins] = useState(true);
  const [permsExcludedAdminIds, setPermsExcludedAdminIds] = useState<string[]>([]);
  const [permsPartnerAccess, setPermsPartnerAccess] = useState<{ partner: string; canEdit: boolean }[]>([]);
  const [allUsers, setAllUsers] = useState<{ _id: string; firstName?: string; lastName?: string; email?: string; role?: string }[]>([]);
  const [dossierTransmittedTo, setDossierTransmittedTo] = useState<{ partenaire: { _id: string; firstName?: string; lastName?: string } }[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [currentUserIsAdmin, setCurrentUserIsAdmin] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [statusToggling, setStatusToggling] = useState(false);

  const selectedDraft = drafts.find((d) => d._id === selectedId) || null;

  useEffect(() => {
    const loadDrafts = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await collaborativeDraftsAPI.getDossierDrafts(dossierId);
        if (response.data.success) {
          const list: Draft[] = response.data.drafts || [];
          setDrafts(list);
          setCurrentUserIsAdmin(!!response.data.currentUserIsAdmin);
          if (list.length > 0) {
            const preferred =
              initialDraftId && list.some((d) => String(d._id) === String(initialDraftId))
                ? list.find((d) => String(d._id) === String(initialDraftId))!
                : list[0];
            setSelectedId(preferred._id);
            setCurrentTitle(preferred.title || '');
            setCurrentContent(
              typeof preferred.content === 'string' ? preferred.content : preferred.content || ''
            );
            setCurrentDueDate(toInputDateValue(preferred.dueDate));
            setHasUnsavedChanges(false);
          } else {
            setSelectedId(null);
            setCurrentTitle('');
            setCurrentContent('');
            setCurrentDueDate('');
            setHasUnsavedChanges(false);
          }
        } else {
          setError('Impossible de charger les documents en préparation.');
        }
      } catch (e: any) {
        console.error('Erreur lors du chargement des brouillons collaboratifs:', e);
        setError(e.response?.data?.message || 'Erreur lors du chargement des documents en préparation.');
      } finally {
        setIsLoading(false);
      }
    };

    if (dossierId) {
      loadDrafts();
    }
  }, [dossierId, initialDraftId]);

  const handleSaveDraft = async () => {
    if (!selectedDraft || !selectedDraft.canEdit) return;
    setIsSaving(true);
    setError(null);
    try {
      const saveRes = await collaborativeDraftsAPI.updateDraft(selectedDraft._id, {
        title: currentTitle.trim() || selectedDraft.title || 'Sans titre',
        content: currentContent,
        dueDate: currentDueDate.trim() ? currentDueDate.trim() : null,
      });
      const savedDraft = saveRes.data?.draft;
      setDrafts((prev) =>
        prev.map((d) =>
          d._id === selectedDraft._id
            ? {
                ...d,
                title: currentTitle.trim() || d.title,
                content: currentContent,
                dueDate: savedDraft?.dueDate ?? (currentDueDate.trim() ? currentDueDate : null),
                completedAt: savedDraft?.completedAt != null ? savedDraft.completedAt : d.completedAt,
                updatedAt: new Date().toISOString(),
              }
            : d
        )
      );
      const now = new Date();
      setLastSavedAt(
        now.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
      setHasUnsavedChanges(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('collaborativeDraftsUpdated'));
      }
    } catch (e: any) {
      console.error('Erreur lors de la sauvegarde du brouillon:', e);
      setError(e.response?.data?.message || 'Impossible d’enregistrer le document.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDraftCompleted = async () => {
    if (!selectedDraft || !selectedDraft.canEdit) return;
    const next = !selectedDraft.completedAt;
    setStatusToggling(true);
    setError(null);
    try {
      const res = await collaborativeDraftsAPI.updateDraft(selectedDraft._id, { completed: next });
      const doc = res.data?.draft;
      setDrafts((prev) =>
        prev.map((d) =>
          d._id === selectedDraft._id ? { ...d, completedAt: doc?.completedAt ?? (next ? new Date() : null) } : d
        )
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('collaborativeDraftsUpdated'));
      }
    } catch (e: any) {
      console.error('Erreur statut terminé:', e);
      setError(e.response?.data?.message || 'Impossible de mettre à jour le statut.');
    } finally {
      setStatusToggling(false);
    }
  };

  const handleSelectDraft = (draft: Draft) => {
    if (draft._id === selectedId) return;
    if (hasUnsavedChanges) {
      const ok = window.confirm(
        'Vous avez des modifications non enregistrées. Les ignorer et changer de document ?'
      );
      if (!ok) return;
    }
    setSelectedId(draft._id);
    setCurrentTitle(draft.title || '');
    setCurrentContent(typeof draft.content === 'string' ? draft.content : draft.content || '');
    setCurrentDueDate(toInputDateValue(draft.dueDate));
    setLastSavedAt(null);
    setHasUnsavedChanges(false);
  };

  const handleOpenCreateModal = () => {
    setNewDraftTitle('');
    setNewDraftDueDate('');
    setShowCreateModal(true);
  };

  const handleCreateDraft = async () => {
    const title = newDraftTitle.trim() || 'Nouveau document';
    setShowCreateModal(false);
    setNewDraftTitle('');
    const dueForCreate = newDraftDueDate.trim();
    setNewDraftDueDate('');
    try {
      const response = await collaborativeDraftsAPI.createDraft(dossierId, {
        title,
        content: '',
        ...(dueForCreate ? { dueDate: dueForCreate } : {}),
      });

      if (response.data.success) {
        const newDraft: Draft = response.data.draft;
        setDrafts((prev) => [newDraft, ...prev]);
        setSelectedId(newDraft._id);
        setCurrentTitle(newDraft.title || '');
        setCurrentContent('');
        setCurrentDueDate(toInputDateValue(newDraft.dueDate));
        setLastSavedAt(null);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('collaborativeDraftsUpdated'));
        }
      }
    } catch (e: any) {
      console.error('Erreur lors de la création du brouillon:', e);
      alert(e.response?.data?.message || 'Erreur lors de la création du document en préparation.');
    }
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setNewDraftTitle('');
    setNewDraftDueDate('');
  };

  const handleOpenPermissionsModal = async () => {
    if (!selectedDraft) return;
    setShowPermissionsModal(true);
    setPermissionsError(null);
    setPermsVisibleToAdmins(selectedDraft.visibleToAdmins ?? true);
    setPermsExcludedAdminIds((selectedDraft.excludedAdminIds || []).map((id: any) => String(id)));
    setPermsPartnerAccess(
      (selectedDraft.partnerAccess || []).map((pa: PartnerAccessEntry) => ({
        partner: typeof pa.partner === 'object' && pa.partner && '_id' in pa.partner ? pa.partner._id : String(pa.partner),
        canEdit: !!pa.canEdit,
      }))
    );
    try {
      const [usersRes, dossierRes] = await Promise.all([
        userAPI.getAllUsers().catch(() => ({ data: { users: [] } })),
        dossiersAPI.getDossierById(dossierId).catch(() => ({ data: {} })),
      ]);
      setAllUsers(usersRes.data?.users || []);
      const dossier = dossierRes.data?.dossier || dossierRes.data;
      setDossierTransmittedTo(dossier?.transmittedTo || []);
    } catch (e) {
      setPermissionsError('Impossible de charger les utilisateurs ou le dossier.');
    }
  };

  const handleClosePermissionsModal = () => {
    setShowPermissionsModal(false);
    setPermissionsError(null);
  };

  const handleSavePermissions = async () => {
    if (!selectedDraft) return;
    setSavingPermissions(true);
    setPermissionsError(null);
    try {
      await collaborativeDraftsAPI.updatePermissions(selectedDraft._id, {
        visibleToAdmins: permsVisibleToAdmins,
        excludedAdminIds: permsExcludedAdminIds,
        partnerAccess: permsPartnerAccess,
      });
      const response = await collaborativeDraftsAPI.getDossierDrafts(dossierId);
      if (response.data.success) {
        const list: Draft[] = response.data.drafts || [];
        setDrafts(list);
        const updated = list.find((d) => d._id === selectedDraft._id);
        if (updated) {
          setCurrentTitle(updated.title || '');
          setCurrentContent(typeof updated.content === 'string' ? updated.content : updated.content || '');
          setCurrentDueDate(toInputDateValue(updated.dueDate));
          setHasUnsavedChanges(false);
        }
      }
      handleClosePermissionsModal();
    } catch (e: any) {
      setPermissionsError(e.response?.data?.message || 'Erreur lors de la sauvegarde des autorisations.');
    } finally {
      setSavingPermissions(false);
    }
  };

  const toggleExcludedAdmin = (userId: string) => {
    setPermsExcludedAdminIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const addPartnerAccess = (partnerId: string) => {
    if (permsPartnerAccess.some((pa) => pa.partner === partnerId)) return;
    setPermsPartnerAccess((prev) => [...prev, { partner: partnerId, canEdit: false }]);
  };

  const removePartnerAccess = (partnerId: string) => {
    setPermsPartnerAccess((prev) => prev.filter((pa) => pa.partner !== partnerId));
  };

  const setPartnerCanEdit = (partnerId: string, canEdit: boolean) => {
    setPermsPartnerAccess((prev) =>
      prev.map((pa) => (pa.partner === partnerId ? { ...pa, canEdit } : pa))
    );
  };

  const adminUsers = allUsers.filter((u) => u.role && ADMIN_ROLES.includes(u.role));
  const partnerUsers = allUsers.filter((u) => u.role === 'partenaire');
  const partnersFromDossier = dossierTransmittedTo.map((t) => t.partenaire).filter(Boolean);
  type PartnerOption = { _id: string; firstName?: string; lastName?: string };
  const partnerEntries: [string, PartnerOption][] = [
    ...partnersFromDossier.map((p) => [p._id, p] as [string, PartnerOption]),
    ...partnerUsers.map((p) => [p._id, { _id: p._id, firstName: p.firstName, lastName: p.lastName }] as [string, PartnerOption]),
  ];
  const partnerOptions = Array.from(new Map(partnerEntries).values());

  const [isCollapsed, setIsCollapsed] = useState(false);

  const getPartnerLabel = (partnerId: string) => {
    const fromAccess = selectedDraft?.partnerAccess?.find((pa) => {
      const id = typeof pa.partner === 'object' && pa.partner && '_id' in pa.partner ? pa.partner._id : String(pa.partner);
      return id === partnerId;
    });
    if (fromAccess && typeof fromAccess.partner === 'object' && fromAccess.partner) {
      const p = fromAccess.partner as { firstName?: string; lastName?: string };
      return `${p.firstName || ''} ${p.lastName || ''}`.trim() || partnerId;
    }
    const u = allUsers.find((u) => u._id === partnerId) || partnerOptions.find((p: any) => p._id === partnerId);
    if (u) return `${(u as any).firstName || ''} ${(u as any).lastName || ''}`.trim() || partnerId;
    return partnerId;
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mt-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">📝 Documents en préparation</h2>
          <p className="text-xs text-gray-500">
            Zone de travail interne pour les admins et partenaires. Non visible par le client.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
          >
            {isCollapsed ? 'Afficher les documents' : 'Masquer les documents'}
          </button>
          {linkToDedicatedPageHref && (
            <Link
              href={linkToDedicatedPageHref}
              className="inline-flex items-center rounded-md border border-orange-500 bg-white px-3 py-1.5 text-xs font-medium text-orange-600 shadow-sm hover:bg-orange-50"
            >
              Ouvrir la page dédiée →
            </Link>
          )}
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-orange-600"
          >
            + Nouveau document
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {isCollapsed ? null : isLoading ? (
        <div className="py-8 text-center text-sm text-gray-500">Chargement des documents en préparation...</div>
      ) : drafts.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-500">
          Aucun document en préparation pour ce dossier. Créez un premier document pour commencer.
        </div>
      ) : (
        <div className="w-full space-y-4">
          {/* Titres des documents — juste au-dessus, en ligne */}
          <div className="flex flex-wrap gap-2">
            {drafts.map((draft) => {
              const authorName = draft.createdBy
                ? `${draft.createdBy.firstName || ''} ${draft.createdBy.lastName || ''}`.trim()
                : '';
              const label = authorName || (draft.createdBy?.role ? draft.createdBy.role : 'Auteur');
              const dueChip = draft.dueDate
                ? ` · ${new Date(draft.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`
                : '';

              return (
                <button
                  key={draft._id}
                  type="button"
                  onClick={() => handleSelectDraft(draft)}
                  className={`text-left rounded-lg px-3 py-2 text-xs transition-colors whitespace-nowrap ${
                    selectedId === draft._id
                      ? 'bg-orange-50 border border-orange-300 shadow-sm font-semibold'
                      : 'bg-gray-50/80 border border-gray-200 hover:bg-white'
                  }`}
                >
                  <span className="text-gray-900">{draft.title || 'Sans titre'}</span>
                  <span className="ml-1.5 text-[11px] text-gray-500">· {label}</span>
                  {dueChip ? <span className="text-[11px] text-orange-700 font-medium">{dueChip}</span> : null}
                </button>
              );
            })}
          </div>

          {/* Zone éditeur en pleine largeur */}
          <div className="w-full space-y-2">
            {selectedDraft ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={currentTitle}
                    onChange={(e) => {
                      setCurrentTitle(e.target.value);
                      if (selectedDraft.canEdit) setHasUnsavedChanges(true);
                    }}
                    disabled={!selectedDraft.canEdit}
                    className="flex-1 min-w-[140px] rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50 disabled:text-gray-400"
                    placeholder="Titre du document"
                  />
                  <label className="sr-only" htmlFor="draft-due-date">
                    Date d&apos;échéance
                  </label>
                  <input
                    id="draft-due-date"
                    type="date"
                    value={currentDueDate}
                    onChange={(e) => {
                      setCurrentDueDate(e.target.value);
                      if (selectedDraft.canEdit) setHasUnsavedChanges(true);
                    }}
                    disabled={!selectedDraft.canEdit}
                    title="Échéance (optionnel)"
                    className="shrink-0 rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => exportDraftAsPdf(currentTitle, currentContent)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1"
                    title="Télécharger en PDF"
                  >
                    <span aria-hidden>📄</span>
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => exportDraftAsWord(currentTitle, currentContent)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1"
                    title="Télécharger en Word"
                  >
                    <span aria-hidden>📝</span>
                    Word
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenPermissionsModal}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-md border-2 border-orange-500 bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1"
                  >
                    <span aria-hidden>🔐</span>
                    Autorisations
                  </button>
                  {selectedDraft.canEdit && (
                    <button
                      type="button"
                      onClick={() => void handleSaveDraft()}
                      disabled={isSaving}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 disabled:opacity-60"
                    >
                      {isSaving ? 'Enregistrement…' : 'Enregistrer le document'}
                    </button>
                  )}
                  {selectedDraft.canEdit && (
                    <button
                      type="button"
                      onClick={() => void handleToggleDraftCompleted()}
                      disabled={statusToggling || isSaving}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 disabled:opacity-60"
                    >
                      {statusToggling ? '…' : selectedDraft.completedAt ? 'Rouvrir (non terminé)' : 'Marquer terminé'}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedDraft.completedAt ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                      Terminé
                    </span>
                  ) : null}
                  {isDraftOverdue(selectedDraft.dueDate, !!selectedDraft.completedAt) ? (
                    <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-800 border border-red-200">
                      Échéance dépassée
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-500 flex-wrap gap-2">
                  <span>
                    {selectedDraft.canEdit ? (
                      <>
                        {hasUnsavedChanges ? (
                          <span className="text-amber-700 font-medium">Modifications non enregistrées — cliquez sur « Enregistrer le document ».</span>
                        ) : (
                          <span>Utilisez le bouton Enregistrer pour sauvegarder vos changements.</span>
                        )}
                      </>
                    ) : (
                      'Lecture seule — vous ne pouvez pas modifier ce document.'
                    )}
                  </span>
                  <span>
                    {isSaving
                      ? 'Enregistrement...'
                      : lastSavedAt
                      ? `Dernier enregistrement : ${lastSavedAt}`
                      : selectedDraft.updatedAt
                      ? `Dernière sauvegarde serveur : ${new Date(selectedDraft.updatedAt).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : ''}
                  </span>
                </div>
                <RichTextEditor
                  value={currentContent}
                  onChange={(val) => {
                    if (!selectedDraft.canEdit) return;
                    setCurrentContent(val);
                    setHasUnsavedChanges(true);
                  }}
                  readOnly={!selectedDraft.canEdit}
                  placeholder="Saisissez ici le contenu du document (brouillon interne)..."
                  className="mt-1 w-full"
                />
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 bg-white/60 p-6 text-center text-sm text-gray-500 w-full">
                Sélectionnez un document ci-dessus pour afficher son contenu.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal : choisir le nom du document à la création */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleCloseCreateModal}>
          <div
            className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Nouveau document</h3>
            <p className="text-sm text-gray-500 mb-4">Choisissez le nom du document.</p>
            <input
              type="text"
              value={newDraftTitle}
              onChange={(e) => setNewDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateDraft();
                if (e.key === 'Escape') handleCloseCreateModal();
              }}
              placeholder="Ex : Contrat type, Note interne..."
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              autoFocus
            />
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Date d&apos;échéance (optionnel)</label>
              <input
                type="date"
                value={newDraftDueDate}
                onChange={(e) => setNewDraftDueDate(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={handleCloseCreateModal}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateDraft}
                className="px-3 py-1.5 text-sm font-medium text-white bg-orange-500 rounded-md hover:bg-orange-600"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Autorisations */}
      {showPermissionsModal && selectedDraft && (() => {
        const canManage = selectedDraft.canManagePermissions !== false;
        const creatorId = selectedDraft.createdBy
          ? (typeof selectedDraft.createdBy === 'object' && selectedDraft.createdBy !== null && '_id' in selectedDraft.createdBy
              ? (selectedDraft.createdBy as { _id: string })._id
              : String(selectedDraft.createdBy))
          : null;
        const adminUsersExcludingCreator = creatorId ? adminUsers.filter((u) => u._id !== creatorId) : adminUsers;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={handleClosePermissionsModal}>
          <div
            className="bg-white rounded-xl shadow-2xl border-2 border-orange-200 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Autorisations du document</h3>
            <p className="text-sm text-gray-500 mb-4">{selectedDraft.title || 'Sans titre'}</p>

            {!canManage && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Seul le créateur du document ou un administrateur peut modifier les autorisations. Vous pouvez consulter les réglages actuels ci-dessous.
              </div>
            )}

            {permissionsError && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {permissionsError}
              </div>
            )}

            <div className="space-y-5">
              <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
                <label className={`flex items-center gap-2 ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}>
                  <input
                    type="checkbox"
                    checked={permsVisibleToAdmins}
                    onChange={(e) => canManage && setPermsVisibleToAdmins(e.target.checked)}
                    disabled={!canManage}
                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-500 h-4 w-4"
                  />
                  <span className="text-sm font-medium text-gray-900">Visible par tous les administrateurs</span>
                </label>
              </div>

              {adminUsersExcludingCreator.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
                  <p className="text-sm font-semibold text-gray-800 mb-2">Exclure des accès (admins qui ne pourront pas voir/éditer) — le créateur du document conserve toujours l’accès</p>
                  <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto rounded border border-gray-200 p-2 bg-white">
                    {adminUsersExcludingCreator.map((u) => (
                      <label
                        key={u._id}
                        className={`inline-flex items-center gap-1.5 ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
                      >
                        <input
                          type="checkbox"
                          checked={permsExcludedAdminIds.includes(u._id)}
                          onChange={() => canManage && toggleExcludedAdmin(u._id)}
                          disabled={!canManage}
                          className="rounded border-gray-300 text-orange-500 focus:ring-orange-500 h-4 w-4"
                        />
                        <span className="text-xs text-gray-800">
                          {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u._id}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {currentUserIsAdmin ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
                  <p className="text-sm font-semibold text-gray-800 mb-2">Accès partenaires</p>
                  <div className="space-y-2 mb-2">
                    {permsPartnerAccess.map((pa) => (
                    <div
                      key={pa.partner}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2"
                    >
                      <span className="text-sm font-medium text-gray-900">{getPartnerLabel(pa.partner)}</span>
                      <div className="flex items-center gap-3">
                        <label className={`flex items-center gap-1.5 text-xs ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}>
                          <input
                            type="checkbox"
                            checked={pa.canEdit}
                            onChange={(e) => canManage && setPartnerCanEdit(pa.partner, e.target.checked)}
                            disabled={!canManage}
                            className="rounded border-gray-300 text-orange-500 focus:ring-orange-500 h-4 w-4"
                          />
                          Peut éditer
                        </label>
                        <button
                          type="button"
                          onClick={() => canManage && removePartnerAccess(pa.partner)}
                          disabled={!canManage}
                          className="text-red-600 hover:text-red-700 text-xs font-semibold disabled:opacity-50"
                        >
                          Retirer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {canManage && partnerOptions.length > 0 && (
                  <p className="text-xs text-gray-600 mb-1.5">Ajouter un partenaire :</p>
                )}
                {canManage && partnerOptions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {partnerOptions
                      .filter((p: any) => !permsPartnerAccess.some((pa) => pa.partner === p._id))
                      .map((p: any) => (
                        <button
                          key={p._id}
                          type="button"
                          onClick={() => addPartnerAccess(p._id)}
                          className="rounded-md border-2 border-orange-400 bg-orange-50 px-2.5 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-100"
                        >
                          + {[p.firstName, p.lastName].filter(Boolean).join(' ') || p._id}
                        </button>
                      ))}
                  </div>
                )}
                {partnerOptions.length === 0 && permsPartnerAccess.length === 0 && (
                  <p className="text-xs text-gray-500">Aucun partenaire disponible (transmis au dossier ou dans l’équipe).</p>
                )}
              </div>
                ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-100 p-3">
                  <p className="text-sm text-gray-600">
                    Seul un administrateur peut accorder des accès aux partenaires pour ce document.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleClosePermissionsModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Fermer
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={savingPermissions}
                  className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-md hover:bg-orange-600 disabled:opacity-50"
                >
                  {savingPermissions ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

