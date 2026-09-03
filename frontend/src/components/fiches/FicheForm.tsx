'use client';

import { useEffect, useMemo, useState } from 'react';
import { dossiersAPI } from '@/lib/api';
import { FloatingField } from '@/components/ui/FloatingField';

interface FieldDef {
  name: string;
  label: string;
  type: string;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
  suffix?: string;
  default?: string;
  fullWidth?: boolean;
  autoToday?: boolean;
  sizesSection?: string; // un champ nombre qui pré-crée N lignes dans une section répétable
}
interface SectionDef {
  id: string;
  titre?: string;
  note?: string;
  static?: string;
  fields?: FieldDef[];
  repeatable?: { itemLabel: string; fields: FieldDef[] };
}
interface Schema {
  type: string;
  titre: string;
  sousTitre?: string;
  sections: SectionDef[];
}

interface Props {
  type: string;
  initialData?: any;
  submitting?: boolean;
  onSubmit: (data: any) => void;
  onCancel?: () => void;
}

const inputCls =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

export function FicheForm({ type, initialData, submitting, onSubmit, onCancel }: Props) {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(initialData || {});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await dossiersAPI.getFicheSchema(type);
        if (!alive) return;
        if (res.data?.success) {
          const sc: Schema = res.data.schema;
          setSchema(sc);
          // Initialiser valeurs par défaut + une ligne par section répétable.
          const todayFr = (() => {
            const d = new Date();
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
          })();
          setData((prev: any) => {
            const next = { ...prev };
            sc.sections.forEach((s) => {
              if (s.repeatable) {
                if (!Array.isArray(next[s.id]) || next[s.id].length === 0) next[s.id] = [{}];
              } else if (s.fields) {
                s.fields.forEach((f) => {
                  if (next[f.name] === undefined) {
                    if (f.autoToday) next[f.name] = todayFr;
                    else next[f.name] = f.default ?? (f.type === 'checkboxes' ? [] : '');
                  }
                });
              }
            });
            return next;
          });
        } else {
          setError('Formulaire indisponible.');
        }
      } catch (e: any) {
        if (alive) setError(e?.response?.data?.message || 'Impossible de charger le formulaire.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [type]);

  const setField = (name: string, value: any) => setData((d: any) => ({ ...d, [name]: value }));
  // Redimensionne une section répétable à N lignes (préserve les lignes déjà saisies).
  const resizeSection = (sectionId: string, countStr: any) => {
    const n = Math.max(0, Math.min(50, parseInt(String(countStr).replace(/[^\d]/g, ''), 10) || 0));
    if (n === 0) return;
    setData((d: any) => {
      const cur = Array.isArray(d[sectionId]) ? d[sectionId] : [];
      const rows = cur.slice(0, n);
      while (rows.length < n) rows.push({});
      return { ...d, [sectionId]: rows };
    });
  };
  const setRepeat = (secId: string, idx: number, name: string, value: any) =>
    setData((d: any) => {
      const rows = Array.isArray(d[secId]) ? [...d[secId]] : [];
      rows[idx] = { ...rows[idx], [name]: value };
      return { ...d, [secId]: rows };
    });
  const addRow = (secId: string) => setData((d: any) => ({ ...d, [secId]: [...(d[secId] || []), {}] }));
  const removeRow = (secId: string, idx: number) =>
    setData((d: any) => {
      const rows = (d[secId] || []).filter((_: any, i: number) => i !== idx);
      return { ...d, [secId]: rows.length ? rows : [{}] };
    });

  const toggleCheckbox = (name: string, value: string) =>
    setData((d: any) => {
      const arr = Array.isArray(d[name]) ? [...d[name]] : [];
      const i = arr.indexOf(value);
      if (i >= 0) arr.splice(i, 1); else arr.push(value);
      return { ...d, [name]: arr };
    });

  const renderInput = (f: FieldDef, value: any, onChange: (v: any) => void) => {
    if (f.type === 'textarea') {
      return <textarea rows={3} value={value || ''} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
    }
    if (f.type === 'radio') {
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {(f.options || []).map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 text-sm">
              <input type="radio" name={f.name} checked={String(value) === String(o.value)} onChange={() => onChange(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    if (f.type === 'checkboxes') {
      const arr = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {(f.options || []).map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={arr.includes(o.value)} onChange={() => toggleCheckbox(f.name, o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    if (f.type === 'select') {
      return (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">Sélectionnez…</option>
          {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    const inputType = f.type === 'date' ? 'date' : f.type === 'number' || f.type === 'montant' || f.type === 'percent' ? 'text' : 'text';
    return (
      <div className="flex items-center gap-2">
        <input type={inputType} value={value || ''} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />
        {f.suffix && <span className="whitespace-nowrap text-xs text-muted-foreground">{f.suffix}</span>}
      </div>
    );
  };

  const missingRequired = useMemo(() => {
    if (!schema) return [];
    const miss: string[] = [];
    schema.sections.forEach((s) => {
      (s.fields || []).forEach((f) => {
        if (f.required && (data[f.name] === undefined || String(data[f.name]).trim() === '')) miss.push(f.label);
      });
    });
    return miss;
  }, [schema, data]);

  if (loading) return <p className="py-6 text-center text-sm text-muted-foreground">Chargement du formulaire…</p>;
  if (error) return <p className="py-6 text-center text-sm text-red-600">{error}</p>;
  if (!schema) return null;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-foreground">{schema.titre}</h3>
        {schema.sousTitre && <p className="text-xs text-muted-foreground">{schema.sousTitre}</p>}
      </div>

      {schema.sections.map((s) => {
        if (s.static) {
          return (
            <div key={s.id} className="rounded-lg bg-gray-50 p-3">
              {s.titre && <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{s.titre}</p>}
              <p className="whitespace-pre-wrap text-xs text-gray-600">{s.static}</p>
            </div>
          );
        }
        if (s.repeatable) {
          const rows = Array.isArray(data[s.id]) ? data[s.id] : [{}];
          return (
            <div key={s.id}>
              {s.titre && <h4 className="mb-1 text-sm font-bold uppercase tracking-wide text-primary">{s.titre}</h4>}
              {s.note && <p className="mb-2 text-xs italic text-muted-foreground">{s.note}</p>}
              <div className="space-y-2">
                {rows.map((row: any, idx: number) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2">
                    <span className="text-xs font-semibold text-muted-foreground">{s.repeatable!.itemLabel} {idx + 1}</span>
                    {s.repeatable!.fields.map((f) => (
                      <div key={f.name} className="min-w-[150px] flex-1">
                        <FloatingField label={f.label} required={f.required} type={f.type} options={f.options}
                          suffix={f.suffix} placeholder={f.placeholder} value={row[f.name]} onChange={(v) => setRepeat(s.id, idx, f.name, v)} />
                      </div>
                    ))}
                    <button type="button" onClick={() => removeRow(s.id, idx)} className="text-xs font-medium text-red-600 hover:underline">Retirer</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addRow(s.id)} className="mt-2 text-xs font-medium text-primary hover:underline">+ Ajouter {s.repeatable.itemLabel.toLowerCase()}</button>
            </div>
          );
        }
        return (
          <div key={s.id}>
            {s.titre && <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-primary">{s.titre}</h4>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(s.fields || []).map((f) => {
                const isOption = f.type === 'radio' || f.type === 'checkboxes';
                const colSpan = f.fullWidth || f.type === 'textarea' || isOption ? 'sm:col-span-2' : '';
                return (
                  <div key={f.name} className={colSpan}>
                    {isOption ? (
                      <>
                        <label className="mb-1 block text-sm font-medium text-foreground">{f.label}{f.required && ' *'}</label>
                        {renderInput(f, data[f.name], (v) => setField(f.name, v))}
                      </>
                    ) : (
                      <FloatingField label={f.label} required={f.required} type={f.type} options={f.options}
                        suffix={f.suffix} rows={3} placeholder={f.placeholder} value={data[f.name]}
                        onChange={(v) => { setField(f.name, v); if (f.sizesSection) resizeSection(f.sizesSection, v); }} />
                    )}
                  </div>
                );
              })}
            </div>
            {s.note && <p className="mt-2 text-xs italic text-muted-foreground">{s.note}</p>}
          </div>
        );
      })}

      {missingRequired.length > 0 && (
        <p className="text-xs text-amber-700">Champs obligatoires manquants : {missingRequired.join(', ')}.</p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => onSubmit(data)}
          disabled={submitting || missingRequired.length > 0}
          className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {submitting ? 'Enregistrement…' : 'Valider et générer le document'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}

export default FicheForm;
