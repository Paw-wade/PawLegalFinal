'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { forumAPI } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { getThemeLabel } from '../forum-utils';

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

interface ForumPost {
  _id: string;
  body: string;
  createdAt: string;
  createdBy?: {
    prenom?: string;
    nom?: string;
    role?: string;
  };
}

interface ThreadResponse {
  success: boolean;
  data: {
    thread: ForumThread;
    posts: ForumPost[];
  };
}

export default function ForumThreadPage() {
  const params = useParams();
  const { status, data: session } = useSession();
  const threadId = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  const [thread, setThread] = useState<ForumThread | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [updatingThread, setUpdatingThread] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  const [allThreads, setAllThreads] = useState<ForumThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState<boolean>(true);

  const userRole = (session?.user as any)?.role || 'client';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  useEffect(() => {
    if (!threadId) return;

    const loadThread = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await forumAPI.getThread(threadId);
        const data = response.data as ThreadResponse;
        if (data.success) {
          setThread(data.data.thread);
          setPosts(data.data.posts);
        } else {
          setError('Discussion introuvable.');
        }
      } catch (err: any) {
        console.error('Erreur lors du chargement de la discussion:', err);
        if (err?.response?.status === 404) {
          setError('Discussion introuvable.');
        } else {
          setError('Une erreur est survenue lors du chargement de la discussion.');
        }
      } finally {
        setLoading(false);
      }
    };

    loadThread();
  }, [threadId]);

  // Charger la liste des discussions pour la barre latérale
  useEffect(() => {
    const loadThreads = async () => {
      try {
        setLoadingThreads(true);
        const response = await forumAPI.listThreads({ page: 1, limit: 50 });
        const data = response.data as { success: boolean; data: ForumThread[] };
        if (data.success) {
          setAllThreads(data.data);
        }
      } catch (err) {
        console.error('Erreur lors du chargement des discussions (sidebar):', err);
      } finally {
        setLoadingThreads(false);
      }
    };

    loadThreads();
  }, []);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadId || !replyBody.trim()) return;

    try {
      setSending(true);
      setError(null);
      const response = await forumAPI.replyToThread(threadId, { body: replyBody.trim() });
      const created = response.data?.data as ForumPost;
      if (created) {
        setPosts((prev) => [...prev, created]);
        setReplyBody('');
      }
    } catch (err: any) {
      console.error('Erreur lors de l\'envoi de la réponse:', err);
      setError("Impossible d'envoyer la réponse. Vérifiez que vous êtes bien connecté.");
    } finally {
      setSending(false);
    }
  };

  const handleAdminUpdateThread = async (updates: { status?: 'open' | 'closed' | 'archived' | 'resolved'; isPinned?: boolean }) => {
    if (!threadId) return;
    try {
      setUpdatingThread(true);
      setError(null);
      const response = await forumAPI.updateThreadAsAdmin(threadId, updates);
      const updated = response.data?.data as ForumThread;
      if (updated) {
        setThread(updated);
      }
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour de la discussion (admin):', err);
      setError("Impossible de mettre à jour la discussion.");
    } finally {
      setUpdatingThread(false);
    }
  };

  const handleAdminDeletePost = async (postId: string) => {
    if (!postId) return;
    try {
      setDeletingPostId(postId);
      setError(null);
      await forumAPI.deletePostAsAdmin(postId);
      setPosts((prev) => prev.filter((p) => p._id !== postId));
    } catch (err: any) {
      console.error('Erreur lors de la suppression de la réponse (admin):', err);
      setError("Impossible de supprimer la réponse.");
    } finally {
      setDeletingPostId(null);
    }
  };

  return (
    <>
      <Header variant="home" />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="mb-4">
            <Link
              href="/forum"
              className="text-xs text-orange-600 hover:underline"
            >
              ← Retour au forum
            </Link>
          </div>

          <div className="lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] lg:gap-6 items-start">
            {/* Colonne principale */}
            <div>
              {loading ? (
                <p className="text-sm text-gray-600">Chargement de la discussion...</p>
              ) : error ? (
                <p className="text-sm text-red-600">{error}</p>
              ) : !thread ? (
                <p className="text-sm text-gray-600">Discussion introuvable.</p>
              ) : (
                <>
                  {/* En-tête de la discussion */}
                  <section className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs border border-slate-200">
                            {getThemeLabel(thread.theme)}
                          </span>
                          <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                            {thread.title}
                          </h1>
                        </div>
                        <p className="mt-2 text-sm text-gray-700">
                          {thread.body}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] md:text-xs text-gray-500">
                          <span>
                            {thread.repliesCount || posts.length} réponse{(thread.repliesCount || posts.length) === 1 ? '' : 's'} •{' '}
                            {thread.viewsCount || 0} vue{thread.viewsCount === 1 ? '' : 's'}
                          </span>
                          <span>
                            Publié le{' '}
                            {thread.createdAt
                              ? new Date(thread.createdAt).toLocaleDateString('fr-FR')
                              : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-[10px] md:text-xs text-gray-700">
                        {/* Badges de statut visibles pour tout le monde */}
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
                        {/* Actions admin sous les badges */}
                        {isAdmin && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={updatingThread}
                              onClick={() =>
                                handleAdminUpdateThread({ isPinned: !thread.isPinned })
                              }
                              className="px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-100"
                            >
                              {thread.isPinned ? 'Désépingler' : 'Épingler'}
                            </button>
                            <button
                              type="button"
                              disabled={updatingThread}
                              onClick={() =>
                                handleAdminUpdateThread({
                                  status: thread.status === 'closed' ? 'open' : 'closed',
                                })
                              }
                              className="px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-100"
                            >
                              {thread.status === 'closed' ? 'Réouvrir' : 'Fermer'}
                            </button>
                            <button
                              type="button"
                              disabled={updatingThread}
                              onClick={() =>
                                handleAdminUpdateThread({
                                  status: thread.status === 'archived' ? 'open' : 'archived',
                                })
                              }
                              className="px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-100"
                            >
                              {thread.status === 'archived' ? 'Désarchiver' : 'Archiver'}
                            </button>
                            <button
                              type="button"
                              disabled={updatingThread}
                              onClick={() =>
                                handleAdminUpdateThread({
                                  status: thread.status === 'resolved' ? 'open' : 'resolved',
                                })
                              }
                              className="px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-100"
                            >
                              {thread.status === 'resolved' ? 'Marquer comme non résolue' : 'Marquer comme résolue'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Liste des réponses */}
                  <section className="mb-8 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h2 className="text-sm md:text-base font-semibold mb-3">Réponses</h2>
                    {posts.length === 0 ? (
                      <p className="text-sm text-gray-600">
                        Aucune réponse pour le moment. Soyez le premier à répondre.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {posts.map((post) => {
                          return (
                            <div
                              key={post._id}
                              className="border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 flex items-start justify-between gap-3"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-gray-800 whitespace-pre-line">
                                  {post.body}
                                </p>
                                <div className="mt-1 flex justify-end text-[11px] text-gray-500">
                                  <span>
                                    {post.createdAt
                                      ? new Date(post.createdAt).toLocaleString('fr-FR', {
                                          dateStyle: 'short',
                                          timeStyle: 'short',
                                        })
                                      : ''}
                                  </span>
                                </div>
                              </div>
                              {isAdmin && (
                                <button
                                  type="button"
                                  disabled={deletingPostId === post._id}
                                  onClick={() => handleAdminDeletePost(post._id)}
                                  className="text-[10px] text-red-600 hover:text-red-700 disabled:opacity-60"
                                >
                                  {deletingPostId === post._id ? 'Suppression...' : 'Supprimer'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Formulaire de réponse */}
                  <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h2 className="text-sm md:text-base font-semibold mb-3">Répondre à cette discussion</h2>
                    {thread.status === 'resolved' || thread.status === 'closed' || thread.status === 'archived' ? (
                      <p className="text-sm text-gray-700">
                        Cette discussion est marquée comme {thread.status === 'resolved' ? 'résolue' : 'fermée'} et n&apos;accepte plus de nouvelles réponses.
                        {isAdmin && ' Vous pouvez la rouvrir via les actions administrateur ci-dessus.'}
                      </p>
                    ) : status !== 'authenticated' ? (
                      <div className="text-sm text-gray-700 space-y-3">
                        <p>
                          Vous devez être connecté pour répondre. Connectez-vous ou créez un compte pour participer à la discussion.
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <Link
                            href="/auth/signin"
                            className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
                          >
                            Se connecter
                          </Link>
                          <Link
                            href="/auth/signup"
                            className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Créer un compte
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleSendReply} className="space-y-3">
                        <div>
                          <textarea
                            value={replyBody}
                            onChange={(e) => setReplyBody(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 min-h-[100px]"
                            placeholder="Écrivez votre réponse en restant clair, respectueux et sans données trop personnelles."
                          />
                        </div>
                        {error && (
                          <p className="text-sm text-red-600">{error}</p>
                        )}
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={sending || !replyBody.trim()}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                          >
                            {sending ? 'Envoi...' : 'Publier la réponse'}
                          </button>
                        </div>
                      </form>
                    )}
                  </section>
                </>
              )}
            </div>

            {/* Barre latérale : autres discussions */}
            <aside className="mt-8 lg:mt-0 space-y-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <h2 className="text-sm font-semibold mb-3">Autres discussions</h2>
                {loadingThreads ? (
                  <p className="text-xs text-gray-600">Chargement...</p>
                ) : allThreads.length === 0 ? (
                  <p className="text-xs text-gray-600">Aucune autre discussion.</p>
                ) : (
                  <ul className="space-y-2 max-h-[420px] overflow-y-auto text-xs">
                    {allThreads.map((t) => (
                      <li key={t._id}>
                        <Link
                          href={`/forum/${t._id}`}
                          className={`block rounded-md px-2 py-1 hover:bg-gray-50 ${
                            t._id === threadId ? 'bg-gray-50 font-semibold' : ''
                          }`}
                        >
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-600 mr-1">
                            {getThemeLabel(t.theme)}
                          </span>
                          <div className="truncate mt-0.5">{t.title}</div>
                          <div className="text-[11px] text-gray-500 flex justify-between gap-2">
                            <span>{t.repliesCount || 0} rep.</span>
                            <span>
                              {t.createdAt
                                ? new Date(t.createdAt).toLocaleDateString('fr-FR')
                                : ''}
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

