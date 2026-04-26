'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { cmsAPI } from '@/lib/api';

type CmsEntry = {
  _id: string;
  key: string;
  value: string;
  locale: string;
  page?: string;
  section?: string;
  description?: string;
  version: number;
  status?: 'draft' | 'published' | 'archived';
  isActive?: boolean;
  updatedAt: string;
  updatedBy?: {
    _id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  changeHistory?: Array<{
    version: number;
    value: string;
    description?: string;
    status: string;
    updatedBy?: {
      _id: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    };
    updatedAt: string;
    changeType: string;
  }>;
};

export default function AdminCmsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [entries, setEntries] = useState<CmsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [pageFilter, setPageFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [editingEntry, setEditingEntry] = useState<CmsEntry | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<'draft' | 'published' | 'archived'>('draft');
  const [isSaving, setIsSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newPage, setNewPage] = useState('');
  const [newSection, setNewSection] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<CmsEntry | null>(null);
  const [historyEntry, setHistoryEntry] = useState<CmsEntry | null>(null);

  // Sécuriser l'accès : uniquement admin / superadmin
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
    loadEntries();
  }, [status, session]);

  const loadEntries = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {
        locale: 'fr-FR',
        limit: 200,
      };
      if (search) params.search = search;
      if (pageFilter) params.page = pageFilter;
      if (sectionFilter) params.section = sectionFilter;
      if (statusFilter) params.status = statusFilter;

      const res = await cmsAPI.listEntries(params);
      setEntries(res.data.entries || []);
    } catch (e: any) {
      console.error('Erreur chargement CMS:', e);
      setError(e?.response?.data?.message || 'Erreur lors du chargement des contenus');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (entry: CmsEntry) => {
    setEditingEntry(entry);
    setEditValue(entry.value);
    setEditDescription(entry.description || '');
    setEditStatus(entry.status || 'draft');
  };

  const cancelEdit = () => {
    setEditingEntry(null);
    setEditValue('');
    setEditDescription('');
    setEditStatus('draft');
  };

  const saveEdit = async () => {
    if (!editingEntry) return;
    try {
      setIsSaving(true);
      setError(null);
      await cmsAPI.updateEntry(editingEntry._id, {
        value: editValue,
        description: editDescription,
        page: editingEntry.page,
        section: editingEntry.section,
        status: editStatus,
      });
      await loadEntries();
      cancelEdit();
    } catch (e: any) {
      console.error('Erreur mise à jour CMS:', e);
      setError(e?.response?.data?.message || 'Erreur lors de la mise à jour');
    } finally {
      setIsSaving(false);
    }
  };

  const createEntry = async () => {
    if (!newKey.trim() || !newValue.trim()) {
      setError('La clé et la valeur sont obligatoires');
      return;
    }
    try {
      setCreating(true);
      setError(null);
      await cmsAPI.createEntry({
        key: newKey.trim(),
        value: newValue,
        page: newPage || undefined,
        section: newSection || undefined,
        description: newDescription || undefined,
      });
      setNewKey('');
      setNewValue('');
      setNewPage('');
      setNewSection('');
      setNewDescription('');
      await loadEntries();
    } catch (e: any) {
      console.error('Erreur création CMS:', e);
      setError(e?.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  const distinctPages = Array.from(
    new Set(entries.map((e) => e.page).filter((p): p is string => !!p))
  ).sort();

  const distinctSections = Array.from(
    new Set(entries.map((e) => e.section).filter((s): s is string => !!s))
  ).sort();

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              CMS de contenu
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Gérez les textes affichés sur le site (par page, section et clé).
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Filtres */}
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Recherche
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Clé, texte, description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={loadEntries}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  loadEntries();
                }
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Page
            </label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={pageFilter}
              onChange={(e) => {
                setPageFilter(e.target.value);
                setTimeout(loadEntries, 0);
              }}
            >
              <option value="">Toutes</option>
              {distinctPages.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Section
            </label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={sectionFilter}
              onChange={(e) => {
                setSectionFilter(e.target.value);
                setTimeout(loadEntries, 0);
              }}
            >
              <option value="">Toutes</option>
              {distinctSections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end justify-end">
            <button
              type="button"
              onClick={loadEntries}
              disabled={loading}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Chargement...' : 'Actualiser'}
            </button>
          </div>
        </div>

        {/* Création rapide */}
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-800">
            Ajouter un nouveau texte
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            Utilisez des clés structurées (ex : <code>home.hero.title</code>).
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <input
                type="text"
                placeholder="Clé (ex : home.hero.title)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              />
            </div>
            <div>
              <input
                type="text"
                placeholder="Page (ex : home)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={newPage}
                onChange={(e) => setNewPage(e.target.value)}
              />
            </div>
            <div>
              <input
                type="text"
                placeholder="Section (ex : hero)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-3">
              <textarea
                placeholder="Texte"
                className="h-16 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              />
            </div>
            <div>
              <textarea
                placeholder="Description (optionnelle)"
                className="h-16 w-full rounded-md border border-gray-300 px-3 py-2 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={createEntry}
              disabled={creating}
              className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {creating ? 'Enregistrement...' : 'Ajouter'}
            </button>
          </div>
        </div>

        {/* Tableau des entrées */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Clé
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Texte
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Page / Section
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Statut
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Version
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Modifié par
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {entries.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-sm text-gray-500"
                  >
                    {loading
                      ? 'Chargement des contenus...'
                      : 'Aucun contenu CMS pour le moment.'}
                  </td>
                </tr>
              )}

              {entries.map((entry) => {
                const isEditing = editingEntry?._id === entry._id;
                return (
                  <tr key={entry._id}>
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                      {entry.key}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      {isEditing ? (
                        <textarea
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                          rows={3}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        />
                      ) : (
                        <div className="line-clamp-3 whitespace-pre-line">
                          {entry.value}
                        </div>
                      )}
                      {isEditing && (
                        <>
                          <textarea
                            className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                            rows={2}
                            placeholder="Description interne (optionnelle)"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                          />
                          <select
                            className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value as 'draft' | 'published' | 'archived')}
                          >
                            <option value="draft">Brouillon</option>
                            <option value="published">Publié</option>
                            <option value="archived">Archivé</option>
                          </select>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <div>{entry.page || '-'}</div>
                      <div className="text-[11px] text-gray-400">
                        {entry.section || ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {(() => {
                        const status = entry.status || 'draft';
                        const statusColors = {
                          draft: 'bg-yellow-100 text-yellow-800',
                          published: 'bg-green-100 text-green-800',
                          archived: 'bg-gray-100 text-gray-800',
                        };
                        const statusLabels = {
                          draft: 'Brouillon',
                          published: 'Publié',
                          archived: 'Archivé',
                        };
                        return (
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusColors[status]}`}>
                            {statusLabels[status]}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      v{entry.version}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {entry.updatedBy 
                        ? `${entry.updatedBy.firstName || ''} ${entry.updatedBy.lastName || ''}`.trim() || entry.updatedBy.email
                        : '-'}
                      <div className="text-[10px] text-gray-400 mt-1">
                        {new Date(entry.updatedAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {isEditing ? (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={isSaving}
                            className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 items-end">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(entry)}
                              className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreviewEntry(entry)}
                              className="rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200"
                            >
                              Prévisualiser
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const response = await cmsAPI.getEntryHistory(entry._id);
                                  if (response.data.success) {
                                    setHistoryEntry({ ...entry, changeHistory: response.data.history });
                                  }
                                } catch (e: any) {
                                  console.error('Erreur chargement historique:', e);
                                  setError('Erreur lors du chargement de l\'historique');
                                }
                              }}
                              className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                            >
                              Historique
                            </button>
                          </div>
                          <div className="flex gap-1 mt-1">
                            {entry.status === 'published' ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await cmsAPI.unpublishEntry(entry._id);
                                    await loadEntries();
                                  } catch (e: any) {
                                    console.error('Erreur dépublication:', e);
                                    setError(e?.response?.data?.message || 'Erreur lors de la dépublication');
                                  }
                                }}
                                className="rounded-md bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200"
                              >
                                Dépublier
                              </button>
                            ) : entry.status === 'draft' ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await cmsAPI.publishEntry(entry._id);
                                    await loadEntries();
                                  } catch (e: any) {
                                    console.error('Erreur publication:', e);
                                    setError(e?.response?.data?.message || 'Erreur lors de la publication');
                                  }
                                }}
                                className="rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200"
                              >
                                Publier
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={async () => {
                                if (confirm('Êtes-vous sûr de vouloir archiver ce contenu ?')) {
                                  try {
                                    await cmsAPI.deleteEntry(entry._id);
                                    await loadEntries();
                                  } catch (e: any) {
                                    console.error('Erreur archivage:', e);
                                    setError(e?.response?.data?.message || 'Erreur lors de l\'archivage');
                                  }
                                }
                              }}
                              className="rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
                            >
                              Archiver
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Modal de prévisualisation */}
        {previewEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Prévisualisation du contenu</h2>
                <button
                  onClick={() => setPreviewEntry(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Clé</p>
                  <p className="text-sm font-mono text-gray-900">{previewEntry.key}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Page / Section</p>
                  <p className="text-sm text-gray-900">
                    {previewEntry.page || '-'} / {previewEntry.section || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Statut</p>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    previewEntry.status === 'published' ? 'bg-green-100 text-green-800' :
                    previewEntry.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {previewEntry.status === 'published' ? 'Publié' :
                     previewEntry.status === 'draft' ? 'Brouillon' : 'Archivé'}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Contenu</p>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p className="text-base text-gray-900 whitespace-pre-wrap">{previewEntry.value}</p>
                  </div>
                </div>
                {previewEntry.description && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
                    <p className="text-sm text-gray-600">{previewEntry.description}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal d'historique */}
        {historyEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Historique des modifications</h2>
                <button
                  onClick={() => setHistoryEntry(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              <div className="p-6">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Clé: <span className="font-mono">{historyEntry.key}</span></p>
                </div>
                {historyEntry.changeHistory && historyEntry.changeHistory.length > 0 ? (
                  <div className="space-y-4">
                    {historyEntry.changeHistory
                      .slice()
                      .reverse()
                      .map((change, index) => (
                        <div key={index} className="border-l-4 border-blue-500 pl-4 py-2 bg-gray-50 rounded-r-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-500">
                                Version {change.version}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                change.changeType === 'created' ? 'bg-green-100 text-green-800' :
                                change.changeType === 'published' ? 'bg-blue-100 text-blue-800' :
                                change.changeType === 'archived' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {change.changeType === 'created' ? 'Créé' :
                                 change.changeType === 'published' ? 'Publié' :
                                 change.changeType === 'archived' ? 'Archivé' :
                                 'Modifié'}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {new Date(change.updatedAt).toLocaleString('fr-FR')}
                            </span>
                          </div>
                          {change.updatedBy && (
                            <p className="text-xs text-gray-600 mb-2">
                              Par: {change.updatedBy.firstName || ''} {change.updatedBy.lastName || ''} ({change.updatedBy.email || 'N/A'})
                            </p>
                          )}
                          <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white p-2 rounded border border-gray-200">
                            {change.value}
                          </div>
                          {change.description && (
                            <p className="text-xs text-gray-500 mt-1 italic">{change.description}</p>
                          )}
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-8">Aucun historique disponible</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}



