'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { questionnairesAPI, dossiersAPI } from '@/lib/api';
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Copy, Check,
  ExternalLink, Link2, Paperclip, FolderOpen, Eye, EyeOff, X
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

interface DossierOption {
  _id: string;
  titre?: string;
  clientNom?: string;
  clientPrenom?: string;
  reference?: string;
}

function dossierOptionLabel(d: DossierOption): string {
  const client = [d.clientPrenom, d.clientNom].filter(Boolean).join(' ');
  const parts: string[] = [];
  if (d.titre) parts.push(d.titre);
  if (client) parts.push(client);
  if (d.reference) parts.push(d.reference);
  return parts.join(' - ') || d._id;
}

function DossierPicker({
  selectedId,
  selectedLabel,
  onSelect,
  placeholder = 'Rechercher un dossier...',
}: {
  selectedId: string;
  selectedLabel: string;
  onSelect: (id: string, label: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<DossierOption[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setOptions([]); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await dossiersAPI.getAllDossiers({ search: query });
        setOptions((r.data.dossiers || []).slice(0, 8));
      } catch { /* ignore */ }
    }, 300);
  }, [query]);

  function select(d: DossierOption) {
    const label = dossierOptionLabel(d);
    onSelect(d._id, label);
    setQuery('');
    setOpen(false);
    setOptions([]);
  }

  function clear() {
    onSelect('', '');
    setQuery('');
    setOptions([]);
  }

  return (
    <div ref={containerRef} className="relative">
      {selectedId && !open ? (
        <div className="flex items-center gap-2 border border-input rounded-lg px-3 py-2 text-sm bg-background cursor-pointer"
          onClick={() => setOpen(true)}>
          <FolderOpen className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="flex-1 truncate text-foreground">{selectedLabel || selectedId}</span>
          <button type="button" onClick={e => { e.stopPropagation(); clear(); }}
            className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <input
          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
          placeholder={placeholder}
          value={query}
          autoFocus={open}
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
        />
      )}
      {open && options.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 border border-border rounded-lg bg-background shadow-lg max-h-56 overflow-y-auto">
          {options.map(d => (
            <li key={d._id}>
              <button type="button" onMouseDown={() => select(d)}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors">
                <p className="font-medium truncate">{d.titre || 'Sans titre'}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[d.clientPrenom, d.clientNom].filter(Boolean).join(' ')}
                  {d.reference ? ` - ${d.reference}` : ''}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.length > 0 && options.length === 0 && (
        <div className="absolute z-50 w-full mt-1 border border-border rounded-lg bg-background shadow-lg px-3 py-3 text-sm text-muted-foreground">
          Aucun dossier trouve.
        </div>
      )}
    </div>
  );
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
  const [rattacherModal, setRattacherModal] = useState<{ reponseId: string; fichierId: string; nomOriginal: string } | null>(null);
  const [rattacherDossierId, setRattacherDossierId] = useState('');
  const [rattacherDossierLabel, setRattacherDossierLabel] = useState('');
  const [creerDossierModal, setCreerDossierModal] = useState<{ reponseId: string } | null>(null);
  const [creerPrenom, setCreerPrenom] = useState('');
  const [creerNom, setCreerNom] = useState('');
  const [creerEmail, setCreerEmail] = useState('');
  const [creerTel, setCreerTel] = useState('');
  const [creerTitre, setCreerTitre] = useState('');
  const [creerCategorie, setCreerCategorie] = useState('autre');
  const [creerLoading, setCreerLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // Champs editables
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [statut, setStatut] = useState<'brouillon' | 'actif' | 'clos'>('brouillon');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [lieDossier, setLieDossier] = useState<string>('');
  const [lieDossierLabel, setLieDossierLabel] = useState<string>('');

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
      if (q.dossier) {
        const client = [q.dossier.clientNom].filter(Boolean).join(' ');
        setLieDossierLabel([q.dossier.reference, client].filter(Boolean).join(' - ') || q.dossier._id);
      }
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
      setRattacherDossierLabel('');
      // Refresh reponses
      const r = await questionnairesAPI.listReponses(id);
      setReponses(r.data.reponses || []);
    } catch {
      showToast('Erreur lors du rattachement.', 'err');
    }
  }

  function openCreerDossierModal(r: Reponse) {
    setCreerPrenom('');
    setCreerNom(r.expediteur.nom || '');
    setCreerEmail(r.expediteur.email || '');
    setCreerTel(r.expediteur.tel || '');
    setCreerTitre(questionnaire ? `Demande - ${questionnaire.titre}` : '');
    setCreerCategorie('autre');
    setCreerDossierModal({ reponseId: r._id });
  }

  async function handleCreerDossier() {
    if (!creerDossierModal) return;
    if (!creerNom.trim() || !creerPrenom.trim()) {
      showToast('Nom et prenom obligatoires.', 'err');
      return;
    }
    setCreerLoading(true);
    try {
      const res = await questionnairesAPI.creerDossier(creerDossierModal.reponseId, {
        prenom: creerPrenom.trim(),
        nom: creerNom.trim(),
        email: creerEmail.trim(),
        tel: creerTel.trim(),
        titre: creerTitre.trim() || `Demande de ${creerPrenom.trim()} ${creerNom.trim()}`,
        categorie: creerCategorie,
      });
      const newDossier = res.data.dossier;
      setReponses(prev => prev.map(rep =>
        rep._id === creerDossierModal.reponseId
          ? { ...rep, dossierRattache: { _id: newDossier._id, reference: newDossier.reference || '', clientNom: `${creerPrenom.trim()} ${creerNom.trim()}` } }
          : rep
      ));
      const msgs: string[] = ['Dossier cree et rattache.'];
      if (res.data.invitationSent) msgs.push('Invitation envoyee par email.');
      if (res.data.smsSent) msgs.push('SMS envoye.');
      showToast(msgs.join(' '), 'ok');
      setCreerDossierModal(null);
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Erreur lors de la creation du dossier.', 'err');
    } finally {
      setCreerLoading(false);
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
                    setRattacherDossierLabel('');
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
              <label className="block text-sm font-medium mb-1">Dossier cible</label>
              <DossierPicker
                selectedId={rattacherDossierId}
                selectedLabel={rattacherDossierLabel}
                onSelect={(id, label) => { setRattacherDossierId(id); setRattacherDossierLabel(label); }}
                placeholder="Rechercher par nom, reference..."
              />
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
                onClick={() => { setRattacherModal(null); setRattacherDossierLabel(''); }}
                className="flex-1 py-2 border border-input rounded-lg text-sm hover:bg-muted transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {creerDossierModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Creer un dossier</h3>
              <button type="button" onClick={() => setCreerDossierModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Prenom <span className="text-red-500">*</span></label>
                <input
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={creerPrenom}
                  onChange={e => setCreerPrenom(e.target.value)}
                  placeholder="Prenom"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Nom <span className="text-red-500">*</span></label>
                <input
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={creerNom}
                  onChange={e => setCreerNom(e.target.value)}
                  placeholder="Nom de famille"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Email</label>
              <input
                type="email"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={creerEmail}
                onChange={e => setCreerEmail(e.target.value)}
                placeholder="email@exemple.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Telephone</label>
              <input
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={creerTel}
                onChange={e => setCreerTel(e.target.value)}
                placeholder="+33 6 00 00 00 00"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Titre du dossier</label>
              <input
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={creerTitre}
                onChange={e => setCreerTitre(e.target.value)}
                placeholder="Ex: Demande titre de sejour"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Categorie</label>
              <select
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={creerCategorie}
                onChange={e => setCreerCategorie(e.target.value)}
              >
                <option value="sejour_titres">Titres de sejour</option>
                <option value="contentieux_administratif">Contentieux administratif</option>
                <option value="asile">Asile</option>
                <option value="regroupement_familial">Regroupement familial</option>
                <option value="nationalite_francaise">Nationalite francaise</option>
                <option value="eloignement_urgence">Eloignement / urgence</option>
                <option value="constitution_societe">Constitution de societe</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            {creerEmail && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                Un email sera envoye a {creerEmail}. Si aucun compte n'existe, une invitation a s'inscrire sera incluse.
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleCreerDossier}
                disabled={creerLoading || !creerNom.trim() || !creerPrenom.trim()}
                className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                {creerLoading ? 'Creation...' : 'Creer le dossier'}
              </button>
              <button
                onClick={() => setCreerDossierModal(null)}
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
                <label className="block text-sm font-medium mb-1">Dossier lie</label>
                <DossierPicker
                  selectedId={lieDossier}
                  selectedLabel={lieDossierLabel}
                  onSelect={(id, label) => { setLieDossier(id); setLieDossierLabel(label); }}
                  placeholder="Rechercher par nom, reference..."
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

                  <div className="pt-3 border-t border-border space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-muted-foreground">Rattacher au dossier :</span>
                      {r.dossierRattache ? (
                        <>
                          <span className="text-xs text-green-700 font-medium flex items-center gap-1">
                            <FolderOpen className="h-3 w-3" />
                            {r.dossierRattache.clientNom || r.dossierRattache.reference || r.dossierRattache._id}
                          </span>
                          <button
                            onClick={() => handleRattacherDossier(r._id, null)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Retirer
                          </button>
                        </>
                      ) : (
                        <>
                          <DossierSelector
                            onSelect={(dossierId, dossierLabel) => {
                              setReponses(prev => prev.map(rep =>
                                rep._id === r._id
                                  ? { ...rep, dossierRattache: { _id: dossierId, reference: '', clientNom: dossierLabel } }
                                  : rep
                              ));
                              handleRattacherDossier(r._id, dossierId);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => openCreerDossierModal(r)}
                            className="text-xs px-3 py-1 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors flex items-center gap-1"
                          >
                            <Plus className="h-3 w-3" /> Creer un dossier
                          </button>
                        </>
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

function DossierSelector({ onSelect }: { onSelect: (id: string, label: string) => void }) {
  const [query, setQuery] = useState('');
  const [allDossiers, setAllDossiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function makeDossierLabel(d: any): string {
    const client = [d.clientPrenom, d.clientNom].filter(Boolean).join(' ');
    const parts: string[] = [];
    if (d.titre) parts.push(d.titre);
    if (client) parts.push(client);
    if (d.reference) parts.push(d.reference);
    return parts.join(' - ') || 'Dossier sans titre';
  }

  async function loadDossiers(q: string) {
    setLoading(true);
    try {
      const r = await dossiersAPI.getAllDossiers(q.trim() ? { search: q } : {});
      setAllDossiers((r?.data?.dossiers || []).slice(0, 30));
    } catch {
      setAllDossiers([]);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    loadDossiers('');
    // Positionner le dropdown en fixed par rapport au viewport
    setTimeout(() => {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setDropdownStyle({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) });
      }
    }, 0);
  }

  useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => loadDossiers(query), 300);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (inputRef.current && !inputRef.current.contains(target)) {
        // Laisser onMouseDown des items s'executer avant de fermer
        setTimeout(() => setOpen(false), 150);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="text-xs px-3 py-1 border border-input rounded-md hover:bg-muted transition-colors flex items-center gap-1"
      >
        <FolderOpen className="h-3 w-3" /> Choisir un dossier
      </button>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        autoFocus
        className="border border-input rounded-lg px-2.5 py-1.5 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[220px] flex-1"
        placeholder="Filtrer par nom, titre, reference..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div
        style={{ position: 'fixed', top: dropdownStyle.top, left: dropdownStyle.left, width: dropdownStyle.width, zIndex: 9999 }}
        className="border border-border rounded-lg bg-background shadow-xl max-h-64 overflow-y-auto"
      >
        {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Chargement...</p>}
        {!loading && allDossiers.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Aucun dossier trouve.</p>
        )}
        {!loading && allDossiers.map((d: any) => {
          const label = makeDossierLabel(d);
          const client = [d.clientPrenom, d.clientNom].filter(Boolean).join(' ');
          return (
            <button
              key={d._id}
              type="button"
              onMouseDown={() => { onSelect(d._id, label); setOpen(false); setQuery(''); }}
              className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
            >
              <p className="text-xs font-semibold text-foreground truncate">{d.titre || 'Sans titre'}</p>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {client && <span>{client}</span>}
                {d.reference && <span className="ml-1 text-primary/80">- {d.reference}</span>}
              </p>
            </button>
          );
        })}
      </div>
    </>
  );
}
