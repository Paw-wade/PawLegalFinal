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

  // Multi-select
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState('');
  const [bulkMoving, setBulkMoving] = useState(false);

  // Collapse/expand compartiments (vide = tout replie par defaut)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  // Drag & drop
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragCounters = useRef<Map<string, number>>(new Map());

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
    const doc = documents.find((d) => String(d._id || d.id) === String(targetDocId));
    const cId = doc ? (doc.compartiment?._id || doc.compartiment || '__none__') : '__none__';
    setOpenGroups((prev) => { const n = new Set(prev); n.add(String(cId)); return n; });
    const t = window.setTimeout(() => {
      document.getElementById(`doc-${targetDocId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
    return () => window.clearTimeout(t);
  }, [targetDocId, isLoading, documents]);

  const handleCreate = async () => {
    const nom = newName.trim();
    if (!nom || creating) return;
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

  const handleBulkMove = async (compartimentId: string) => {
    if (selectedDocIds.size === 0 || bulkMoving) return;
    setBulkMoving(true);
    try {
      await Promise.all(
        Array.from(selectedDocIds).map((id) =>
          documentsAPI.moveDocumentToCompartiment(id, compartimentId === '__none__' ? null : compartimentId)
        )
      );
      setSelectedDocIds(new Set());
      setBulkTarget('');
      onDocumentsChanged?.();
    } catch (e) {
      console.error('Erreur deplacement groupe:', e);
      alert('Impossible de deplacer les documents');
    } finally {
      setBulkMoving(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!window.confirm('Supprimer definitivement ce document ?')) return;
    setDeletingDocId(docId);
    try {
      await documentsAPI.deleteDocument(docId);
      setSelectedDocIds((prev) => { const n = new Set(prev); n.delete(docId); return n; });
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
      const { blobFromDownloadResponse, resolveFileNameFromDownloadResponse } = await import('@/lib/downloadFile');
      const zip = new JSZip();

      // Construire un Map id -> nom pour les compartiments
      const compNomById = new Map<string, string>();
      for (const c of compartiments) {
        const cid = String(c._id || '').trim();
        if (cid) compNomById.set(cid, String(c.nom || 'Dossier').trim());
      }

      // Sanitize un segment de chemin ZIP (retire les caracteres interdits)
      const sanitize = (s: string) =>
        s.replace(/[/\\:*?"<>|]/g, '_').replace(/\.{2,}/g, '_').trim() || 'Dossier';

      // Suivre les noms de fichiers par dossier pour eviter les doublons
      const usedNamesInFolder = new Map<string, Set<string>>();
      const uniqueNameInFolder = (folder: string, rawName: string): string => {
        if (!usedNamesInFolder.has(folder)) usedNamesInFolder.set(folder, new Set());
        const used = usedNamesInFolder.get(folder)!;
        if (!used.has(rawName)) { used.add(rawName); return rawName; }
        const dot = rawName.lastIndexOf('.');
        const base = dot >= 0 ? rawName.slice(0, dot) : rawName;
        const ext = dot >= 0 ? rawName.slice(dot) : '';
        let i = 2;
        while (used.has(`${base} (${i})${ext}`)) i++;
        const unique = `${base} (${i})${ext}`;
        used.add(unique);
        return unique;
      };

      for (const doc of documents) {
        const docId = doc._id || doc.id;
        if (!docId) continue;
        try {
          const response = await documentsAPI.downloadDocument(docId);
          const blob = blobFromDownloadResponse(response);
          const rawFileName = resolveFileNameFromDownloadResponse(response, doc.nom || doc.originalName || 'document');

          // Determiner le dossier de destination dans le ZIP
          const cId = (doc.compartiment?._id || doc.compartiment) as string | null;
          const folderName = cId && compNomById.has(cId)
            ? sanitize(compNomById.get(cId)!)
            : 'Non classes';

          const fileName = uniqueNameInFolder(folderName, rawFileName);
          zip.file(`${folderName}/${fileName}`, blob);
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

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, docId: string) => {
    e.dataTransfer.setData('text/plain', docId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingDocId(docId);
  };

  const handleDragEnd = () => {
    setDraggingDocId(null);
    setDragOverId(null);
    dragCounters.current.clear();
  };

  const handleDropZoneEnter = (e: React.DragEvent, zoneId: string) => {
    e.preventDefault();
    const count = (dragCounters.current.get(zoneId) || 0) + 1;
    dragCounters.current.set(zoneId, count);
    setDragOverId(zoneId);
  };

  const handleDropZoneLeave = (e: React.DragEvent, zoneId: string) => {
    const count = (dragCounters.current.get(zoneId) || 1) - 1;
    dragCounters.current.set(zoneId, count);
    if (count <= 0) {
      dragCounters.current.delete(zoneId);
      setDragOverId((prev) => (prev === zoneId ? null : prev));
    }
  };

  const handleDropZoneOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, compartimentId: string) => {
    e.preventDefault();
    dragCounters.current.delete(compartimentId);
    setDragOverId(null);
    const docId = e.dataTransfer.getData('text/plain');
    setDraggingDocId(null);
    if (!docId) return;
    const doc = documents.find((d) => (d._id || d.id) === docId);
    const currentCId = doc ? (doc.compartiment?._id || doc.compartiment || '__none__') : '__none__';
    if (currentCId === compartimentId) return;
    await handleMove(docId, compartimentId);
  };

  // Selection helpers
  const toggleSelect = (docId: string) => {
    setSelectedDocIds((prev) => {
      const n = new Set(prev);
      if (n.has(docId)) n.delete(docId); else n.add(docId);
      return n;
    });
  };

  const toggleSelectGroup = (groupDocs: any[]) => {
    const groupIds = groupDocs.map((d) => d._id || d.id);
    const allSelected = groupIds.length > 0 && groupIds.every((id) => selectedDocIds.has(id));
    setSelectedDocIds((prev) => {
      const n = new Set(prev);
      if (allSelected) groupIds.forEach((id) => n.delete(id));
      else groupIds.forEach((id) => n.add(id));
      return n;
    });
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
    const isHighlighted = targetDocId && String(docId) === String(targetDocId);
    const isMoving = movingDocId === docId;
    const isDelDoc = deletingDocId === docId;
    const isSelected = selectedDocIds.has(docId);
    const isDragging = draggingDocId === docId;

    return (
      <div
        key={docId}
        id={`doc-${docId}`}
        draggable={isAdmin}
        onDragStart={(e) => handleDragStart(e, docId)}
        onDragEnd={handleDragEnd}
        className={`flex items-center gap-2 py-1.5 min-w-0 border-b border-gray-100 last:border-0 transition-colors rounded
          ${isHighlighted ? 'bg-amber-50 -mx-1 px-1' : ''}
          ${isDragging ? 'opacity-40' : ''}
          ${isSelected ? 'bg-orange-50' : ''}
        `}
      >
        {isAdmin && (
          <input
            type="checkbox"
            className="shrink-0 accent-orange-500 cursor-pointer"
            checked={isSelected}
            onChange={() => toggleSelect(docId)}
          />
        )}
        {isAdmin && (
          <span
            className="text-gray-300 cursor-grab active:cursor-grabbing shrink-0 select-none text-base leading-none"
            title="Glisser pour deplacer"
          >
            ⠿
          </span>
        )}
        <p className="text-sm flex-1 min-w-0 truncate text-gray-800 cursor-default" title={doc.nom}>
          {doc.nom}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {isMoving && <span className="text-xs text-orange-500">...</span>}
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
    const isOpen = openGroups.has(id);
    const isEditing = editingId === id;
    const isDeleting = deletingId === id;
    const isConfirming = deletingConfirmId === id;
    const isUploading = uploadProgress !== null && uploadProgress.compId === (isNone ? null : id);
    const isDragOver = dragOverId === id && draggingDocId !== null;
    const groupIds = docs.map((d) => d._id || d.id);
    const allGroupSelected = groupIds.length > 0 && groupIds.every((gid) => selectedDocIds.has(gid));

    return (
      <div
        key={id}
        className={`mb-2 rounded-lg transition-all duration-150 ${isDragOver ? 'bg-orange-50 ring-2 ring-orange-300 ring-inset' : ''}`}
        onDragEnter={(e) => isAdmin && handleDropZoneEnter(e, id)}
        onDragLeave={(e) => isAdmin && handleDropZoneLeave(e, id)}
        onDragOver={(e) => isAdmin && handleDropZoneOver(e)}
        onDrop={(e) => isAdmin && handleDrop(e, id)}
      >
        {/* En-tete cliquable pour replier/deplier */}
        <div
          className="flex flex-wrap items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 cursor-pointer select-none"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('input, button')) return;
            toggleGroup(id);
          }}
        >
          {isAdmin && !isNone && docs.length > 0 && (
            <input
              type="checkbox"
              className="shrink-0 accent-orange-500 cursor-pointer"
              checked={allGroupSelected}
              onChange={() => toggleSelectGroup(docs)}
              title="Tout selectionner"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <span className="text-gray-400 text-xs w-3 shrink-0">{isOpen ? '▼' : '▶'}</span>
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
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
              <Btn className="h-7 text-xs px-2" onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleRename(id); }} disabled={savingRename}>
                {savingRename ? '...' : 'OK'}
              </Btn>
              <Btn variant="outline" className="h-7 text-xs px-2" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setEditingId(null); setEditingName(''); }}>
                Annuler
              </Btn>
            </>
          ) : isConfirming ? (
            <>
              <span className="text-xs text-gray-600 font-medium">Supprimer "{nom}" :</span>
              <button
                className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-300 disabled:opacity-40"
                disabled={isDeleting}
                onClick={(e) => { e.stopPropagation(); handleDeleteCompartiment(id, false); }}
              >
                Deplacer vers Non classes
              </button>
              <button
                className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 border border-red-300 disabled:opacity-40"
                disabled={isDeleting}
                onClick={(e) => { e.stopPropagation(); handleDeleteCompartiment(id, true); }}
              >
                Supprimer les documents
              </button>
              <button
                className="text-xs px-2 py-1 rounded text-gray-500 hover:text-gray-700"
                onClick={(e) => { e.stopPropagation(); setDeletingConfirmId(null); }}
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
                    className="text-xs text-blue-500 hover:text-blue-700 ml-1"
                    title="Renommer"
                    onClick={(e) => { e.stopPropagation(); setEditingId(id); setEditingName(nom); }}
                  >
                    ✏️
                  </button>
                  <button
                    className="text-xs text-red-400 hover:text-red-600"
                    disabled={isDeleting}
                    title="Supprimer"
                    onClick={(e) => { e.stopPropagation(); setDeletingConfirmId(id); }}
                  >
                    {isDeleting ? '...' : '🗑️'}
                  </button>
                </>
              )}
              {isDragOver && (
                <span className="text-xs text-orange-600 font-semibold ml-auto animate-pulse">
                  Deposer ici
                </span>
              )}
            </>
          )}
        </div>

        {/* Contenu repliable */}
        {isOpen && (
          <div className="pl-4 pr-2 pb-2">
            <div className={`${isDragOver && docs.length === 0 ? 'min-h-[2rem]' : ''}`}>
              {docs.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-1">
                  {isDragOver ? 'Deposer ici...' : 'Aucun document'}
                </p>
              ) : (
                docs.map(renderDoc)
              )}
            </div>
            {isAdmin && (
              <div className="mt-2">
                {isUploading ? (
                  <p className="text-xs text-orange-600">
                    Envoi {uploadProgress!.done}/{uploadProgress!.total}...
                  </p>
                ) : (
                  <button
                    className="text-xs text-orange-600 hover:text-orange-800 border border-dashed border-orange-300 rounded px-2 py-1 hover:bg-orange-50"
                    onClick={() => triggerUpload(isNone ? null : id)}
                  >
                    + Ajouter des fichiers
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const hasContent = documents.length > 0;
  const hasCompartiments = compartiments.length > 0;
  const noneGroupDocs = grouped.get('__none__') || [];
  const selectionCount = selectedDocIds.size;
  const showNoneGroup = !hasCompartiments || noneGroupDocs.length > 0 || draggingDocId !== null;

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 min-w-0">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />

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

      {/* Barre de selection groupee */}
      {isAdmin && selectionCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          <span className="text-xs font-semibold text-orange-700">
            {selectionCount} document{selectionCount > 1 ? 's' : ''} selectionne{selectionCount > 1 ? 's' : ''}
          </span>
          <select
            className="h-7 text-xs border border-orange-300 rounded px-2 bg-white flex-1 min-w-0 max-w-[180px]"
            value={bulkTarget}
            onChange={(e) => setBulkTarget(e.target.value)}
          >
            <option value="">Deplacer vers...</option>
            <option value="__none__">Non classes</option>
            {compartiments.map((c) => (
              <option key={c._id} value={c._id}>{c.nom}</option>
            ))}
          </select>
          <Btn
            className="h-7 text-xs px-3 shrink-0"
            disabled={!bulkTarget || bulkMoving}
            onClick={() => bulkTarget && handleBulkMove(bulkTarget)}
          >
            {bulkMoving ? '...' : 'Deplacer'}
          </Btn>
          <button
            className="text-xs text-gray-500 hover:text-gray-700"
            onClick={() => { setSelectedDocIds(new Set()); setBulkTarget(''); }}
          >
            Annuler
          </button>
        </div>
      )}

      {isLoading || loadingCompartiments ? (
        <p className="text-sm text-muted-foreground">Chargement...</p>
      ) : (
        <>
          {/* Compartiments nommes -- toujours rendus meme sans documents */}
          {compartiments.map((c) => renderGroup(c._id, c.nom, grouped.get(c._id) || []))}

          {/* Non classes -- visible si pas de compartiments, ou docs non classes, ou drag en cours */}
          {showNoneGroup && renderGroup('__none__', 'Non classes', noneGroupDocs)}
        </>
      )}

      {isAdmin && (
        <div className={`mt-4 pt-4 border-t border-gray-100 ${!hasContent && !hasCompartiments ? 'mt-2 pt-0 border-0' : ''}`}>
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
