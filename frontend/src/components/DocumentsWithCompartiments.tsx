'use client';

import { useState, useEffect } from 'react';
import { documentsAPI } from '@/lib/api';

interface Compartiment {
  _id: string;
  nom: string;
  ordre: number;
}

interface DocumentsWithCompartimentsProps {
  dossierId: string;
  variant: 'admin' | 'partenaire';
  documents: any[];
  isLoading: boolean;
  targetDocId?: string | null;
  onPreviewDocument: (doc: any) => void;
  onDocumentsChanged?: () => void;
}

function Btn({ children, variant = 'default', className = '', disabled, ...props }: any) {
  const base = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const v: Record<string, string> = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm font-semibold',
    outline: 'border border-input bg-background hover:bg-accent',
  };
  return (
    <button className={`${base} ${v[variant] || v.outline} ${className}`} disabled={disabled} {...props}>
      {children}
    </button>
  );
}

export function DocumentsWithCompartiments({
  dossierId,
  variant,
  documents,
  isLoading,
  targetDocId,
  onPreviewDocument,
  onDocumentsChanged,
}: DocumentsWithCompartimentsProps) {
  const isAdmin = variant === 'admin' || variant === 'partenaire';

  const [compartiments, setCompartiments] = useState<Compartiment[]>([]);
  const [loadingCompartiments, setLoadingCompartiments] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [movingDocId, setMovingDocId] = useState<string | null>(null);
  const [isExportingZip, setIsExportingZip] = useState(false);

  const loadCompartiments = async () => {
    setLoadingCompartiments(true);
    try {
      const res = await documentsAPI.getCompartimentsByDossier(dossierId);
      if (res.data.success) setCompartiments(res.data.compartiments || []);
    } catch (e) {
      console.error('Erreur chargement compartiments:', e);
    } finally {
      setLoadingCompartiments(false);
    }
  };

  useEffect(() => {
    if (dossierId) loadCompartiments();
  }, [dossierId]);

  useEffect(() => {
    if (!targetDocId || isLoading || documents.length === 0) return;
    const t = window.setTimeout(() => {
      document.getElementById(`doc-${targetDocId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
    return () => window.clearTimeout(t);
  }, [targetDocId, isLoading, documents]);

  const handleCreate = async () => {
    const nom = newName.trim();
    if (!nom) return;
    setCreating(true);
    try {
      await documentsAPI.createCompartiment({ dossierId, nom });
      setNewName('');
      await loadCompartiments();
    } catch (e) {
      console.error('Erreur creation compartiment:', e);
      alert('Impossible de créer le compartiment');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    const nom = editingName.trim();
    if (!nom) return;
    setSavingRename(true);
    try {
      await documentsAPI.renameCompartiment(id, nom);
      setEditingId(null);
      setEditingName('');
      await loadCompartiments();
    } catch (e) {
      console.error('Erreur renommage:', e);
      alert('Impossible de renommer le compartiment');
    } finally {
      setSavingRename(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer ce compartiment ? Les documents seront déplacés dans "Non classés".')) return;
    setDeletingId(id);
    try {
      await documentsAPI.deleteCompartiment(id);
      await loadCompartiments();
      onDocumentsChanged?.();
    } catch (e) {
      console.error('Erreur suppression compartiment:', e);
      alert('Impossible de supprimer le compartiment');
    } finally {
      setDeletingId(null);
    }
  };

  const handleMove = async (docId: string, compartimentId: string) => {
    setMovingDocId(docId);
    try {
      await documentsAPI.moveDocumentToCompartiment(
        docId,
        compartimentId === '__none__' ? null : compartimentId
      );
      onDocumentsChanged?.();
    } catch (e) {
      console.error('Erreur deplacement:', e);
      alert('Impossible de déplacer le document');
    } finally {
      setMovingDocId(null);
    }
  };

  const handleExportZip = async () => {
    if (!documents || documents.length === 0) {
      alert('Aucun document à exporter.');
      return;
    }
    setIsExportingZip(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const doc of documents) {
        const docId = doc._id || doc.id;
        if (!docId) continue;
        try {
          const response = await documentsAPI.downloadDocument(docId);
          const { blobFromDownloadResponse, resolveFileNameFromDownloadResponse } = await import('@/lib/downloadFile');
          const blob = blobFromDownloadResponse(response);
          const fileName = resolveFileNameFromDownloadResponse(response, doc.nom || doc.originalName || 'document');
          zip.file(fileName, blob);
        } catch (err) {
          console.warn('Document ignoré dans le ZIP:', docId, err);
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = 'documents.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Erreur ZIP:', e);
      alert('Erreur lors de la génération du ZIP');
    } finally {
      setIsExportingZip(false);
    }
  };

  // Regrouper les documents par compartiment
  const grouped = (() => {
    const map = new Map<string, any[]>();
    map.set('__none__', []);
    for (const c of compartiments) map.set(c._id, []);
    for (const doc of documents) {
      const cId = (doc.compartiment?._id || doc.compartiment) as string | null;
      const key = cId && map.has(cId) ? cId : '__none__';
      map.get(key)!.push(doc);
    }
    return map;
  })();

  const renderDoc = (doc: any) => {
    const docId = doc._id || doc.id;
    const currentCId = (doc.compartiment?._id || doc.compartiment || '__none__') as string;
    const isHighlighted = targetDocId && String(docId) === String(targetDocId);
    const isMoving = movingDocId === docId;

    return (
      <div
        key={docId}
        id={`doc-${docId}`}
        className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border min-w-0 transition-colors ${
          isHighlighted
            ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300'
            : 'bg-gray-50 border-gray-200'
        }`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-base flex-shrink-0">📄</span>
          <p className="font-medium text-sm break-words">{doc.nom}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {isAdmin && (
            <select
              className="h-7 text-xs border border-gray-200 rounded px-1 bg-white max-w-[140px]"
              value={currentCId}
              disabled={isMoving}
              onChange={(e) => handleMove(docId, e.target.value)}
              title="Déplacer vers..."
            >
              <option value="__none__">Non classés</option>
              {compartiments.map((c) => (
                <option key={c._id} value={c._id}>{c.nom}</option>
              ))}
            </select>
          )}
          <Btn
            variant="outline"
            className="text-xs h-7 px-2"
            onClick={() => onPreviewDocument(doc)}
          >
            👁️ Voir
          </Btn>
          <Btn
            variant="outline"
            className="text-xs h-7 px-2"
            onClick={async () => {
              try {
                await documentsAPI.downloadAndSave(docId, doc.nom);
              } catch {
                alert('Erreur lors du téléchargement du document');
              }
            }}
          >
            ⬇️
          </Btn>
        </div>
      </div>
    );
  };

  const renderGroup = (id: string, nom: string, docs: any[]) => {
    const isNone = id === '__none__';
    const isEditing = editingId === id;
    const isDeleting = deletingId === id;

    return (
      <div key={id} className="mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-2 pb-1.5 border-b border-gray-100">
          <span>📂</span>
          {isEditing ? (
            <>
              <input
                className="h-7 text-sm border border-gray-300 rounded px-2 flex-1 max-w-xs"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(id);
                  if (e.key === 'Escape') { setEditingId(null); setEditingName(''); }
                }}
                autoFocus
              />
              <Btn className="h-7 text-xs px-2" onClick={() => handleRename(id)} disabled={savingRename}>
                {savingRename ? '...' : 'OK'}
              </Btn>
              <Btn variant="outline" className="h-7 text-xs px-2" onClick={() => { setEditingId(null); setEditingName(''); }}>
                Annuler
              </Btn>
            </>
          ) : (
            <>
              <span className="font-semibold text-sm text-gray-800">
                {nom}
                <span className="ml-1 text-gray-400 font-normal text-xs">({docs.length})</span>
              </span>
              {isAdmin && !isNone && (
                <>
                  <button
                    className="text-xs text-blue-600 hover:underline ml-1"
                    onClick={() => { setEditingId(id); setEditingName(nom); }}
                  >
                    ✏️ Renommer
                  </button>
                  <button
                    className="text-xs text-red-500 hover:underline"
                    disabled={isDeleting}
                    onClick={() => handleDelete(id)}
                  >
                    {isDeleting ? '...' : '🗑️'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
        <div className="space-y-1.5 pl-4">
          {docs.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Aucun document</p>
          ) : (
            docs.map(renderDoc)
          )}
        </div>
      </div>
    );
  };

  const hasContent = documents.length > 0;
  const showNone = hasContent && (grouped.get('__none__') || []).length > 0;

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold break-words">📁 Documents du dossier</h2>
        {isAdmin && (
          <Btn
            variant="outline"
            className="text-xs h-8 w-full sm:w-auto"
            onClick={handleExportZip}
            disabled={isLoading || isExportingZip || !hasContent}
          >
            {isExportingZip ? 'Préparation ZIP...' : '🗜️ Télécharger tout (ZIP)'}
          </Btn>
        )}
      </div>

      {isLoading || loadingCompartiments ? (
        <p className="text-sm text-muted-foreground">Chargement...</p>
      ) : !hasContent ? (
        <p className="text-sm text-muted-foreground">Aucun document</p>
      ) : (
        <>
          {compartiments.map((c) => renderGroup(c._id, c.nom, grouped.get(c._id) || []))}
          {(showNone || compartiments.length === 0) && renderGroup('__none__', 'Non classés', grouped.get('__none__') || [])}
        </>
      )}

      {isAdmin && (
        <div className={`mt-4 pt-4 border-t border-gray-100 ${!hasContent && compartiments.length === 0 ? 'mt-0 pt-0 border-0' : ''}`}>
          <p className="text-xs font-semibold text-gray-500 mb-2">Nouveau compartiment</p>
          <div className="flex gap-2">
            <input
              className="flex-1 h-8 text-sm border border-gray-300 rounded px-2 min-w-0"
              placeholder="Nom du compartiment..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
            <Btn
              className="h-8 text-xs px-3 shrink-0"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? '...' : '+ Créer'}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
