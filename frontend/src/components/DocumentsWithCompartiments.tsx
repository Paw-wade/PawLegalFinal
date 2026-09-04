'use client';

import { useState, useEffect, useRef } from 'react';
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
  const [deletingConfirmId, setDeletingConfirmId] = useState<string | null>(null);
  const [movingDocId, setMovingDocId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ compId: string | null; done: number; total: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);

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
      alert('Impossible de creer le compartiment');
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

  const handleDeleteCompartiment = async (id: string, withDocuments: boolean) => {
    setDeletingId(id);
    setDeletingConfirmId(null);
    try {
      await documentsAPI.deleteCompartiment(id, withDocuments);
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
      alert('Impossible de deplacer le document');
    } finally {
      setMovingDocId(null);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!window.confirm('Supprimer definitivement ce document ?')) return;
    setDeletingDocId(docId);
    try {
      await documentsAPI.deleteDocument(docId);
      onDocumentsChanged?.();
    } catch (e) {
      console.error('Erreur suppression document:', e);
      alert('Impossible de supprimer le document');
    } finally {
      setDeletingDocId(null);
    }
  };

  const triggerUpload = (compId: string | null) => {
    uploadTargetRef.current = compId;
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const targetComp = uploadTargetRef.current;
    setUploadProgress({ compId: targetComp, done: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      const fd = new FormData();
      fd.append('document', files[i] as File);
      fd.append('dossierId', dossierId);
      if (targetComp && targetComp !== '__none__') {
        fd.append('compartiment', targetComp);
      }
      try {
        await documentsAPI.uploadDocument(fd);
      } catch (err) {
        console.error('Erreur upload:', err);
      }
      setUploadProgress({ compId: targetComp, done: i + 1, total: files.length });
    }
    setUploadProgress(null);
    onDocumentsChanged?.();
  };

  const handleExportZip = async () => {
    if (!documents || documents.length === 0) {
      alert('Aucun document a exporter.');
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
          console.warn('Document ignore dans le ZIP:', docId, err);
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
      alert('Erreur lors de la generation du ZIP');
    } finally {
      setIsExportingZip(false);
    }
  };

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
    const isDelDoc = deletingDocId === docId;

    return (
      <div
        key={docId}
        id={`doc-${docId}`}
        className={`flex items-center gap-2 py-1.5 min-w-0 border-b border-gray-100 last:border-0 transition-colors ${
          isHighlighted ? 'bg-amber-50 -mx-1 px-1 rounded' : ''
        }`}
      >
        <p
          className="text-sm flex-1 min-w-0 truncate text-gray-800 cursor-default"
          title={doc.nom}
        >
          {doc.nom}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {isAdmin && (
            <select
              className="h-6 text-xs border border-gray-200 rounded px-1 bg-white w-[90px]"
              value={currentCId}
              disabled={isMoving}
              onChange={(e) => handleMove(docId, e.target.value)}
              title="Deplacer vers..."
            >
              <option value="__none__">Non classes</option>
              {compartiments.map((c) => (
                <option key={c._id} value={c._id}>{c.nom}</option>
              ))}
            </select>
          )}
          <button
            className="text-xs h-6 px-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 shrink-0"
            onClick={() => onPreviewDocument(doc)}
          >
            Voir
          </button>
          <button
            className="text-xs h-6 px-1.5 text-gray-500 hover:text-gray-700 shrink-0"
            onClick={async () => {
              try { await documentsAPI.downloadAndSave(docId, doc.nom); }
              catch { alert('Erreur telechargement'); }
            }}
            title="Telecharger"
          >
            ⬇️
          </button>
          {isAdmin && (
            <button
              className="text-xs h-6 px-1 text-red-400 hover:text-red-600 disabled:opacity-40 shrink-0"
              disabled={isDelDoc}
              onClick={() => handleDeleteDoc(docId)}
              title="Supprimer"
            >
              {isDelDoc ? '...' : '🗑️'}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderGroup = (id: string, nom: string, docs: any[]) => {
    const isNone = id === '__none__';
    const isEditing = editingId === id;
    const isDeleting = deletingId === id;
    const isConfirming = deletingConfirmId === id;
    const isUploading = uploadProgress !== null && uploadProgress.compId === id;

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
          ) : isConfirming ? (
            <>
              <span className="text-xs text-gray-600 font-medium">Supprimer "{nom}" :</span>
              <button
                className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-300 disabled:opacity-40"
                disabled={isDeleting}
                onClick={() => handleDeleteCompartiment(id, false)}
              >
                Deplacer vers Non classes
              </button>
              <button
                className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 border border-red-300 disabled:opacity-40"
                disabled={isDeleting}
                onClick={() => handleDeleteCompartiment(id, true)}
              >
                Supprimer les documents
              </button>
              <button
                className="text-xs px-2 py-1 rounded text-gray-500 hover:text-gray-700"
                onClick={() => setDeletingConfirmId(null)}
              >
                Annuler
              </button>
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
                    onClick={() => setDeletingConfirmId(id)}
                  >
                    {isDeleting ? '...' : '🗑️'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
        <div className="pl-2">
          {docs.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-1">Aucun document</p>
          ) : (
            docs.map(renderDoc)
          )}
        </div>
        {isAdmin && (
          <div className="pl-2 mt-1.5">
            {isUploading ? (
              <p className="text-xs text-orange-600">
                Envoi {uploadProgress!.done}/{uploadProgress!.total}...
              </p>
            ) : (
              <button
                className="text-xs text-orange-600 hover:text-orange-800 border border-dashed border-orange-300 rounded px-2 py-1 hover:bg-orange-50"
                onClick={() => triggerUpload(id)}
              >
                + Ajouter des fichiers
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const hasContent = documents.length > 0;
  const showNone = hasContent && (grouped.get('__none__') || []).length > 0;

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 min-w-0">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold break-words">📁 Documents du dossier</h2>
        {isAdmin && (
          <Btn
            variant="outline"
            className="text-xs h-8 w-full sm:w-auto"
            onClick={handleExportZip}
            disabled={isLoading || isExportingZip || !hasContent}
          >
            {isExportingZip ? 'Preparation ZIP...' : '🗜️ Telecharger tout (ZIP)'}
          </Btn>
        )}
      </div>

      {isLoading || loadingCompartiments ? (
        <p className="text-sm text-muted-foreground">Chargement...</p>
      ) : !hasContent ? (
        <div>
          <p className="text-sm text-muted-foreground mb-2">Aucun document</p>
          {isAdmin && (
            <button
              className="text-xs text-orange-600 hover:text-orange-800 border border-dashed border-orange-300 rounded px-2 py-1 hover:bg-orange-50"
              onClick={() => triggerUpload(null)}
            >
              + Ajouter des fichiers
            </button>
          )}
        </div>
      ) : (
        <>
          {compartiments.map((c) => renderGroup(c._id, c.nom, grouped.get(c._id) || []))}
          {(showNone || compartiments.length === 0) && renderGroup('__none__', 'Non classes', grouped.get('__none__') || [])}
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
              {creating ? '...' : '+ Creer'}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
