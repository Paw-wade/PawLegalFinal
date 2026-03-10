'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { forumAPI } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { FORUM_THEMES, getThemeLabel, type ForumThemeValue } from './forum-utils';

interface ForumThread {
  _id: string;
  title: string;
  body: string;
  theme?: string;
  repliesCount: number;
  viewsCount: number;
  createdAt: string;
  status?: string;
  isPinned?: boolean;
  createdBy?: {
    prenom?: string;
    nom?: string;
    role?: string;
  };
}

interface ThreadsResponse {
  success: boolean;
  data: ForumThread[];
  page: number;
  totalPages: number;
  total: number;
}

const STATUS_FILTERS = [
  { value: 'all' as const, label: 'Toutes' },
  { value: 'pinned' as const, label: 'Épinglées' },
  { value: 'resolved' as const, label: 'Résolues' },
  { value: 'archived' as const, label: 'Archivées' },
] as const;
type StatusFilterValue = typeof STATUS_FILTERS[number]['value'];

export default function ForumPage() {
  const { status, data: session } = useSession();
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [sidebarThreads, setSidebarThreads] = useState<ForumThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarLoading, setSidebarLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [theme, setTheme] = useState<ForumThemeValue>('autres');
  const [creating, setCreating] = useState(false);
  const [filterTheme, setFilterTheme] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<StatusFilterValue>('all');
  const [rulesCollapsed, setRulesCollapsed] = useState(true);
  const [createStep, setCreateStep] = useState(0);

  const userRole = (session?.user as any)?.role || 'client';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  // Liste principale : filtrée par thème et par statut (épinglées / résolues / archivées)
  useEffect(() => {
    const loadThreads = async () => {
      try {
        setLoading(true);
        setError(null);
        const params: { page: number; limit: number; theme?: string; statusFilter?: 'archived' | 'pinned' | 'resolved' } = { page: 1, limit: 50 };
        if (filterTheme != null && filterTheme !== '') {
          params.theme = filterTheme;
        }
        if (filterStatus !== 'all') {
          params.statusFilter = filterStatus as 'archived' | 'pinned' | 'resolved';
        }
        const response = await forumAPI.listThreads(params);
        const data = response.data as ThreadsResponse;
        if (data.success) {
          setThreads(data.data);
        } else {
          setError("Impossible de charger les discussions.");
        }
      } catch (err: any) {
        console.error('Erreur lors du chargement des discussions:', err);
        setError("Une erreur est survenue lors du chargement des discussions.");
      } finally {
        setLoading(false);
      }
    };

    loadThreads();
  }, [filterTheme, filterStatus]);

  // Barre latérale : toujours toutes les discussions, du plus récent au plus ancien (sans filtre thème ni statut)
  useEffect(() => {
    const loadSidebarThreads = async () => {
      try {
        setSidebarLoading(true);
        const response = await forumAPI.listThreads({ page: 1, limit: 50 });
        const data = response.data as ThreadsResponse;
        if (data.success) {
          setSidebarThreads(data.data);
        }
      } catch (err: any) {
        console.error('Erreur chargement sidebar forum:', err);
      } finally {
        setSidebarLoading(false);
      }
    };

    loadSidebarThreads();
  }, []);

  const handleCreateThread = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    // Lire le thème depuis le formulaire (source de vérité) pour éviter tout décalage avec le state
    const form = e.currentTarget;
    const themeField = form.elements.namedItem('theme') as HTMLSelectElement | null;
    const themeValue = (themeField?.value && FORUM_THEMES.some((t) => t.value === themeField.value))
      ? themeField.value
      : 'autres';

    try {
      setCreating(true);
      setError(null);
      const response = await forumAPI.createThread({
        title: title.trim(),
        body: body.trim(),
        theme: themeValue,
      });
      const created = response.data?.data as ForumThread;
      if (created) {
        setTitle('');
        setBody('');
        setTheme('autres');
        setCreateStep(0);
        // Mettre à jour la barre latérale : toujours afficher la nouvelle discussion en tête
        setSidebarThreads((prev) => [created, ...prev]);
        // Liste principale : si filtre actif, recharger ; sinon préfixer avec la nouvelle discussion
        if (filterTheme != null && filterTheme !== '') {
          const params: { page: number; limit: number; theme?: string; statusFilter?: 'archived' | 'pinned' | 'resolved' } = { page: 1, limit: 50 };
          params.theme = filterTheme;
          if (filterStatus !== 'all') params.statusFilter = filterStatus as 'archived' | 'pinned' | 'resolved';
          const res = await forumAPI.listThreads(params);
          const data = res.data as ThreadsResponse;
          if (data.success) setThreads(data.data);
        } else if (filterStatus === 'all') {
          setThreads((prev) => [created, ...prev]);
        } else {
          const res = await forumAPI.listThreads({ page: 1, limit: 50, statusFilter: filterStatus as 'archived' | 'pinned' | 'resolved' });
          const data = res.data as ThreadsResponse;
          if (data.success) setThreads(data.data);
        }
      }
    } catch (err: any) {
      console.error('Erreur lors de la création de la discussion:', err);
      setError("Impossible de créer la discussion. Vérifiez que vous êtes bien connecté.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Header variant="home" />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <header className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold">Forum ADA Pappers</h1>
          <p className="text-sm md:text-base text-gray-600 mt-2">
            Posez vos questions et échangez avec l&apos;équipe et les autres utilisateurs sur les démarches administratives.
          </p>
        </header>

        {/* Règles du forum (pliable) */}
        <section className="mb-8 bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setRulesCollapsed((c) => !c)}
            className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-amber-50/50 transition-colors"
            aria-expanded={!rulesCollapsed}
          >
            <h2 className="text-sm md:text-base font-semibold text-gray-900">Règles du forum</h2>
            <span className="shrink-0 text-gray-500" aria-hidden>
              {rulesCollapsed ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              )}
            </span>
          </button>
          {!rulesCollapsed && (
            <div className="px-5 pb-5 pt-0 border-t border-amber-100">
              <ul className="list-disc pl-5 space-y-1 text-xs md:text-sm text-gray-700">
                <li>Ne publiez pas de données sensibles : numéros de titre de séjour complets, numéros de passeport, adresses exactes, etc.</li>
                <li>Restez respectueux dans vos échanges, aucun propos discriminatoire ou agressif n&apos;est toléré.</li>
                <li>Les réponses données sur ce forum sont informatives et ne constituent pas un conseil juridique personnalisé.</li>
                <li>Pour une prise en charge complète de votre dossier, utilisez les fonctionnalités de la plateforme et suivez les instructions de votre espace client.</li>
                <li>Les administrateurs se réservent le droit de modifier ou supprimer tout contenu non conforme à ces règles.</li>
              </ul>
            </div>
          )}
        </section>

        <div className="lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] lg:gap-6 items-start">
          {/* Colonne principale */}
          <div className="space-y-8">
            {/* Création d'une nouvelle discussion — compact, champs un par un */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-base font-semibold mb-3">Créer une nouvelle discussion</h2>
              {status !== 'authenticated' ? (
                <div className="text-sm text-gray-700 flex flex-wrap items-center gap-3">
                  <p className="text-gray-600">Connectez-vous pour créer une discussion.</p>
                  <Link
                    href="/auth/signin"
                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-md bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
                  >
                    Se connecter
                  </Link>
                  <Link
                    href="/auth/signup"
                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Créer un compte
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleCreateThread} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="forum-theme" className="text-sm font-medium text-gray-700 shrink-0">
                      Thème
                    </label>
                    <select
                      name="theme"
                      id="forum-theme"
                      value={theme}
                      onFocus={() => setCreateStep((s) => Math.max(s, 1))}
                      onChange={(e) => {
                        setTheme(e.target.value as ForumThemeValue);
                        setCreateStep((s) => Math.max(s, 1));
                      }}
                      className="flex-1 min-w-[180px] rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                      required
                      aria-label="Choisir le thème de la discussion"
                    >
                      {FORUM_THEMES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {createStep >= 1 && (
                    <div className="pt-1">
                      <label htmlFor="forum-title" className="block text-sm font-medium text-gray-700 mb-0.5">
                        Titre
                      </label>
                      <input
                        id="forum-title"
                        type="text"
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          setCreateStep((s) => (e.target.value.trim() ? Math.max(s, 2) : s));
                        }}
                        className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="Ex. : Question sur le renouvellement"
                        maxLength={200}
                      />
                    </div>
                  )}
                  {createStep >= 2 && (
                    <>
                      <div className="pt-1">
                        <label htmlFor="forum-body" className="block text-sm font-medium text-gray-700 mb-0.5">
                          Message
                        </label>
                        <textarea
                          id="forum-body"
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 min-h-[80px]"
                          placeholder="Décrivez votre situation (sans données sensibles)."
                        />
                      </div>
                      {error && (
                        <p className="text-xs text-red-600">{error}</p>
                      )}
                      <div className="flex justify-end pt-1">
                        <button
                          type="submit"
                          disabled={creating || !title.trim() || !body.trim() || !theme}
                          className="inline-flex items-center justify-center px-3 py-1.5 rounded-md bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        >
                          {creating ? 'Publication...' : 'Publier'}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              )}
            </section>

            {/* Filtre par thème */}
            <section className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Thème :</span>
              <button
                type="button"
                onClick={() => setFilterTheme(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterTheme === null ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Tous
              </button>
              {FORUM_THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setFilterTheme(t.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterTheme === t.value ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {t.label}
                </button>
              ))}
            </section>

            {/* Filtre par statut : épinglées, résolues, archivées */}
            <section className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Statut :</span>
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setFilterStatus(s.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterStatus === s.value ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {s.label}
                </button>
              ))}
            </section>

            {/* Liste des discussions détaillée */}
            <section>
              <h2 className="text-lg font-semibold mb-3">Discussions récentes</h2>
              {loading ? (
                <p className="text-sm text-gray-600">Chargement des discussions...</p>
              ) : threads.length === 0 ? (
                <p className="text-sm text-gray-600">
                  Aucune discussion pour le moment. Soyez le premier à poser une question.
                </p>
              ) : (
                <div className="space-y-3">
                  {threads.map((thread) => (
                      <Link
                        key={thread._id}
                        href={`/forum/${thread._id}`}
                        className="block bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] md:text-xs border border-slate-200">
                                {getThemeLabel(thread.theme)}
                              </span>
                              <h3 className="text-sm md:text-base font-semibold text-gray-900">
                                {thread.title}
                              </h3>
                            </div>
                            <p className="mt-1 text-xs md:text-sm text-gray-600 line-clamp-2">
                              {thread.body}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] md:text-xs text-gray-500">
                              <span>
                                {thread.repliesCount || 0} réponse{thread.repliesCount === 1 ? '' : 's'} •{' '}
                                {thread.viewsCount || 0} vue{thread.viewsCount === 1 ? '' : 's'}
                              </span>
                              <span className="flex items-center gap-1">
                                <span>
                                  Par{' '}
                                  {thread.createdBy
                                    ? `${thread.createdBy.prenom || ''} ${thread.createdBy.nom || ''}`.trim() || 'Auteur inconnu'
                                    : 'Auteur inconnu'}
                                </span>
                                <span>•</span>
                                <span>
                                  {thread.createdAt
                                    ? new Date(thread.createdAt).toLocaleDateString('fr-FR')
                                    : ''}
                                </span>
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 text-[10px] md:text-xs text-gray-600">
                            <div className="flex flex-wrap gap-1 justify-end">
                              {thread.status === 'open' && (
                                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                  Ouverte
                                </span>
                              )}
                              {thread.status === 'closed' && (
                                <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                                  Fermée
                                </span>
                              )}
                              {thread.status === 'archived' && (
                                <span className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-100">
                                  Archivée
                                </span>
                              )}
                              {thread.status === 'resolved' && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                                  Résolue
                                </span>
                              )}
                              {thread.isPinned && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                                  Épinglée
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Barre latérale : liste compacte des discussions */}
          <aside className="mt-8 lg:mt-0 space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-sm font-semibold mb-3">Toutes les discussions</h2>
              <p className="text-[11px] text-gray-500 mb-2">Du plus récent au plus ancien</p>
              {sidebarLoading ? (
                <p className="text-xs text-gray-600">Chargement...</p>
              ) : sidebarThreads.length === 0 ? (
                <p className="text-xs text-gray-600">Aucune discussion pour le moment.</p>
              ) : (
                <ul className="space-y-2 max-h-[420px] overflow-y-auto text-xs">
                  {sidebarThreads.map((thread) => (
                    <li key={thread._id}>
                      <Link
                        href={`/forum/${thread._id}`}
                        className="block rounded-md px-2 py-1 hover:bg-gray-50 text-gray-800"
                      >
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-600 mr-1">
                          {getThemeLabel(thread.theme)}
                        </span>
                        <div className="font-medium truncate mt-0.5">{thread.title}</div>
                        <div className="text-[11px] text-gray-500 flex justify-between gap-2">
                          <span>{thread.repliesCount || 0} rep.</span>
                          <span className="truncate text-right">
                            {thread.createdBy
                              ? `${thread.createdBy.prenom || ''} ${thread.createdBy.nom || ''}`.trim() || 'Auteur inconnu'
                              : 'Auteur inconnu'}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
      </main>
      <Footer />
    </>
  );
}

