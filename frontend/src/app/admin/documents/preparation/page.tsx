'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { collaborativeDraftsAPI, dossierDocumentDraftsAPI, dossiersAPI } from '@/lib/api';
import { RichTextEditor } from '@/components/RichTextEditor';
import { ChevronDown, FolderOpen, Plus, Search } from 'lucide-react';

const STAFF_ROLES = ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'] as const;

function isStaffRole(role: string | undefined) {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

export type UnifiedPreparationRow = {
  kind: 'word' | 'collab';
  _id: string;
  title: string;
  updatedAt?: string;
  dueDate?: string | null;
  completedAt?: string | null;
  dossier?: { _id?: string; numero?: string; titre?: string };
  clientName?: string;
};

function formatEcheance(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isEcheanceDepassee(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const base =
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variants: Record<string, string> = {
    default: 'bg-primary text-white hover:bg-primary/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-red-500 text-white hover:bg-red-600',
  };
  return (
    <button type="button" className={`${base} h-10 px-4 ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Input({ className = '', ...props }: any) {
  return (
    <input
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
      {...props}
    />
  );
}

function Label({ htmlFor, children, className = '' }: any) {
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium leading-none ${className}`}>
      {children}
    </label>
  );
}

function PreparationActionsMenu({
  rowKey,
  openMenuKey,
  setOpenMenuKey,
  children,
}: {
  rowKey: string;
  openMenuKey: string | null;
  setOpenMenuKey: (k: string | null) => void;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isOpen = openMenuKey === rowKey;
  useEffect(() => {
    if (!isOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenMenuKey(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOpen, rowKey, setOpenMenuKey]);
  return (
    <div className="relative inline-flex justify-end" ref={rootRef}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        onClick={(e) => {
          e.stopPropagation();
          setOpenMenuKey(isOpen ? null : rowKey);
        }}
      >
        Actions
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen ? (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[12rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg" role="menu">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function mergeAndSort(wordDrafts: any[], collabDrafts: any[]): UnifiedPreparationRow[] {
  const wordRows: UnifiedPreparationRow[] = (wordDrafts || []).map((d) => ({
    kind: 'word',
    _id: String(d._id),
    title: d.title || 'Sans titre',
    updatedAt: d.updatedAt,
    dueDate: d.dueDate ? new Date(d.dueDate).toISOString() : null,
    completedAt: d.completedAt ? new Date(d.completedAt).toISOString() : null,
    dossier: d.dossier,
    clientName: d.clientName,
  }));
  const collabRows: UnifiedPreparationRow[] = (collabDrafts || []).map((d) => ({
    kind: 'collab',
    _id: String(d._id),
    title: d.title || 'Sans titre',
    updatedAt: d.updatedAt,
    dueDate: d.dueDate ? new Date(d.dueDate).toISOString() : null,
    completedAt: d.completedAt ? new Date(d.completedAt).toISOString() : null,
    dossier: d.dossier,
    clientName: d.clientName,
  }));
  return [...wordRows, ...collabRows].sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });
}

export default function AdminDocumentsPreparationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<UnifiedPreparationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collabWarning, setCollabWarning] = useState<string | null>(null);
  const [inputQ, setInputQ] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDossierId, setCreateDossierId] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createBody, setCreateBody] = useState('');
  const [createDueDate, setCreateDueDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  const paramsQ = useMemo(() => (filterQ.trim() ? { q: filterQ.trim() } : undefined), [filterQ]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCollabWarning(null);
    try {
      const settled = await Promise.allSettled([
        dossierDocumentDraftsAPI.list(paramsQ),
        collaborativeDraftsAPI.getGlobalList(paramsQ),
      ]);
      let wordList: any[] = [];
      let collabList: any[] = [];
      const w0 = settled[0];
      if (w0.status === 'fulfilled' && w0.value.data?.success) {
        wordList = w0.value.data.drafts || [];
      } else if (w0.status === 'fulfilled') {
        setError('Impossible de charger les brouillons Word.');
      } else {
        setError('Impossible de charger les brouillons Word.');
      }
      const c0 = settled[1];
      if (c0.status === 'fulfilled' && c0.value.data?.success) {
        collabList = c0.value.data.drafts || [];
      } else if (c0.status === 'fulfilled') {
        setCollabWarning('Les documents « éditeur riche » n’ont pas pu être chargés.');
      } else {
        setCollabWarning('Les documents « éditeur riche » n’ont pas pu être chargés.');
      }
      setRows(mergeAndSort(wordList, collabList));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Erreur lors du chargement.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [paramsQ]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status !== 'authenticated' || !session) return;
    const role = (session.user as any)?.role;
    if (!isStaffRole(role)) {
      router.push('/client');
      return;
    }
    const token = (session.user as any)?.accessToken;
    if (token && typeof window !== 'undefined' && !localStorage.getItem('token')) {
      localStorage.setItem('token', token);
    }
    loadAll();
  }, [session, status, router, loadAll]);

  useEffect(() => {
    const d = searchParams.get('dossierId');
    if (d) {
      setCreateDossierId(d);
      setCreateOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (status !== 'authenticated' || !session || !isStaffRole((session.user as any)?.role)) return;
    (async () => {
      try {
        const res = await dossiersAPI.getAllDossiers();
        if (res.data?.success) setDossiers(res.data.dossiers || []);
      } catch {
        setDossiers([]);
      }
    })();
  }, [session, status]);

  const handleCreate = async () => {
    if (!createDossierId || !createTitle.trim()) return;
    setCreating(true);
    try {
      const res = await dossierDocumentDraftsAPI.create({
        dossierId: createDossierId,
        title: createTitle.trim(),
        body: createBody,
        ...(createDueDate.trim() ? { dueDate: createDueDate.trim() } : {}),
      });
      if (res.data?.success && res.data.draft?._id) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dossierDocumentDraftsUpdated'));
        }
        router.push(`/admin/documents/preparation/${res.data.draft._id}`);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Création impossible.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteWord = async (id: string) => {
    if (!confirm('Supprimer ce brouillon ?')) return;
    try {
      await dossierDocumentDraftsAPI.remove(id);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dossierDocumentDraftsUpdated'));
      }
      setOpenMenuKey(null);
      loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Suppression impossible.');
    }
  };

  const handleDownloadWord = async (id: string, title: string) => {
    try {
      const res = await dossierDocumentDraftsAPI.downloadDocx(id);
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[<>:"/\\|?*]+/g, '').slice(0, 80) || 'document'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      setOpenMenuKey(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Téléchargement impossible.');
    }
  };

  const handleDeleteCollab = async (id: string) => {
    if (!confirm('Archiver ce brouillon ? Il disparaîtra des listes actives.')) return;
    try {
      await collaborativeDraftsAPI.archiveDraft(id);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('collaborativeDraftsUpdated'));
      }
      setOpenMenuKey(null);
      loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Archivage impossible.');
    }
  };

  const handleSetCompleted = async (row: UnifiedPreparationRow, completed: boolean) => {
    try {
      if (row.kind === 'word') {
        await dossierDocumentDraftsAPI.update(row._id, { completed });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dossierDocumentDraftsUpdated'));
        }
      } else {
        await collaborativeDraftsAPI.updateDraft(row._id, { completed });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('collaborativeDraftsUpdated'));
        }
      }
      setOpenMenuKey(null);
      loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Mise à jour du statut impossible.');
    }
  };

  const menuItemClass =
    'block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none';

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents en préparation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tous les brouillons utilisent l&apos;éditeur riche. Export Word (.docx) disponible pour les documents du
            cabinet.
          </p>
        </div>
        <Button variant="outline" onClick={() => setCreateOpen((v) => !v)} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Nouveau document
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div>
      )}
      {collabWarning && !error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3">{collabWarning}</div>
      )}

      {createOpen && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-900">Nouveau document</h2>
          <p className="text-xs text-muted-foreground">
            Rédaction au format riche ; vous pourrez exporter en .docx après enregistrement.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="dossier">Dossier</Label>
              <select
                id="dossier"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={createDossierId}
                onChange={(e) => setCreateDossierId(e.target.value)}
              >
                <option value="">— Choisir un dossier —</option>
                {dossiers.map((d: any) => {
                  const id = (d._id || d.id)?.toString();
                  const label = [d.numero, d.titre].filter(Boolean).join(' — ') || id;
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="title">Titre du document</Label>
              <Input id="title" value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="Ex. Courrier préfecture" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Contenu (éditeur riche)</Label>
              <RichTextEditor
                value={createBody}
                onChange={setCreateBody}
                placeholder="Rédigez le document…"
                className="w-full max-h-[min(50vh,480px)]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due">Date d&apos;échéance (optionnel)</Label>
              <Input id="due" type="date" value={createDueDate} onChange={(e) => setCreateDueDate(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={creating || !createDossierId || !createTitle.trim()}>
              {creating ? 'Création…' : 'Créer et ouvrir'}
            </Button>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Fermer
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Rechercher par titre…"
            value={inputQ}
            onChange={(e) => setInputQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setFilterQ(inputQ);
              }
            }}
          />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setFilterQ(inputQ);
          }}
        >
          Rechercher
        </Button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">Chargement…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">Aucun document en préparation pour le moment.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left font-semibold text-gray-700 px-4 py-3">Document</th>
                  <th className="text-left font-semibold text-gray-700 px-4 py-3">Dossier</th>
                  <th className="text-left font-semibold text-gray-700 px-4 py-3">Client</th>
                  <th className="text-left font-semibold text-gray-700 px-4 py-3 whitespace-nowrap">Échéance</th>
                  <th className="text-left font-semibold text-gray-700 px-4 py-3 whitespace-nowrap">Mise à jour</th>
                  <th className="text-right font-semibold text-gray-700 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const dossierId = row.dossier?._id?.toString();
                  const updated = row.updatedAt ? new Date(row.updatedAt).toLocaleString('fr-FR') : '—';
                  const completed = Boolean(row.completedAt);
                  const overdue = isEcheanceDepassee(row.dueDate) && !completed;
                  const collabEditHref =
                    dossierId &&
                    `/admin/dossiers/${dossierId}/documents-en-preparation?draft=${encodeURIComponent(row._id)}`;
                  const rowMenuKey = `${row.kind}-${row._id}`;
                  return (
                    <tr key={rowMenuKey} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="px-4 py-3 max-w-[240px]">
                        <div className="font-medium text-gray-900 truncate" title={row.title}>
                          {row.title}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {completed ? (
                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                              Terminé
                            </span>
                          ) : null}
                          {overdue ? (
                            <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-800 border border-red-200">
                              Échéance dépassée
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {dossierId ? (
                          <Link
                            href={`/admin/dossiers/${dossierId}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <FolderOpen className="w-4 h-4 shrink-0" />
                            <span className="truncate max-w-[180px]">{row.dossier?.numero || dossierId}</span>
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">{row.clientName || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.dueDate ? (
                          <span className={overdue ? 'text-red-700 font-medium' : 'text-gray-700'}>
                            {formatEcheance(row.dueDate)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{updated}</td>
                      <td className="px-4 py-3 text-right align-top">
                        <PreparationActionsMenu
                          rowKey={rowMenuKey}
                          openMenuKey={openMenuKey}
                          setOpenMenuKey={setOpenMenuKey}
                        >
                          {row.kind === 'word' ? (
                            <>
                              <Link
                                href={`/admin/documents/preparation/${row._id}`}
                                className={`${menuItemClass} text-primary font-medium`}
                                onClick={() => setOpenMenuKey(null)}
                              >
                                Éditer
                              </Link>
                              <button
                                type="button"
                                role="menuitem"
                                className={menuItemClass}
                                onClick={() => handleDownloadWord(row._id, row.title)}
                              >
                                Télécharger (.docx)
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className={`${menuItemClass} text-red-700`}
                                onClick={() => handleDeleteWord(row._id)}
                              >
                                Supprimer
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className={menuItemClass}
                                onClick={() => handleSetCompleted(row, !completed)}
                              >
                                {completed ? 'Rouvrir (non terminé)' : 'Marquer terminé'}
                              </button>
                            </>
                          ) : collabEditHref ? (
                            <>
                              <Link
                                href={collabEditHref}
                                className={`${menuItemClass} text-primary font-medium`}
                                onClick={() => setOpenMenuKey(null)}
                              >
                                Éditer
                              </Link>
                              <button
                                type="button"
                                role="menuitem"
                                className={menuItemClass}
                                disabled
                                title="Export .docx réservé aux documents du cabinet"
                              >
                                Télécharger (.docx)
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className={`${menuItemClass} text-red-700`}
                                onClick={() => handleDeleteCollab(row._id)}
                              >
                                Supprimer
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className={menuItemClass}
                                onClick={() => handleSetCompleted(row, !completed)}
                              >
                                {completed ? 'Rouvrir (non terminé)' : 'Marquer terminé'}
                              </button>
                            </>
                          ) : (
                            <span className="block px-3 py-2 text-xs text-muted-foreground">Lien dossier manquant</span>
                          )}
                        </PreparationActionsMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
