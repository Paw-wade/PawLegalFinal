'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { dossiersAPI } from '@/lib/api';
import { FloatingField } from '@/components/ui/FloatingField';

const NATIONALITY_OPTIONS = [
  { value: 'senegalaise', label: 'Senegalaise' },
  { value: 'francaise', label: 'Francaise' },
  { value: 'algerienne', label: 'Algerienne' },
  { value: 'marocaine', label: 'Marocaine' },
  { value: 'tunisienne', label: 'Tunisienne' },
  { value: 'malienne', label: 'Malienne' },
  { value: 'guineenne', label: 'Guineenne' },
  { value: 'ivoirienne', label: 'Ivoirienne' },
  { value: 'camerounaise', label: 'Camerounaise' },
  { value: 'congoleseBrazza', label: 'Congolaise (Brazzaville)' },
  { value: 'congoleseDRC', label: 'Congolaise (RDC)' },
  { value: 'comorienne', label: 'Comorienne' },
  { value: 'djiboutienne', label: 'Djiboutienne' },
  { value: 'egyptienne', label: 'Egyptienne' },
  { value: 'erythreenne', label: 'Erythreenne' },
  { value: 'ethiopienne', label: 'Ethiopienne' },
  { value: 'gabonaise', label: 'Gabonaise' },
  { value: 'ghaneenne', label: 'Ghaneenne' },
  { value: 'guinee-bissau', label: 'Guinee-Bissau' },
  { value: 'kenyane', label: 'Kenyane' },
  { value: 'libyenne', label: 'Libyenne' },
  { value: 'liberienne', label: 'Liberienne' },
  { value: 'malgache', label: 'Malgache' },
  { value: 'mauritanienne', label: 'Mauritanienne' },
  { value: 'mozambicaine', label: 'Mozambicaine' },
  { value: 'namibienne', label: 'Namibienne' },
  { value: 'nigeriane', label: 'Nigeriane' },
  { value: 'nigerienne', label: 'Nigerienne' },
  { value: 'ougandaise', label: 'Ougandaise' },
  { value: 'rwandaise', label: 'Rwandaise' },
  { value: 'sierra-leonaise', label: 'Sierra-Leonaise' },
  { value: 'somalienne', label: 'Somalienne' },
  { value: 'soudanaise', label: 'Soudanaise' },
  { value: 'sud-africaine', label: 'Sud-Africaine' },
  { value: 'tanzanienne', label: 'Tanzanienne' },
  { value: 'tchadienne', label: 'Tchadienne' },
  { value: 'togolaise', label: 'Togolaise' },
  { value: 'zambienne', label: 'Zambienne' },
  { value: 'beninoise', label: 'Beninoise' },
  { value: 'burkinabe', label: 'Burkinabe' },
  { value: 'cap-verdienne', label: 'Cap-Verdienne' },
  { value: 'gambionne', label: 'Gambienne' },
  { value: 'burundaise', label: 'Burundaise' },
  { value: 'centrafricaine', label: 'Centrafricaine' },
  { value: 'zimbabweenne', label: 'Zimbabweenne' },
  { value: 'allemande', label: 'Allemande' },
  { value: 'belge', label: 'Belge' },
  { value: 'britannique', label: 'Britannique' },
  { value: 'espagnole', label: 'Espagnole' },
  { value: 'italienne', label: 'Italienne' },
  { value: 'neerlandaise', label: 'Neerlandaise' },
  { value: 'portugaise', label: 'Portugaise' },
  { value: 'suisse', label: 'Suisse' },
  { value: 'americaine', label: 'Americaine' },
  { value: 'bresilienne', label: 'Bresilienne' },
  { value: 'canadienne', label: 'Canadienne' },
  { value: 'afghane', label: 'Afghane' },
  { value: 'chinoise', label: 'Chinoise' },
  { value: 'indienne', label: 'Indienne' },
  { value: 'iranienne', label: 'Iranienne' },
  { value: 'irakienne', label: 'Irakienne' },
  { value: 'libanaise', label: 'Libanaise' },
  { value: 'pakistanaise', label: 'Pakistanaise' },
  { value: 'syrienne', label: 'Syrienne' },
  { value: 'turque', label: 'Turque' },
];

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
  sizesSection?: string;
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
  signature?: boolean;
}

interface Props {
  type: string;
  initialData?: any;
  submitting?: boolean;
  onSubmit: (data: any) => void;
  onCancel?: () => void;
  ficheRequestId?: string;
  token?: string;
  draftData?: any;
  draftStep?: number;
}

const inputCls =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

export function FicheForm({ type, initialData, submitting, onSubmit, onCancel, ficheRequestId, token, draftData, draftStep }: Props) {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(() => {
    if (draftData && typeof draftData === 'object' && Object.keys(draftData).length > 0) return draftData;
    return initialData || {};
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [draftSavingState, setDraftSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigWrapperRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    const wrapper = sigWrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const syncSize = () => {
      const w = wrapper.clientWidth;
      if (!w) return;
      canvas.width = w;
      canvas.height = 120;
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(wrapper);

    const pos = (touch: Touch) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (touch.clientX - rect.left) * (canvas.width / rect.width),
        y: (touch.clientY - rect.top) * (canvas.height / rect.height),
      };
    };
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      isDrawing.current = true;
      const ctx = canvas.getContext('2d')!;
      const { x, y } = pos(e.touches[0]);
      ctx.beginPath(); ctx.moveTo(x, y);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!isDrawing.current) return;
      const ctx = canvas.getContext('2d')!;
      const { x, y } = pos(e.touches[0]);
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111111';
      ctx.lineTo(x, y); ctx.stroke();
    };
    const onTouchEnd = (e: TouchEvent) => { e.preventDefault(); isDrawing.current = false; };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    return () => {
      ro.disconnect();
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [schema, currentStep]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await dossiersAPI.getFicheSchema(type);
        if (!alive) return;
        if (res.data?.success) {
          const sc: Schema = res.data.schema;
          setSchema(sc);
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
          if (typeof draftStep === 'number' && draftStep > 0) {
            setCurrentStep(Math.min(draftStep, sc.sections.length - 1));
          }
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
  }, [type, draftStep]);

  useEffect(() => {
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, []);

  const scheduleDraftSave = (nextData: any, step: number) => {
    if (!ficheRequestId || !token) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    setDraftSavingState('idle');
    draftTimerRef.current = setTimeout(async () => {
      setDraftSavingState('saving');
      try {
        await dossiersAPI.saveFicheDraft(token, ficheRequestId, { data: nextData, step });
        setDraftSavingState('saved');
      } catch {
        setDraftSavingState('idle');
      }
    }, 2000);
  };

  const setField = (name: string, value: any) => {
    const next = { ...data, [name]: value };
    setData(next);
    scheduleDraftSave(next, currentStep);
    setStepError(null);
  };

  const resizeSection = (sectionId: string, countStr: any) => {
    const n = Math.max(0, Math.min(50, parseInt(String(countStr).replace(/[^\d]/g, ''), 10) || 0));
    if (n === 0) return;
    const cur = Array.isArray(data[sectionId]) ? data[sectionId] : [];
    const rowList = cur.slice(0, n);
    while (rowList.length < n) rowList.push({});
    const next = { ...data, [sectionId]: rowList };
    setData(next);
    scheduleDraftSave(next, currentStep);
  };

  const setRepeat = (secId: string, idx: number, name: string, value: any) => {
    const rows = Array.isArray(data[secId]) ? [...data[secId]] : [];
    rows[idx] = { ...rows[idx], [name]: value };
    const next = { ...data, [secId]: rows };
    setData(next);
    scheduleDraftSave(next, currentStep);
  };

  const addRow = (secId: string) => {
    const next = { ...data, [secId]: [...(data[secId] || []), {}] };
    setData(next);
    scheduleDraftSave(next, currentStep);
  };

  const removeRow = (secId: string, idx: number) => {
    const rows = (data[secId] || []).filter((_: any, i: number) => i !== idx);
    const next = { ...data, [secId]: rows.length ? rows : [{}] };
    setData(next);
    scheduleDraftSave(next, currentStep);
  };

  const toggleCheckbox = (name: string, value: string) => {
    const arr = Array.isArray(data[name]) ? [...data[name]] : [];
    const i = arr.indexOf(value);
    if (i >= 0) arr.splice(i, 1); else arr.push(value);
    const next = { ...data, [name]: arr };
    setData(next);
    scheduleDraftSave(next, currentStep);
  };

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };
  const sigStart = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const { x, y } = getCanvasPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const sigMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const { x, y } = getCanvasPos(e, canvasRef.current);
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111111';
    ctx.lineTo(x, y); ctx.stroke();
  };
  const sigEnd = () => { isDrawing.current = false; };
  const sigClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getMissingForCurrentSection = (): string[] => {
    if (!schema) return [];
    const s = schema.sections[currentStep];
    if (!s || s.static || s.repeatable) return [];
    return (s.fields || [])
      .filter((f) => f.required && (!data[f.name] || String(data[f.name]).trim() === ''))
      .map((f) => f.label);
  };

  const totalSteps = schema?.sections?.length ?? 1;
  const isLastStep = currentStep === totalSteps - 1;

  const goNext = () => {
    const missing = getMissingForCurrentSection();
    if (missing.length > 0) {
      setStepError(`Champs obligatoires : ${missing.join(', ')}`);
      return;
    }
    setStepError(null);
    const next = currentStep + 1;
    setCurrentStep(next);
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    if (ficheRequestId && token) {
      dossiersAPI.saveFicheDraft(token, ficheRequestId, { data, step: next }).catch(() => {});
    }
  };

  const goPrev = () => {
    setStepError(null);
    const prev = currentStep - 1;
    setCurrentStep(prev);
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    if (ficheRequestId && token) {
      dossiersAPI.saveFicheDraft(token, ficheRequestId, { data, step: prev }).catch(() => {});
    }
  };

  const handleQuit = async () => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    if (ficheRequestId && token) {
      try {
        await dossiersAPI.saveFicheDraft(token, ficheRequestId, { data, step: currentStep });
      } catch {}
    }
    onCancel?.();
  };

  const handleSubmit = () => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    const canvas = canvasRef.current;
    let payload = data;
    if (canvas && schema?.signature) {
      payload = { ...data, __signature: canvas.toDataURL('image/png') };
    }
    onSubmit(payload);
  };

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
          <option value="">Selectionnez...</option>
          {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <input type="text" value={value || ''} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />
        {f.suffix && <span className="whitespace-nowrap text-xs text-muted-foreground">{f.suffix}</span>}
      </div>
    );
  };

  const renderSection = (s: SectionDef) => {
    if (s.static) {
      return (
        <div className="rounded-lg bg-gray-50 p-3">
          {s.titre && <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{s.titre}</p>}
          <p className="whitespace-pre-wrap text-xs text-gray-600">{s.static}</p>
        </div>
      );
    }
    if (s.repeatable) {
      const rows = Array.isArray(data[s.id]) ? data[s.id] : [{}];
      return (
        <div>
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
      <div>
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
                ) : (() => {
                  const isNat = f.name === 'nationalite' || f.name.endsWith('_nationalite');
                  return (
                    <FloatingField label={f.label} required={f.required}
                      type={isNat ? 'select' : f.type}
                      options={isNat ? NATIONALITY_OPTIONS : f.options}
                      suffix={f.suffix} rows={3} placeholder={f.placeholder} value={data[f.name]}
                      onChange={(v) => { setField(f.name, v); if (f.sizesSection) resizeSection(f.sizesSection, v); }} />
                  );
                })()}
              </div>
            );
          })}
        </div>
        {s.note && <p className="mt-2 text-xs italic text-muted-foreground">{s.note}</p>}
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

  if (loading) return <p className="py-6 text-center text-sm text-muted-foreground">Chargement du formulaire...</p>;
  if (error) return <p className="py-6 text-center text-sm text-red-600">{error}</p>;
  if (!schema) return null;

  const currentSection = schema.sections[currentStep];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-foreground">{schema.titre}</h3>
        {schema.sousTitre && <p className="text-xs text-muted-foreground">{schema.sousTitre}</p>}
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span className="font-medium">
            {currentSection.titre || `Etape ${currentStep + 1} sur ${totalSteps}`}
          </span>
          <span>
            {draftSavingState === 'saving' && <span className="text-amber-600">Enregistrement...</span>}
            {draftSavingState === 'saved' && <span className="text-green-600">Brouillon sauvegarde</span>}
            {draftSavingState === 'idle' && <span>{currentStep + 1} / {totalSteps}</span>}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-200">
          <div
            className="h-1.5 rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {renderSection(currentSection)}

      {isLastStep && schema.signature && (
        <div>
          <p className="mb-1 text-sm font-medium text-foreground">Signature <span className="text-muted-foreground text-xs">(dessinez dans le cadre)</span></p>
          <div ref={sigWrapperRef} className="w-full">
            <canvas
              ref={canvasRef}
              className="block w-full rounded border border-dashed border-gray-400 bg-white cursor-crosshair touch-none"
              style={{ height: '120px' }}
              onMouseDown={sigStart}
              onMouseMove={sigMove}
              onMouseUp={sigEnd}
              onMouseLeave={sigEnd}
            />
          </div>
          <button type="button" onClick={sigClear} className="mt-1 text-xs text-muted-foreground hover:underline">Effacer</button>
        </div>
      )}

      {stepError && (
        <p className="text-xs text-amber-700">{stepError}</p>
      )}

      {isLastStep && missingRequired.length > 0 && (
        <p className="text-xs text-amber-700">Champs obligatoires manquants : {missingRequired.join(', ')}.</p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
        {currentStep > 0 && (
          <button
            type="button"
            onClick={goPrev}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Precedent
          </button>
        )}
        {!isLastStep && (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
          >
            Suivant
          </button>
        )}
        {isLastStep && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || missingRequired.length > 0}
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? 'Enregistrement...' : 'Valider et generer le document'}
          </button>
        )}
        {onCancel && (
          <button type="button" onClick={handleQuit} className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Quitter
          </button>
        )}
      </div>
    </div>
  );
}

export default FicheForm;
