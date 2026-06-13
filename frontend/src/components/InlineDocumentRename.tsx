'use client';

import { useEffect, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

type InlineDocumentRenameProps = {
  value: string;
  onSave: (nextName: string) => Promise<void>;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  placeholder?: string;
};

export function InlineDocumentRename({
  value,
  onSave,
  className = '',
  inputClassName = '',
  disabled = false,
  placeholder = 'Nom du document',
}: InlineDocumentRenameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const cancel = () => {
    setDraft(value);
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError('Le nom ne peut pas être vide.');
      return;
    }
    if (trimmed === value.trim()) {
      cancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (e: any) {
      setError(e?.message || 'Renommage impossible.');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') cancel();
            }}
            disabled={saving}
            autoFocus
            className={`min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm ${inputClassName}`}
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-60"
            title="Enregistrer"
            aria-label="Enregistrer le nom"
          >
            <Check aria-hidden width={14} height={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            title="Annuler"
            aria-label="Annuler le renommage"
          >
            <X aria-hidden width={14} height={14} strokeWidth={2} />
          </button>
        </div>
        {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className={`min-w-0 truncate ${className}`}>{value}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(value);
          setError(null);
          setEditing(true);
        }}
        disabled={disabled}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
        title="Renommer"
        aria-label="Renommer le document"
      >
        <Pencil aria-hidden width={13} height={13} strokeWidth={2} />
      </button>
    </div>
  );
}
