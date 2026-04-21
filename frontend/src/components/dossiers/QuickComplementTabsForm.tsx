'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { dossiersAPI } from '@/lib/api';

export type QuickComplementDraft = { title: string; text: string };

const NEW_KEY = '__new__';

function buildDraftsFromComplements(complements: any[]): Record<string, QuickComplementDraft> {
  const drafts: Record<string, QuickComplementDraft> = {
    [NEW_KEY]: { title: '', text: '' },
  };
  (complements || []).forEach((c: any) => {
    const id = String(c._id || c.id || '');
    if (!id) return;
    drafts[id] = {
      title: String(c.title || '').trim(),
      text: c.text || '',
    };
  });
  return drafts;
}

function tabButtonLabel(
  key: string,
  index: number,
  draft: QuickComplementDraft | undefined
): string {
  if (key === NEW_KEY) return '+ Ajouter une note';
  const t = draft?.title?.trim();
  if (t) return t.length > 28 ? `${t.slice(0, 28)}…` : t;
  const preview = (draft?.text || '').trim().replace(/\s+/g, ' ');
  if (preview) {
    const short = preview.slice(0, 22);
    return preview.length > 22 ? `${short}…` : short;
  }
  return `Rubrique ${index + 1}`;
}

type QuickComplementTabsFormProps = {
  dossierId: string;
  complements: any[];
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
  onErrorToast?: (message: string) => void;
  onSuccessToast?: (message: string) => void;
};

export function QuickComplementTabsForm({
  dossierId,
  complements,
  onSaved,
  onCancel,
  onErrorToast,
  onSuccessToast,
}: QuickComplementTabsFormProps) {
  const orderedIds = useMemo(
    () => (complements || []).map((c: any) => String(c._id || c.id)).filter(Boolean),
    [complements]
  );

  const [drafts, setDrafts] = useState<Record<string, QuickComplementDraft>>(() =>
    buildDraftsFromComplements(complements)
  );
  const [activeKey, setActiveKey] = useState<string>(() =>
    orderedIds.length > 0 ? orderedIds[orderedIds.length - 1] : NEW_KEY
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [activeKey, dossierId]);

  const activeDraft = drafts[activeKey] || { title: '', text: '' };

  const updateActiveField = (field: keyof QuickComplementDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [activeKey]: { ...(prev[activeKey] || { title: '', text: '' }), [field]: value },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = activeDraft.text.trim();
    if (!text) {
      setError('Le texte du complément ne peut pas être vide.');
      return;
    }
    const title = activeDraft.title.trim().slice(0, 200);
    setSaving(true);
    setError(null);
    try {
      if (activeKey === NEW_KEY) {
        await dossiersAPI.addRecapComplement(dossierId, { text, title: title || undefined });
      } else {
        await dossiersAPI.updateRecapComplement(dossierId, activeKey, { text, title });
      }
      await onSaved();
      onSuccessToast?.('✅ Information importante enregistrée avec succès.');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erreur lors de l’enregistrement du complément.';
      setError(msg);
      onErrorToast?.(msg);
    } finally {
      setSaving(false);
    }
  };

  const tabKeys = [...orderedIds, NEW_KEY];

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 p-3 rounded-lg border border-amber-200 bg-amber-50/60 space-y-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap gap-1 border-b border-amber-200/80 pb-2 -mb-0.5">
        {tabKeys.map((key, idx) => {
          const isActive = activeKey === key;
          const draft = drafts[key];
          const label = tabButtonLabel(key, idx, draft);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveKey(key)}
              className={`shrink-0 max-w-[140px] sm:max-w-[180px] truncate rounded-t-md px-2 py-1 text-[10px] sm:text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-white text-amber-900 shadow-sm ring-1 ring-amber-200'
                  : 'bg-amber-100/80 text-amber-900/70 hover:bg-amber-100'
              }`}
              title={label}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div>
        <label className="text-[11px] md:text-sm font-medium block mb-1">Titre de la rubrique</label>
        <input
          type="text"
          value={activeDraft.title}
          onChange={(e) => updateActiveField('title', e.target.value)}
          maxLength={200}
          placeholder="Ex : Identifiants ANEF, Télérecours…"
          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs md:text-sm"
        />
      </div>
      <div>
        <label className="text-[11px] md:text-sm font-medium block mb-1">Complément d&apos;information</label>
        <textarea
          ref={textareaRef}
          value={activeDraft.text}
          onChange={(e) => updateActiveField('text', e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs md:text-sm min-h-[72px]"
          placeholder="Ajouter un complément utile au dossier..."
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="h-7 md:h-8 px-2 md:px-3 text-[10px] md:text-xs inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent"
          onClick={onCancel}
          disabled={saving}
        >
          Annuler
        </button>
        <button
          type="submit"
          className="h-7 md:h-8 px-2 md:px-3 text-[10px] md:text-xs inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          disabled={saving}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
