'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { dossiersAPI } from '@/lib/api';
import { downloadDossierPawAiPdf } from '@/lib/exportDossierPawAiPdf';
import { Download, Loader2, Sparkles, X } from 'lucide-react';

export type DossierPawAiRun = {
  id: string;
  prompt: string;
  isDefaultPrompt: boolean;
  outputMarkdown: string;
  provider?: string;
  resolvedProvider?: string;
  createdAt?: string;
};

type Props = {
  dossierId: string;
  dossierTitle?: string;
  dossierNumero?: string;
};

export function DossierPawAiTrigger({ dossierId, dossierTitle, dossierNumero }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [extractionStatus, setExtractionStatus] = useState('idle');
  const [runs, setRuns] = useState<DossierPawAiRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const res = await dossiersAPI.getPawAiState(dossierId);
      const data = res.data;
      if (data?.defaultPrompt) setDefaultPrompt(data.defaultPrompt);
      if (data?.state) {
        setExtractionStatus(data.state.extractionStatus || 'idle');
        const nextRuns = data.state.runs || [];
        setRuns(nextRuns);
        setActiveRunId((prev) => prev || nextRuns[0]?.id || null);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Impossible de charger Paw AI dossier');
    }
  }, [dossierId]);

  useEffect(() => {
    if (!open) return;
    setError('');
    void loadState();
  }, [open, loadState]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const activeRun = runs.find((r) => r.id === activeRunId) || runs[0];

  const handleRun = async (isDefault: boolean) => {
    const prompt = isDefault ? defaultPrompt : customPrompt.trim();
    if (!prompt) {
      setError('Saisissez un prompt.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await dossiersAPI.runPawAi(dossierId, {
        prompt,
        isDefaultPrompt: isDefault,
        provider: 'auto',
      });
      if (res.data?.state) {
        setExtractionStatus(res.data.state.extractionStatus);
        setRuns(res.data.state.runs || []);
      }
      if (res.data?.run?.id) {
        setActiveRunId(res.data.run.id);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Analyse impossible');
    } finally {
      setLoading(false);
    }
  };

  const handleReextract = async () => {
    setExtracting(true);
    setError('');
    try {
      const res = await dossiersAPI.extractPawAiCorpus(dossierId);
      if (res.data?.state) {
        setExtractionStatus(res.data.state.extractionStatus);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Extraction impossible');
    } finally {
      setExtracting(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!activeRun?.outputMarkdown) return;
    downloadDossierPawAiPdf({
      dossierTitle: dossierTitle || 'Dossier',
      dossierNumero,
      prompt: activeRun.prompt,
      outputMarkdown: activeRun.outputMarkdown,
      fileName: `paw-ai-${dossierNumero || dossierId}`,
    });
  };

  const modal =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/45"
        role="presentation"
        onClick={(e) => {
          e.stopPropagation();
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div
          role="dialog"
          aria-labelledby={`paw-ai-title-${dossierId}`}
          className="relative flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col rounded-xl border border-orange-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2
                id={`paw-ai-title-${dossierId}`}
                className="flex items-center gap-2 text-sm font-semibold text-slate-900"
              >
                <Sparkles className="h-4 w-4 text-orange-600 shrink-0" />
                Paw AI — Documents du dossier
              </h2>
              {(dossierTitle || dossierNumero) && (
                <p className="mt-0.5 text-xs text-slate-500 truncate max-w-[280px]">
                  {[dossierNumero, dossierTitle].filter(Boolean).join(' · ')}
                </p>
              )}
              <p className="mt-1 text-[10px] text-slate-500 uppercase tracking-wide">
                Corpus : {extractionStatus === 'ready' ? 'prêt' : extractionStatus}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {error && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading || !defaultPrompt}
                onClick={() => void handleRun(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Fiche chronologique
              </button>
              <button
                type="button"
                disabled={extracting}
                onClick={() => void handleReextract()}
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Réextraire les pièces
              </button>
            </div>

            <label className="block text-xs font-medium text-slate-700">Prompt personnalisé</label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={3}
              placeholder="Ex. Combien de documents y a-t-il ? Liste les dates clés…"
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
            />
            <button
              type="button"
              disabled={loading || !customPrompt.trim()}
              onClick={() => void handleRun(false)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-orange-400 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Analyser avec Paw AI (sources complètes)
            </button>

            {runs.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[10px] text-slate-600">Historique</label>
                  <select
                    value={activeRun?.id || ''}
                    onChange={(e) => setActiveRunId(e.target.value)}
                    className="flex-1 min-w-0 text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.isDefaultPrompt ? 'Fiche par défaut' : r.prompt.slice(0, 40)}
                        {r.prompt.length > 40 ? '…' : ''}
                        {r.createdAt
                          ? ` · ${new Date(r.createdAt).toLocaleString('fr-FR')}`
                          : ''}
                      </option>
                    ))}
                  </select>
                  {activeRun?.outputMarkdown && (
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="h-3 w-3" />
                      PDF
                    </button>
                  )}
                </div>
                {activeRun?.outputMarkdown && (
                  <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 whitespace-pre-wrap">
                    {activeRun.outputMarkdown}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-md border border-transparent text-orange-600 hover:text-orange-700 hover:bg-orange-50 transition-colors"
        title="Paw AI — analyser les documents du dossier"
        aria-label="Ouvrir Paw AI pour ce dossier"
      >
        <Sparkles className="h-4 w-4" />
      </button>
      {modal}
    </>
  );
}

/** @deprecated Utiliser DossierPawAiTrigger */
export const DossierPawAiPanel = DossierPawAiTrigger;
