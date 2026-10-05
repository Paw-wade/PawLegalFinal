'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Upload, X, CheckCircle2, AlertCircle, FileText, Loader2 } from 'lucide-react';

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface Question {
  id: string;
  type: 'texte_court' | 'texte_long' | 'choix_unique' | 'choix_multiple' | 'date' | 'fichier' | 'section';
  label: string;
  requis: boolean;
  options: string[];
  typesAcceptes: string;
}

interface QData {
  _id: string;
  titre: string;
  description: string;
  questions: Question[];
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
  return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function QuestionnairePage() {
  const params = useParams();
  const token = params?.token as string;

  const [qData, setQData] = useState<QData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [choiceValues, setChoiceValues] = useState<Record<string, string | string[]>>({});
  const [fileValues, setFileValues] = useState<Record<string, File[]>>({});
  const [expediteur, setExpediteur] = useState({ nom: '', email: '', tel: '' });

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!token) return;
    const apiBase = NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
    fetch(`${apiBase}/api/questionnaires/public/${token}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || 'Erreur');
        setQData(data.questionnaire);
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!qData) return false;
    for (const q of qData.questions) {
      if (!q.requis || q.type === 'section') continue;
      if (q.type === 'fichier') {
        const files = fileValues[q.id] || [];
        if (files.length === 0) errs[q.id] = 'Ce champ est obligatoire.';
      } else if (q.type === 'choix_multiple') {
        const val = choiceValues[q.id] || [];
        if (!Array.isArray(val) || val.length === 0) errs[q.id] = 'Selectionnez au moins une option.';
      } else if (q.type === 'choix_unique') {
        if (!choiceValues[q.id]) errs[q.id] = 'Selectionnez une option.';
      } else {
        if (!(textValues[q.id] || '').trim()) errs[q.id] = 'Ce champ est obligatoire.';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !qData) return;
    setSubmitting(true);
    setSubmitError(null);

    const formData = new FormData();
    formData.append('expediteurNom', expediteur.nom);
    formData.append('expediteurEmail', expediteur.email);
    formData.append('expediteurTel', expediteur.tel);

    for (const q of qData.questions) {
      if (q.type === 'section') continue;
      if (q.type === 'fichier') {
        const files = fileValues[q.id] || [];
        for (const f of files) formData.append(`fichier_${q.id}`, f);
      } else if (q.type === 'choix_multiple') {
        const vals = choiceValues[q.id] || [];
        if (Array.isArray(vals)) {
          for (const v of vals) formData.append(`q_${q.id}`, v);
        }
      } else {
        formData.append(`q_${q.id}`, textValues[q.id] || '');
      }
    }

    try {
      const apiBase = NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
      const r = await fetch(`${apiBase}/api/questionnaires/public/${token}/soumettre`, {
        method: 'POST',
        body: formData,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Erreur');
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || 'Une erreur est survenue. Veuillez reessayer.');
    } finally {
      setSubmitting(false);
    }
  }

  function toggleChoice(qId: string, value: string, multiple: boolean) {
    setChoiceValues(prev => {
      if (!multiple) return { ...prev, [qId]: value };
      const current = Array.isArray(prev[qId]) ? (prev[qId] as string[]) : [];
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [qId]: next };
    });
    setErrors(prev => { const n = { ...prev }; delete n[qId]; return n; });
  }

  function addFiles(qId: string, files: File[]) {
    setFileValues(prev => ({ ...prev, [qId]: [...(prev[qId] || []), ...files] }));
    setErrors(prev => { const n = { ...prev }; delete n[qId]; return n; });
  }

  function removeFile(qId: string, idx: number) {
    setFileValues(prev => ({ ...prev, [qId]: prev[qId].filter((_, i) => i !== idx) }));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
        <div className="bg-background rounded-2xl shadow-sm border border-border p-8 max-w-md w-full text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
          <h1 className="text-lg font-semibold">Questionnaire indisponible</h1>
          <p className="text-sm text-muted-foreground">{loadError}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
        <div className="bg-background rounded-2xl shadow-sm border border-border p-10 max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
          <h1 className="text-xl font-bold">Reponse envoyee !</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Merci pour vos reponses. L'equipe les traitera dans les meilleurs delais et vous contactera si necessaire.
          </p>
        </div>
      </div>
    );
  }

  if (!qData) return null;

  return (
    <div className="min-h-screen bg-muted/20 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-primary rounded-2xl px-6 py-8 text-white shadow-sm">
          <h1 className="text-2xl font-bold">{qData.titre}</h1>
          {qData.description && (
            <p className="mt-2 text-primary-foreground/80 text-sm leading-relaxed">{qData.description}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-background rounded-2xl border border-border p-5 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Vos coordonnees (optionnel)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                className="border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Nom"
                value={expediteur.nom}
                onChange={e => setExpediteur(p => ({ ...p, nom: e.target.value }))}
              />
              <input
                type="email"
                className="border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Email"
                value={expediteur.email}
                onChange={e => setExpediteur(p => ({ ...p, email: e.target.value }))}
              />
              <input
                type="tel"
                className="border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Telephone"
                value={expediteur.tel}
                onChange={e => setExpediteur(p => ({ ...p, tel: e.target.value }))}
              />
            </div>
          </div>

          {qData.questions.map((q, idx) => {
            if (q.type === 'section') {
              return (
                <div key={q.id} className="pt-2">
                  <h2 className="text-base font-semibold text-foreground border-b border-border pb-2">{q.label || 'Section'}</h2>
                </div>
              );
            }

            const hasError = !!errors[q.id];

            return (
              <div
                key={q.id}
                className={`bg-background rounded-2xl border p-5 space-y-3 transition-colors ${
                  hasError ? 'border-red-300' : 'border-border'
                }`}
              >
                <label className="block text-sm font-medium text-foreground">
                  {q.label}
                  {q.requis && <span className="text-red-500 ml-1">*</span>}
                </label>

                {q.type === 'texte_court' && (
                  <input
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                    value={textValues[q.id] || ''}
                    onChange={e => {
                      setTextValues(p => ({ ...p, [q.id]: e.target.value }));
                      setErrors(p => { const n = { ...p }; delete n[q.id]; return n; });
                    }}
                  />
                )}

                {q.type === 'texte_long' && (
                  <textarea
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                    rows={4}
                    value={textValues[q.id] || ''}
                    onChange={e => {
                      setTextValues(p => ({ ...p, [q.id]: e.target.value }));
                      setErrors(p => { const n = { ...p }; delete n[q.id]; return n; });
                    }}
                  />
                )}

                {q.type === 'date' && (
                  <input
                    type="date"
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                    value={textValues[q.id] || ''}
                    onChange={e => {
                      setTextValues(p => ({ ...p, [q.id]: e.target.value }));
                      setErrors(p => { const n = { ...p }; delete n[q.id]; return n; });
                    }}
                  />
                )}

                {q.type === 'choix_unique' && (
                  <div className="space-y-2">
                    {q.options.map(opt => (
                      <label key={opt} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <input
                          type="radio"
                          name={`radio_${q.id}`}
                          checked={choiceValues[q.id] === opt}
                          onChange={() => toggleChoice(q.id, opt, false)}
                          className="h-4 w-4 text-primary"
                        />
                        <span className="text-sm">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'choix_multiple' && (
                  <div className="space-y-2">
                    {q.options.map(opt => {
                      const vals = (choiceValues[q.id] as string[]) || [];
                      return (
                        <label key={opt} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={vals.includes(opt)}
                            onChange={() => toggleChoice(q.id, opt, true)}
                            className="h-4 w-4 rounded text-primary"
                          />
                          <span className="text-sm">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {q.type === 'fichier' && (
                  <div className="space-y-2">
                    <div
                      className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      onClick={() => fileInputRefs.current[q.id]?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        addFiles(q.id, Array.from(e.dataTransfer.files));
                      }}
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Cliquez ou glissez vos fichiers ici
                      </p>
                      {q.typesAcceptes && (
                        <p className="text-xs text-muted-foreground/60 mt-1">{q.typesAcceptes}</p>
                      )}
                      <input
                        type="file"
                        multiple
                        accept={q.typesAcceptes || undefined}
                        className="hidden"
                        ref={el => { fileInputRefs.current[q.id] = el; }}
                        onChange={e => addFiles(q.id, Array.from(e.target.files || []))}
                      />
                    </div>
                    {(fileValues[q.id] || []).length > 0 && (
                      <div className="space-y-2">
                        {fileValues[q.id].map((f, i) => (
                          <div key={i} className="flex items-center gap-3 bg-muted/50 rounded-lg px-3 py-2">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm flex-1 truncate">{f.name}</span>
                            <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                            <button type="button" onClick={() => removeFile(q.id, i)}
                              className="p-0.5 hover:bg-red-100 text-red-400 rounded transition-colors">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {hasError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {errors[q.id]}
                  </p>
                )}
              </div>
            );
          })}

          {submitError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Envoi en cours...
              </>
            ) : 'Envoyer mes reponses'}
          </button>
        </form>
      </div>
    </div>
  );
}
