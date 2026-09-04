'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { forumAPI } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ForumTextEditor, stripForumFormatting } from '@/components/forum/ForumRichText';
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
  isVerified?: boolean;
  isRejected?: boolean;
  createdBy?: {
    prenom?: string;
    nom?: string;
    role?: string;
  };
  guestName?: string;
  likesCount?: number;
  liked?: boolean;
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
  const [guestName, setGuestName] = useState('');
  const [filterTheme, setFilterTheme] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<StatusFilterValue>('all');
  const [rulesCollapsed, setRulesCollapsed] = useState(true);
  const [createStep, setCreateStep] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [openShareId, setOpenShareId] = useState<string | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);

  const userRole = (session?.user as any)?.role || 'client';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!shareMenuRef.current) return;
      if (!shareMenuRef.current.contains(event.target as Node)) {
        setOpenShareId(null);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenShareId(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  // Débounce de la recherche pour éviter trop d'appels API
  useEffect(() => {
    const id = setTimeout(() => {
      const value = search.trim();
      // Ne lancer la recherche côté API qu'à partir de 2 caractères significatifs
      if (value.length >= 2) {
        setDebouncedSearch(value);
      } else {
        setDebouncedSearch('');
      }
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  // Liste principale : filtrée par thème et par statut (épinglées / résolues / archivées)
  useEffect(() => {
    const loadThreads = async () => {
      try {
        setLoading(true);
        setError(null);
        const params: { page: number; limit: number; theme?: string; statusFilter?: 'archived' | 'pinned' | 'resolved'; q?: string } = { page: 1, limit: 50 };
        if (filterTheme != null && filterTheme !== '') {
          params.theme = filterTheme;
        }
        if (filterStatus !== 'all') {
          params.statusFilter = filterStatus as 'archived' | 'pinned' | 'resolved';
        }
        if (debouncedSearch) {
          params.q = debouncedSearch;
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
  }, [filterTheme, filterStatus, debouncedSearch]);

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
        guestName: status === 'authenticated' ? undefined : guestName.trim(),
      });
      const created = response.data?.data as ForumThread;
      if (created) {
        setTitle('');
        setBody('');
        setTheme('autres');
        setGuestName('');
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

  const getThreadUrl = (thread: ForumThread) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/forum/${thread._id}`;
  };

  const getExcerpt = (raw: string, max = 180) => {
    const normalized = stripForumFormatting(raw || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max).trimEnd()}...`;
  };

  const copyThreadLink = async (thread: ForumThread) => {
    const url = getThreadUrl(thread);
    if (navigator?.clipboard) {
      const message = `Vous êtes invité(e) à participer à cette discussion sur ${url}\nQuestion: ${getExcerpt(thread.body || thread.title || '')}\nhttps://www.adapapers.fr/`;
      await navigator.clipboard.writeText(message);
    }
  };

  const shareThreadOnWhatsapp = (thread: ForumThread) => {
    const url = getThreadUrl(thread);
    const text = `Vous êtes invité(e) à participer à cette discussion sur ${url}\nQuestion: ${getExcerpt(thread.body || thread.title || '')}\nhttps://www.adapapers.fr/`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <>
      <Header variant="home" />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 py-4 sm:py-8 space-y-6">
        <header className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold">Forum Ada Papers</h1>
          <p className="text-sm md:text-base text-gray-600 mt-2">
            Posez vos questions et échangez avec l'équipe et les autres utilisateurs sur les démarches administratives.
          </p>
          {/* Barre de recherche dans les titres, contenus et réponses */}
          <div className="mt-4 max-w-xl">
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="forum-search">
              Rechercher dans les discussions et les réponses
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
                </svg>
              </span>
              <input
                id="forum-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Chercher un mot-clé (titre, contenu, réponse...)"
                className="w-full pl-9 pr-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
              {search && search.trim().length < 2 && (
                <span>Saisissez au moins 2 caractères pour lancer la recherche.</span>
              )}
              {debouncedSearch && (
                <span>
                  Filtre actif sur&nbsp;
                  <span className="font-semibold">“{debouncedSearch}”</span> - {threads.length} discussion(s) trouvée(s)
                </span>
              )}
            </div>
          </div>
        </header>

        {status !== 'authenticated' && (
          <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-700">
              Créez un compte pour être informé des réponses à vos questions et des nouvelles discussions du forum.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/auth/signup"
                className="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-black transition-colors"
              >
                Créer un compte
              </Link>
              <Link
                href="/auth/signin"
                className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Se connecter
              </Link>
            </div>
          </section>
        )}

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
                <li>Restez respectueux dans vos échanges, aucun propos discriminatoire ou agressif n'est toléré.</li>
                <li>Les réponses données sur ce forum sont informatives et ne constituent pas un accompagnement personnalisé.</li>
                <li>Pour une prise en charge complète de votre dossier, utilisez les fonctionnalités de la plateforme et suivez les instructions de votre espace client.</li>
                <li>Les administrateurs se réservent le droit de modifier ou supprimer tout contenu non conforme à ces règles.</li>
              </ul>
            </div>
          )}
        </section>

        <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(260px,0.9fr)] lg:gap-6 items-start">
          {/* Colonne principale */}
          <div className="space-y-8">
            {/* Création d'une nouvelle discussion - compact, champs un par un */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-base font-semibold mb-3">Créer une nouvelle discussion</h2>
                <form onSubmit={handleCreateThread} className="space-y-2">
                  {status !== 'authenticated' && (
                    <div className="pt-1">
                      <label htmlFor="forum-guest-name" className="block text-sm font-medium text-gray-700 mb-0.5">
                        Votre nom (optionnel)
                      </label>
                      <input
                        id="forum-guest-name"
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="Ex. : Awa"
                        maxLength={120}
                      />
                    </div>
                  )}
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
                        <ForumTextEditor
                          id="forum-body"
                          value={body}
                          onChange={setBody}
                          minHeightClass="min-h-[120px]"
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
                      <div
                        key={thread._id}
                        className="block bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                      >
                        <Link href={`/forum/${thread._id}`} className="block">
                        <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] md:text-xs border border-slate-200">
                                {getThemeLabel(thread.theme)}
                              </span>
                              <h3 className="text-sm md:text-base font-semibold text-gray-900 break-words">
                                {thread.title}
                              </h3>
                            </div>
                            <p className="mt-1 text-xs md:text-sm text-gray-600 line-clamp-2 break-words text-justify">
                              {stripForumFormatting(thread.body)}
                            </p>
                            <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1 text-[11px] md:text-xs text-gray-500">
                              <span className="break-words">
                                {thread.repliesCount || 0} réponse{thread.repliesCount === 1 ? '' : 's'} •{' '}
                                {thread.viewsCount || 0} vue{thread.viewsCount === 1 ? '' : 's'}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-start sm:items-end gap-1 text-[10px] md:text-xs text-gray-600 w-full sm:w-auto">
                            <div className="flex flex-wrap gap-1 justify-start sm:justify-end">
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
                              {thread.isVerified && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                                  Vérifiée
                                </span>
                              )}
                              {thread.isRejected && (
                                <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                                  Désapprouvée
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        </Link>
                        <div className="mt-2 flex flex-col gap-2">
                          <span className="flex flex-wrap items-center gap-1 text-[11px] md:text-xs text-gray-500">
                            <span className="break-words">
                              Par{' '}
                              {thread.createdBy
                                ? `${thread.createdBy.prenom || ''} ${thread.createdBy.nom || ''}`.trim() || 'Auteur inconnu'
                                : thread.guestName || 'Auteur anonyme'}
                            </span>
                            <span>•</span>
                            <span>
                              {thread.createdAt
                                ? new Date(thread.createdAt).toLocaleDateString('fr-FR')
                                : ''}
                            </span>
                          </span>
                          <div className="relative mt-1 flex w-full justify-end gap-2" ref={openShareId === thread._id ? shareMenuRef : null}>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await forumAPI.toggleLikeThread(thread._id);
                                  if (res.data?.success) {
                                    const updated = res.data.data as { likesCount: number; liked: boolean };
                                    setThreads((prev) =>
                                      prev.map((t) =>
                                        t._id === thread._id
                                          ? { ...t, likesCount: updated.likesCount, liked: updated.liked }
                                          : t
                                      )
                                    );
                                    setSidebarThreads((prev) =>
                                      prev.map((t) =>
                                        t._id === thread._id
                                          ? { ...t, likesCount: updated.likesCount, liked: updated.liked }
                                          : t
                                      )
                                    );
                                  }
                                } catch (err) {
                                  console.error('Erreur lors du like de la discussion:', err);
                                }
                              }}
                              className={`list-none cursor-pointer px-1.5 py-0.5 text-[11px] rounded border inline-flex items-center gap-1 ${
                                thread.liked
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                  : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              <span>👍</span>
                              <span>{thread.likesCount || 0}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenShareId((prev) => (prev === thread._id ? null : thread._id))}
                              className="list-none cursor-pointer px-1.5 py-0.5 text-[11px] rounded border border-green-300 text-green-700 hover:bg-green-50 inline-flex items-center gap-1"
                            >
                              Partager
                            </button>
                            {openShareId === thread._id && (
                            <div className="fixed left-1/2 top-1/2 z-40 w-[170px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border border-gray-200 bg-white shadow-md p-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  await copyThreadLink(thread);
                                  setOpenShareId(null);
                                }}
                                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100 whitespace-normal break-words"
                              >
                                Copier le lien
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  shareThreadOnWhatsapp(thread);
                                  setOpenShareId(null);
                                }}
                                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100 text-green-700 whitespace-normal break-words"
                              >
                                WhatsApp
                              </button>
                            </div>
                            )}
                          </div>
                        </div>
                      </div>
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
                        <div className="font-medium break-words mt-0.5">{thread.title}</div>
                        <div className="text-[11px] text-gray-500 flex justify-between gap-2">
                          <span>{thread.repliesCount || 0} rep.</span>
                          <span className="break-words text-right">
                            {thread.createdBy
                              ? `${thread.createdBy.prenom || ''} ${thread.createdBy.nom || ''}`.trim() || 'Auteur inconnu'
                              : thread.guestName || 'Auteur anonyme'}
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

