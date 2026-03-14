"use client";

import { useEffect, useState } from 'react';
import { collaborativeDraftsAPI } from '@/lib/api';
import { RichTextEditor } from './RichTextEditor';

type DossierDraftsPanelProps = {
  dossierId: string;
};

type Draft = {
  _id: string;
  title: string;
  content: any;
  createdBy?: { firstName?: string; lastName?: string; role?: string };
  updatedAt?: string;
  canEdit?: boolean;
};

export function DossierDraftsPanel({ dossierId }: DossierDraftsPanelProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTitle, setCurrentTitle] = useState('');
  const [currentContent, setCurrentContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          if (list.length > 0) {
            const first = list[0];
            setSelectedId(first._id);
            setCurrentTitle(first.title || '');
            setCurrentContent(typeof first.content === 'string' ? first.content : first.content || '');
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
  }, [dossierId]);

  useEffect(() => {
    if (!selectedDraft) return;

    const handler = setTimeout(async () => {
      try {
        setIsSaving(true);
        await collaborativeDraftsAPI.updateDraft(selectedDraft._id, {
          title: currentTitle,
          content: currentContent,
        });

        setDrafts((prev) =>
          prev.map((d) =>
            d._id === selectedDraft._id
              ? {
                  ...d,
                  title: currentTitle,
                  content: currentContent,
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
      } catch (e) {
        console.error('Erreur lors de la sauvegarde du brouillon:', e);
      } finally {
        setIsSaving(false);
      }
    }, 1500);

    return () => clearTimeout(handler);
  }, [currentTitle, currentContent, selectedDraft?._id]);

  const handleSelectDraft = (draft: Draft) => {
    setSelectedId(draft._id);
    setCurrentTitle(draft.title || '');
    setCurrentContent(typeof draft.content === 'string' ? draft.content : draft.content || '');
    setLastSavedAt(null);
  };

  const handleCreateDraft = async () => {
    try {
      const baseTitle = 'Nouveau document';
      const existingCount = drafts.length;
      const title = existingCount === 0 ? baseTitle : `${baseTitle} ${existingCount + 1}`;

      const response = await collaborativeDraftsAPI.createDraft(dossierId, {
        title,
        content: '',
      });

      if (response.data.success) {
        const newDraft: Draft = response.data.draft;
        setDrafts((prev) => [newDraft, ...prev]);
        setSelectedId(newDraft._id);
        setCurrentTitle(newDraft.title || '');
        setCurrentContent('');
        setLastSavedAt(null);
      }
    } catch (e: any) {
      console.error('Erreur lors de la création du brouillon:', e);
      alert(e.response?.data?.message || 'Erreur lors de la création du document en préparation.');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">📝 Documents en préparation</h2>
          <p className="text-xs text-gray-500">
            Zone de travail interne pour les admins et partenaires. Non visible par le client.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateDraft}
          className="inline-flex items-center rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-orange-600"
        >
          + Nouveau document
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-sm text-gray-500">Chargement des documents en préparation...</div>
      ) : drafts.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-500">
          Aucun document en préparation pour ce dossier. Créez un premier document pour commencer.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 items-start">
          <div className="space-y-2.5">
            {drafts.map((draft) => {
              const authorName = draft.createdBy
                ? `${draft.createdBy.firstName || ''} ${draft.createdBy.lastName || ''}`.trim()
                : '';
              const label = authorName || (draft.createdBy?.role ? draft.createdBy.role : 'Auteur');

              return (
                <button
                  key={draft._id}
                  type="button"
                  onClick={() => handleSelectDraft(draft)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-xs transition-colors ${
                    selectedId === draft._id
                      ? 'bg-orange-50 border border-orange-300 shadow-sm'
                      : 'bg-gray-50/60 border border-gray-200 hover:bg-white'
                  }`}
                >
                  <div className="font-semibold text-gray-900 line-clamp-1">{draft.title || 'Sans titre'}</div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-gray-500">
                    <span className="truncate max-w-[60%]">{label}</span>
                    {draft.updatedAt && (
                      <span>
                        Modifié le{' '}
                        {new Date(draft.updatedAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            {selectedDraft ? (
              <>
                <input
                  type="text"
                  value={currentTitle}
                  onChange={(e) => setCurrentTitle(e.target.value)}
                  disabled={!selectedDraft.canEdit}
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="Titre du document"
                />
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>
                    {selectedDraft.canEdit
                      ? 'Les modifications sont enregistrées automatiquement.'
                      : 'Lecture seule - vous ne pouvez pas modifier ce document.'}
                  </span>
                  <span>
                    {isSaving
                      ? 'Enregistrement...'
                      : lastSavedAt
                      ? `Enregistré à ${lastSavedAt}`
                      : selectedDraft.updatedAt
                      ? `Dernière sauvegarde: ${new Date(selectedDraft.updatedAt).toLocaleTimeString('fr-FR', {
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
                  }}
                  placeholder="Saisissez ici le contenu du document (brouillon interne)..."
                  className="mt-1"
                />
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 bg-white/60 p-4 text-xs text-gray-500">
                Sélectionnez un document à gauche pour afficher son contenu.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

