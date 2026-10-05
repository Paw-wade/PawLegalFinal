'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { questionnairesAPI, dossiersAPI } from '@/lib/api';
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Copy, Check,
  ExternalLink, Link2, Paperclip, FolderOpen, Eye, EyeOff
} from 'lucide-react';

type QuestionType = 'texte_court' | 'texte_long' | 'choix_unique' | 'choix_multiple' | 'date' | 'fichier' | 'section';

interface Question {
  id: string;
  type: QuestionType;
  label: string;
  requis: boolean;
  options: string[];
  typesAcceptes: string;
}

interface Questionnaire {
  _id: string;
  titre: string;
  description: string;
  statut: 'brouillon' | 'actif' | 'clos';
  questions: Question[];
  publicUrl: string;
  dossier?: { _id: string; reference: string; clientNom: string } | null;
  expiresAt?: string | null;
}

interface FichierReponse {
  _id: string;
  nomOriginal: string;
  url: string;
  taille: number;
  typeMime: string;
  rattacheCommeDocumentId: string | null;
}

interface ReponseItem {
  questionId: string;
  valeur: unknown;
  fichiers: FichierReponse[];
}

interface Reponse {
  _id: string;
  reponses: ReponseItem[];
  expediteur: { nom: string; email: string; tel: string };
  dossierRattache?: { _id: string; reference: string; clientNom: string } | null;
  lu: boolean;
  createdAt: string;
}

const TYPE_LABELS: Record<QuestionType, string> = {
  texte_court: 'Texte court',
  texte_long: 'Texte long',
  choix_unique: 'Choix unique',
  choix_multiple: 'Choix multiple',
  date: 'Date',
  fichier: 'Fichier(s)',
  section: 'Section / titre',
};

const STATUT_COLORS: Record<string, string> = {
  brouillon: 'bg-gray-100 text-gray-600',
  actif: 'bg-green-100 text-green-700',
  clos: 'bg-red-100 text-red-600',
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
  return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function QuestionnaireDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;

  const [tab, setTab] = useState<'questions' | 'reponses'>(
    searchParams?.get('tab') === 'reponses' ? 'reponses' : 'questions'
  );
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [reponses, setReponses] = useState<Reponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [expandedReponse, setExpandedReponse] = useState<string | null>(null);
  const [dossierInput, setDossierInput] = useState('');
  const [dossierOptions, setDossierOptions] = useState<any[]>([]);
  const [rattacherModal, setRattacherModal] = useState<{ reponseId: string; fichierId: string; nomOriginal: string } | null>(null);
  const [rattacherDossierId, setRattacherDossierId] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // Champs editables
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [statut, setStatut] = useState<'brouillon' | 'actif' | 'clos'>('brouillon');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [lieDossier, setLieDossier] = useState<string>('');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await questionnairesAPI.get(id);
      const q: Questionnaire = r.data.questionnaire;
      setQuestionnaire(q);
      setTitre(q.titre);
      setDescription(q.description || '');
      setStatut(q.statut);
      setQuestions(q.questions || []);
      setExpiresAt(q.expiresAt ? q.expiresAt.slice(0, 10) : '');
      setLieDossier(q.dossier?._id || '');
    } catch {
      showToast('Impossible de charger le questionnaire.', 'err');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    load();
  }, [status, load]);

  useEffect(() => {
    if (tab !== 'reponses' || !id) return;
    questionnairesAPI.listReponses(id)
      .then(r => setReponses(r.data.reponses || []))
      .catch(() => showToast('Erreur lors du chargement des reponses.', 'err'));
  }, [tab, id]);

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await questionnairesAPI.update(id, {
        titre,
        description,
        statut,
        questions,
        expiresAt: expiresAt || null,
        dossier: lieDossier || null,
      });
      showToast('Questionnaire enregistre.', 'ok');
      await load();
    } catch {
      showToast('Erreur lors de la sauvegarde.', 'err');
    } finally {
      setSaving(false);
    }
  }

  function addQuestion() {
    setQuestions(prev => [
      ...prev,
      { id: uid(), type: 'texte_court', label: '', requis: false, options: [], typesAcceptes: '' },
    ]);
  }

  function removeQuestion(idx: number) {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  }

  function moveQuestion(idx: number, dir: -1 | 1) {
    setQuestions(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return next;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function updateQuestion(idx: number, patch: Partial<Question>) {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q));
  }

  function updateOption(qIdx: number, oIdx: number, val: string) {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const opts = [...q.options];
      opts[oIdx] = val;
      return { ...q, options: opts };
    }));
  }

  function addOption(qIdx: number) {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      return { ...q, options: [...q.options, ''] };
    }));
  }

  function removeOption(qIdx: number, oIdx: number) {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      return { ...q, options: q.options.filter((_, j) => j !== oIdx) };
    }));
  }

  function copyUrl() {
    if (!questionnaire) return;
    navigator.clipboard.writeText(questionnaire.publicUrl).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  }

  async function handleRattacherDossier(reponseId: string, dossierId: string | null) {
    try {
      await questionnairesAPI.rattacherDossier(reponseId, dossierId);
      setReponses(prev => prev.map(r => {
        if (r._id !== reponseId) return r;
        return { ...r, dossierRattache: dossierId ? { _id: dossierId, reference: '', clientNom: '' } : null };
      }));
      showToast(dossierId ? 'Rattache au dossier.' : 'Rattachement supprime.', 'ok');
    } catch {
      showToast('Erreur lors du rattachement.', 'err');
    }
  }

  async function handleRattacherFichier() {
    if (!rattacherModal || !rattacherDossierId) return;
    try {
      await questionnairesAPI.rattacherFichier(rattacherModal.reponseId, {
        fichierId: rattacherModal.fichierId,
        dossierId: rattacherDossierId,
        nom: rattacherModal.nomOriginal,
      });
      showToast('Fichier rattache au dossier.', 'ok');
      setRattacherModal(null);
      setRattacherDossierId('');
      // Refresh reponses
      const r = await questionnairesAPI.listReponses(id);
      setReponses(r.data.reponses || []);
    } catch {
      showToast('Erreur lors du rattachement.', 'err');
    }
  }

  function renderValeur(q: Question | undefined, item: ReponseItem) {
    if (!q) return <span className="text-muted-foreground text-xs">Question inconnue</span>;
    if (q.type === 'fichier') {
      if (!item.fichiers || item.fichiers.length === 0) {
        return <span className="text-muted-foreground text-xs italic">Aucun fichier</span>;
      }
      return (
        <div className="space-y-2 mt-1">
          {item.fichiers.map(f => (
            <div key={f._id} className="flex items-center gap-3 bg-muted/50 rounded-lg px-3 py-2">
              <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <a href={f.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline truncate block">
                  {f.nomOriginal}
                </a>
                <span className="text-xs text-muted-foreground">{formatBytes(f.taille)}</span>
              </div>
              {f.rattacheCommeDocumentId ? (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> Rattache
                </span>
              ) : (
                <button
                  onClick={() => {
                    setRattacherModal({ reponseId: expandedReponse!, fichierId: f._id, nomOriginal: f.nomOriginal });
                    setRattacherDossierId('');
                  }}
                  className="text-xs px-2 py-1 border border-primary text-primary rounded hover:bg-primary/10 transition-colors flex items-center gap-1"
                >
                  <FolderOpen className="h-3 w-3" /> Rattacher
                </button>
              )}
            </div>
          ))}
        </div>
      );
    }
    if (Array.isArray(item.valeur)) {
      return <span className="text-sm">{item.valeur.join(', ') || <span className="text-muted-foreground italic">-</span>}</span>;
    }
    return <span className="text-sm">{String(item.valeur ?? ''  ) || <span className="text-muted-foreground italic">-</span>}</span>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {rattacherModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold">Rattacher au dossier</h3>
            <p className="text-sm text-muted-foreground">{rattacherModal.nomOriginal}</p>
            <div>
              <label className="block text-sm font-medium mb-1">ID du dossier</label>
              <input
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="ID MongoDB du dossier"
                value={rattacherDossierId}
                onChange={e => setRattacherDossierId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Collez l'identifiant du dossier cible.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRattacherFichier}
                disabled={!rattacherDossierId.trim()}
                className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                Rattacher
              </button>
              <button
                onClick={() => setRattacherModal(null)}
                className="flex-1 py-2 border border-input rounded-lg text-sm hover:bg-muted transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/questionnaires" className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold text-foreground flex-1 truncate">{titre || 'Questionnaire'}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[statut]}`}>
          {statut}
        </span>
      </div>

      <div className="flex border-b border-border mb-6">
        {(['questions', 'reponses'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'questions' ? 'Questions' : `Reponses${reponses.length > 0 ? ` (${reponses.length})` : ''}`}
          </button>
        ))}
      </div>

      {tab === 'questions' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-sm">Parametres generaux</h2>
            <div>
              <label className="block text-sm font-medium mb-1">Titre</label>
              <input
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={titre}
                onChange={e => setTitre(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description (optionnel)</label>
              <textarea
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Statut</label>
                <select
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={statut}
                  onChange={e => setStatut(e.target.value as typeof statut)}
                >
                  <option value="brouillon">Brouillon</option>
                  <option value="actif">Actif (ouvert)</option>
                  <option value="clos">Clos</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Expiration (optionnel)</label>
                <input
                  type="date"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={expiresAt}
                  onChange={e => setExpiresAt(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Dossier lie (ID)</label>
                <input
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="ID dossier (optionnel)"
                  value={lieDossier}
                  onChange={e => setLieDossier(e.target.value)}
                />
              </div>
            </div>
            {statut === 'actif' && questionnaire && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground flex-1 truncate">{questionnaire.publicUrl}</span>
                <button
                  onClick={copyUrl}
                  className="flex-shrink-0 text-xs px-3 py-1 border border-input rounded-md hover:bg-muted transition-colors flex items-center gap-1"
                >
                  {copiedUrl ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedUrl ? 'Copie !' : 'Copier le lien'}
                </button>
                <a href={questionnaire.publicUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-shrink-0 p-1 hover:text-primary transition-colors">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Questions ({questions.length})</h2>
              <button
                onClick={addQuestion}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-primary text-primary rounded-lg hover:bg-primary/10 transition-colors"
              >
                <Plus className="h-4 w-4" /> Ajouter
              </button>
            </div>

            {questions.length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                Aucune question. Cliquez sur "Ajouter" pour commencer.
              </div>
            )}

            {questions.map((q, idx) => (
              <div key={q.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-0.5 mt-1">
                    <button onClick={() => moveQuestion(idx, -1)} disabled={idx === 0}
                      className="p-0.5 hover:bg-muted rounded disabled:opacity-30 transition-colors">
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button onClick={() => moveQuestion(idx, 1)} disabled={idx === questions.length - 1}
                      className="p-0.5 hover:bg-muted rounded disabled:opacity-30 transition-colors">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex gap-3 flex-wrap">
                      <select
                        className="border border-input rounded-lg px-2 py-1.5 text-xs bg-background"
                        value={q.type}
                        onChange={e => updateQuestion(idx, { type: e.target.value as QuestionType })}
                      >
                        {(Object.keys(TYPE_LABELS) as QuestionType[]).map(t => (
                          <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                      {q.type !== 'section' && (
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={q.requis}
                            onChange={e => updateQuestion(idx, { requis: e.target.checked })}
                            className="rounded"
                          />
                          Obligatoire
                        </label>
                      )}
                    </div>
                    <input
                      className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                      placeholder={q.type === 'section' ? 'Titre de la section' : 'Intitule de la question'}
                      value={q.label}
                      onChange={e => updateQuestion(idx, { label: e.target.value })}
                    />
                    {(q.type === 'choix_unique' || q.type === 'choix_multiple') && (
                      <div className="space-y-2">
                        {q.options.map((opt, oIdx) => (
                          <div key={oIdx} className="flex gap-2">
                            <input
                              className="flex-1 border border-input rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                              placeholder={`Option ${oIdx + 1}`}
                              value={opt}
                              onChange={e => updateOption(idx, oIdx, e.target.value)}
                            />
                            <button onClick={() => removeOption(idx, oIdx)}
                              className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => addOption(idx)}
                          className="text-xs text-primary hover:underline flex items-center gap-1">
                          <Plus className="h-3.5 w-3.5" /> Ajouter une option
                        </button>
                      </div>
                    )}
                    {q.type === 'fichier' && (
                      <input
                        className="w-full border border-input rounded-lg px-3 py-1.5 text-xs bg-background"
                        placeholder="Types acceptes (ex: image/*,.pdf) - laisser vide pour tout"
                        value={q.typesAcceptes}
                        onChange={e => updateQuestion(idx, { typesAcceptes: e.target.value })}
                      />
                    )}
                  </div>
                  <button onClick={() => removeQuestion(idx)}
                    className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg transition-colors mt-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !titre.trim()}
              className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {tab === 'reponses' && (
        <div className="space-y-3">
          {reponses.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
              Aucune reponse pour le moment.
            </div>
          ) : reponses.map(r => (
            <div key={r._id} className="bg-card border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedReponse(prev => prev === r._id ? null : r._id)}
                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-sm">{r.expediteur.nom || 'Anonyme'}</span>
                    {!r.lu && (
                      <span className="text-xs px-1.5 py-0.5 bg-primary text-white rounded-full">Nouveau</span>
                    )}
                    {r.dossierRattache && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <FolderOpen className="h-3 w-3" />
                        {r.dossierRattache.reference || r.dossierRattache.clientNom}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                    {r.expediteur.email && <span>{r.expediteur.email}</span>}
                    {r.expediteur.tel && <span>{r.expediteur.tel}</span>}
                    <span>{new Date(r.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                {expandedReponse === r._id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {expandedReponse === r._id && (
                <div className="px-5 pb-5 space-y-4 border-t border-border">
                  <div className="pt-4 space-y-4">
                    {r.reponses.map(item => {
                      const q = questionnaire?.questions.find(x => x.id === item.questionId);
                      return (
                        <div key={item.questionId}>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            {q?.label || item.questionId}
                          </p>
                          {renderValeur(q, item)}
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-3 border-t border-border">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-muted-foreground">Rattacher au dossier :</span>
                      {r.dossierRattache ? (
                        <>
                          <span className="text-xs text-green-700 font-medium">
                            {r.dossierRattache.reference || r.dossierRattache.clientNom || r.dossierRattache._id}
                          </span>
                          <button
                            onClick={() => handleRattacherDossier(r._id, null)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Retirer
                          </button>
                        </>
                      ) : (
                        <DossierSelector
                          onSelect={dossierId => handleRattacherDossier(r._id, dossierId)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DossierSelector({ onSelect }: { onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function search(q: string) {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await dossiersAPI.getAllDossiers({ search: q });
      setResults((r?.data?.dossiers || r?.data?.data || []).slice(0, 8));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1 border border-input rounded-md hover:bg-muted transition-colors"
      >
        Choisir un dossier
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        autoFocus
        className="border border-input rounded-lg px-2 py-1 text-xs bg-background w-48 focus:outline-none focus:ring-2 focus:ring-primary/40"
        placeholder="Rechercher un dossier..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {loading && <span className="text-xs text-muted-foreground">...</span>}
      {results.length > 0 && (
        <div className="absolute bg-background border border-border rounded-lg shadow-lg mt-1 z-20 max-w-xs w-full">
          {results.map((d: any) => (
            <button
              key={d._id}
              onClick={() => { onSelect(d._id); setOpen(false); setQuery(''); setResults([]); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors"
            >
              <span className="font-medium">{d.reference || d._id}</span>
              {d.clientNom && <span className="text-muted-foreground ml-2">{d.clientNom}</span>}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen(false)}
        className="text-xs text-muted-foreground hover:underline"
      >
        Annuler
      </button>
    </div>
  );
}
