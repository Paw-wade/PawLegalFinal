'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { questionnairesAPI } from '@/lib/api';
import { Plus, Copy, Check, ExternalLink, Trash2, MessageSquare, ClipboardList } from 'lucide-react';

interface Questionnaire {
  _id: string;
  titre: string;
  description: string;
  statut: 'brouillon' | 'actif' | 'clos';
  publicUrl: string;
  nbReponses: number;
  nbNonLus: number;
  dossier?: { _id: string; reference: string; clientNom: string } | null;
  createdAt: string;
}

const STATUT_LABELS: Record<string, string> = {
  brouillon: 'Brouillon',
  actif: 'Actif',
  clos: 'Clos',
};
const STATUT_COLORS: Record<string, string> = {
  brouillon: 'bg-gray-100 text-gray-600',
  actif: 'bg-green-100 text-green-700',
  clos: 'bg-red-100 text-red-600',
};

export default function QuestionnairesAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitre, setNewTitre] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    questionnairesAPI.list()
      .then(r => setQuestionnaires(r.data.questionnaires || []))
      .catch(() => showToast('Erreur lors du chargement.', 'err'))
      .finally(() => setLoading(false));
  }, [status]);

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitre.trim()) return;
    try {
      const r = await questionnairesAPI.create({ titre: newTitre.trim(), statut: 'brouillon' });
      const q = r.data.questionnaire;
      router.push(`/admin/questionnaires/${q._id}`);
    } catch {
      showToast('Erreur lors de la creation.', 'err');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce questionnaire et toutes ses reponses ?')) return;
    try {
      await questionnairesAPI.remove(id);
      setQuestionnaires(prev => prev.filter(q => q._id !== id));
      showToast('Questionnaire supprime.', 'ok');
    } catch {
      showToast('Erreur lors de la suppression.', 'err');
    }
  }

  function copyUrl(url: string, id: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Questionnaires</h1>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nouveau questionnaire
        </button>
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Nouveau questionnaire</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Titre</label>
                <input
                  autoFocus
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Ex: Informations complementaires OQTF"
                  value={newTitre}
                  onChange={e => setNewTitre(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={!newTitre.trim()}
                  className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Creer et editer
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewTitre(''); }}
                  className="flex-1 py-2 border border-input rounded-lg text-sm hover:bg-muted transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {questionnaires.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucun questionnaire cree.</p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Creer le premier questionnaire
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {questionnaires.map(q => (
            <div
              key={q._id}
              className="bg-card border border-border rounded-xl p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link
                      href={`/admin/questionnaires/${q._id}`}
                      className="font-semibold text-foreground hover:text-primary transition-colors truncate"
                    >
                      {q.titre}
                    </Link>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[q.statut]}`}>
                      {STATUT_LABELS[q.statut]}
                    </span>
                    {q.nbNonLus > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary text-white">
                        {q.nbNonLus} nouvelle{q.nbNonLus > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {q.description && (
                    <p className="text-sm text-muted-foreground mt-1 truncate">{q.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {q.nbReponses} reponse{q.nbReponses !== 1 ? 's' : ''}
                    </span>
                    {q.dossier && (
                      <span>Dossier : {q.dossier.reference || q.dossier.clientNom}</span>
                    )}
                    <span>{new Date(q.createdAt).toLocaleDateString('fr-FR')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {q.statut === 'actif' && (
                    <button
                      onClick={() => copyUrl(q.publicUrl, q._id)}
                      title="Copier le lien client"
                      className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                    >
                      {copiedId === q._id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                  )}
                  <Link
                    href={`/admin/questionnaires/${q._id}`}
                    title="Editer"
                    className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => handleDelete(q._id)}
                    title="Supprimer"
                    className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
