'use client';

import { useEffect, useRef, useState } from 'react';
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
  guestName?: string;
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
  guestName?: string;
  likes?: string[];
  likesCount?: number;
  liked?: boolean;
  isVerified?: boolean;
  verifiedAt?: string;
  verifiedBy?: {
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

const getAuthorLabel = (user?: { prenom?: string; nom?: string; role?: string }, guestName?: string) => {
  if (!user) return guestName || 'Auteur anonyme';
  const fullName = `${user.prenom || ''} ${user.nom || ''}`.trim();
  return fullName || guestName || 'Auteur anonyme';
};

export default function ForumThreadPage() {
  const params = useParams();
  const { status, data: session } = useSession();
  const threadId = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  const [thread, setThread] = useState<ForumThread | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [replyBody, setReplyBody] = useState('');
  const [replyGuestName, setReplyGuestName] = useState('');
  const [sending, setSending] = useState(false);
  const [updatingThread, setUpdatingThread] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [verifyingPostId, setVerifyingPostId] = useState<string | null>(null);
  const [openShareId, setOpenShareId] = useState<string | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);

  const [allThreads, setAllThreads] = useState<ForumThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState<boolean>(true);

  const userRole = (session?.user as any)?.role || 'client';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  const currentUserId = (session?.user as any)?._id || (session?.user as any)?.id || null;

  const [isBookmarked, setIsBookmarked] = useState(false);

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

  // Consulter le fil = marquer comme lu (badge « nouvelles réponses » dans la sidebar)
  useEffect(() => {
    if (!threadId || status !== 'authenticated') return;
    let cancelled = false;
    (async () => {
      try {
        await forumAPI.markThreadRead(threadId);
        if (!cancelled && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('forumUnreadUpdated'));
        }
      } catch {
        /* fil introuvable ou hors ligne : ignorer */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, status]);

  // Charger l'état du signet pour cette discussion
  useEffect(() => {
    const loadBookmarks = async () => {
      try {
        if (!threadId || !session) return;
        const response = await forumAPI.getBookmarks();
        if (response.data?.success) {
          const bookmarks = response.data.bookmarks || [];
          const found = bookmarks.some((b: any) => {
            const t = b.thread;
            const id = t?._id || t?.id || t;
            return id && id.toString() === threadId.toString();
          });
          setIsBookmarked(found);
        }
      } catch (err) {
        // Ne pas bloquer la page en cas d'erreur
        console.error('Erreur lors du chargement des signets forum:', err);
      }
    };

    loadBookmarks();
  }, [threadId, session]);

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
      const response = await forumAPI.replyToThread(threadId, {
        body: replyBody.trim(),
        guestName: status === 'authenticated' ? undefined : replyGuestName.trim(),
      });
      const created = response.data?.data as ForumPost;
      if (created) {
        setPosts((prev) => [...prev, created]);
        setReplyBody('');
        setReplyGuestName('');
        try {
          await forumAPI.markThreadRead(threadId);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('forumUnreadUpdated'));
          }
        } catch {
          /* ignore */
        }
      }
    } catch (err: any) {
      console.error('Erreur lors de l\'envoi de la réponse:', err);
      setError("Impossible d'envoyer la réponse. Vérifiez que vous êtes bien connecté.");
    } finally {
      setSending(false);
    }
  };

  const getThreadUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/forum/${threadId}`;
  };

  const getExcerpt = (raw: string, max = 180) => {
    const normalized = (raw || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max).trimEnd()}...`;
  };

  const shareOnWhatsapp = (text: string) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
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

  const handleAdminVerifyPost = async (postId: string, isVerified: boolean) => {
    if (!postId) return;
    try {
      setVerifyingPostId(postId);
      setError(null);
      const response = await forumAPI.verifyPostAsAdmin(postId, isVerified);
      const updated = response.data?.data;
      if (updated) {
        setPosts((prev) =>
          prev.map((p) =>
            p._id === postId
              ? {
                  ...p,
                  isVerified: !!updated.isVerified,
                  verifiedAt: updated.verifiedAt || undefined,
                  verifiedBy: updated.verifiedBy || undefined,
                }
              : p
          )
        );
      }
    } catch (err) {
      console.error('Erreur lors de la validation de la réponse (admin):', err);
      setError("Impossible de mettre à jour l'état de validation.");
    } finally {
      setVerifyingPostId(null);
    }
  };

  return (
    <>
      <Header variant="home" />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <div className="mb-4">
            <Link
              href="/forum"
              className="text-xs text-orange-600 hover:underline"
            >
              ← Retour au forum
            </Link>
          </div>

          {status !== 'authenticated' && (
            <section className="mb-4 sm:mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-700">
                Créez un compte pour être informé des réponses à cette discussion et des nouvelles discussions du forum.
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
                  <section className="mb-4 sm:mb-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="mb-2">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200 text-[11px] font-semibold">
                            Question principale
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs border border-slate-200">
                            {getThemeLabel(thread.theme)}
                          </span>
                          <h1 className="text-xl md:text-2xl font-semibold text-gray-900 break-words">
                            {thread.title}
                          </h1>
                        </div>
                        <p className="mt-2 text-sm sm:text-[15px] text-gray-800 leading-relaxed">
                          {thread.body}
                        </p>
                        <div className="mt-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 text-[11px] md:text-xs text-gray-500">
                          <span className="break-words">
                            {thread.repliesCount || posts.length} réponse{(thread.repliesCount || posts.length) === 1 ? '' : 's'} •{' '}
                            {thread.viewsCount || 0} vue{thread.viewsCount === 1 ? '' : 's'}
                          </span>
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="break-words">
                              Par {getAuthorLabel(thread.createdBy, thread.guestName)} •{' '}
                              {thread.createdAt
                                ? new Date(thread.createdAt).toLocaleDateString('fr-FR')
                                : ''}
                            </span>
                            {session && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-[11px] md:text-xs text-orange-700 hover:text-orange-900 hover:underline"
                                onClick={async () => {
                                  try {
                                    const res = await forumAPI.toggleBookmarkThread(threadId);
                                    if (res.data?.success) {
                                      setIsBookmarked(res.data.bookmarked);
                                    }
                                  } catch (err) {
                                    console.error('Erreur lors de la mise en signet:', err);
                                  }
                                }}
                              >
                                <span>{isBookmarked ? '★' : '☆'}</span>
                                <span>{isBookmarked ? 'En signet' : 'Mettre en signet'}</span>
                              </button>
                            )}
                          </span>
                        </div>
                        <div className="mt-2 relative inline-block w-fit" ref={openShareId === 'thread' ? shareMenuRef : null}>
                          <button
                            type="button"
                            onClick={() => setOpenShareId((prev) => (prev === 'thread' ? null : 'thread'))}
                            className="list-none cursor-pointer px-2 py-1 text-xs rounded border border-green-300 text-green-700 hover:bg-green-50 inline-flex items-center gap-1"
                          >
                            Partager
                          </button>
                          {openShareId === 'thread' && (
                          <div className="absolute left-1/2 -translate-x-1/2 z-20 mt-1 w-[min(85vw,220px)] rounded-md border border-gray-200 bg-white shadow-md p-1">
                            <button
                              type="button"
                              onClick={async () => {
                                const url = getThreadUrl();
                                const message = `Vous êtes invité(e) à participer à cette discussion sur ${url}\nQuestion: ${getExcerpt(thread.body || thread.title || '')}\nhttps://www.adapapers.fr/`;
                                if (navigator?.clipboard) await navigator.clipboard.writeText(message);
                                setOpenShareId(null);
                              }}
                              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100"
                            >
                              Copier le lien
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                shareOnWhatsapp(
                                  `Vous êtes invité(e) à participer à cette discussion sur ${getThreadUrl()}\nQuestion: ${getExcerpt(thread.body || thread.title || '')}\nhttps://www.adapapers.fr/`
                                );
                                setOpenShareId(null);
                              }}
                              
                              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100 text-green-700"
                            >
                              WhatsApp
                            </button>
                          </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-start sm:items-end gap-1 text-[10px] md:text-xs text-gray-700">
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
                          <div className="mt-1 flex flex-wrap gap-1 justify-start sm:justify-end">
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
                  <section className="mb-6 sm:mb-8 bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
                    <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2">
                      <h2 className="text-sm md:text-base font-semibold">Réponses</h2>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                        {posts.length} total
                      </span>
                    </div>
                    {posts.length === 0 ? (
                      <p className="text-sm text-gray-600">
                        Aucune réponse pour le moment. Soyez le premier à répondre.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {posts.map((post, index) => {
                          const likesCount = post.likesCount ?? (post.likes ? post.likes.length : 0);
                          const hasLiked =
                            !!currentUserId &&
                            Array.isArray(post.likes) &&
                            post.likes.some((id: any) =>
                              typeof id === 'string'
                                ? id === currentUserId
                                : id?._id?.toString() === currentUserId.toString()
                            );
                          return (
                            <div
                              key={post._id}
                              id={`reponse-${post._id}`}
                              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 flex flex-col sm:flex-row items-start justify-between gap-3"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="mb-1.5">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700 text-[10px] font-semibold">
                                    Réponse #{index + 1}
                                  </span>
                                </div>
                                <p className="text-gray-800 whitespace-pre-line break-words">
                                  {post.body}
                                </p>
                                <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-gray-500">
                                  <span className="break-words">
                                    Par {getAuthorLabel(post.createdBy, post.guestName)} •{' '}
                                    {post.createdAt
                                      ? new Date(post.createdAt).toLocaleString('fr-FR', {
                                          dateStyle: 'short',
                                          timeStyle: 'short',
                                        })
                                      : ''}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {post.isVerified && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-semibold">
                                        Vérifiée
                                      </span>
                                    )}
                                    {session && (
                                      <button
                                        type="button"
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${
                                          hasLiked
                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                                        }`}
                                        onClick={async () => {
                                          try {
                                            const res = await forumAPI.toggleLikePost(post._id);
                                            if (res.data?.success) {
                                              const updated = res.data.data as any;
                                              setPosts((prev) =>
                                                prev.map((p) =>
                                                  p._id === post._id
                                                    ? {
                                                        ...p,
                                                        likesCount: updated.likesCount,
                                                        liked: updated.liked,
                                                      }
                                                    : p
                                                )
                                              );
                                            }
                                          } catch (err) {
                                            console.error('Erreur lors du like:', err);
                                          }
                                        }}
                                      >
                                        <span>👍</span>
                                        <span>{likesCount || 0}</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-2 relative inline-block w-fit" ref={openShareId === `post-${post._id}` ? shareMenuRef : null}>
                                  <button
                                    type="button"
                                    onClick={() => setOpenShareId((prev) => (prev === `post-${post._id}` ? null : `post-${post._id}`))}
                                    className="list-none cursor-pointer px-2 py-1 text-xs rounded border border-green-300 text-green-700 hover:bg-green-50 inline-flex items-center gap-1"
                                  >
                                    Partager
                                  </button>
                                  {openShareId === `post-${post._id}` && (
                                  <div className="absolute left-1/2 -translate-x-1/2 z-20 mt-1 w-[min(85vw,220px)] rounded-md border border-gray-200 bg-white shadow-md p-1">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const base = getThreadUrl();
                                        const url = `${base}#reponse-${post._id}`;
                                        const message = `Vous êtes invité(e) à participer à cette discussion sur ${url}\nRéponse: ${getExcerpt(post.body || '')}\nhttps://www.adapapers.fr/`;
                                        if (navigator?.clipboard) await navigator.clipboard.writeText(message);
                                        setOpenShareId(null);
                                      }}
                                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100"
                                    >
                                      Copier le lien
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        shareOnWhatsapp(
                                          `Vous êtes invité(e) à participer à cette discussion sur ${getThreadUrl()}#reponse-${post._id}\nRéponse: ${getExcerpt(post.body || '')}\nhttps://www.adapapers.fr/`
                                        );
                                        setOpenShareId(null);
                                      }}
                                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100 text-green-700"
                                    >
                                      WhatsApp
                                    </button>
                                  </div>
                                  )}
                                </div>
                              </div>
                              {isAdmin && (
                                <div className="flex flex-row sm:flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                                  <button
                                    type="button"
                                    disabled={verifyingPostId === post._id}
                                    onClick={() => handleAdminVerifyPost(post._id, !post.isVerified)}
                                    className="text-[10px] text-emerald-700 hover:text-emerald-800 disabled:opacity-60"
                                  >
                                    {verifyingPostId === post._id
                                      ? 'Mise à jour...'
                                      : post.isVerified
                                        ? 'Retirer Vérifiée'
                                        : 'Marquer Vérifiée'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={deletingPostId === post._id}
                                    onClick={() => handleAdminDeletePost(post._id)}
                                    className="text-[10px] text-red-600 hover:text-red-700 disabled:opacity-60"
                                  >
                                    {deletingPostId === post._id ? 'Suppression...' : 'Supprimer'}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Formulaire de réponse */}
                  <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
                    <h2 className="text-sm md:text-base font-semibold mb-3">Répondre à cette discussion</h2>
                    {thread.status === 'resolved' || thread.status === 'closed' || thread.status === 'archived' ? (
                      <p className="text-sm text-gray-700">
                        Cette discussion est marquée comme {thread.status === 'resolved' ? 'résolue' : 'fermée'} et n&apos;accepte plus de nouvelles réponses.
                        {isAdmin && ' Vous pouvez la rouvrir via les actions administrateur ci-dessus.'}
                      </p>
                    ) : (
                      <form onSubmit={handleSendReply} className="space-y-3">
                        {status !== 'authenticated' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Votre nom (optionnel)
                            </label>
                            <input
                              type="text"
                              value={replyGuestName}
                              onChange={(e) => setReplyGuestName(e.target.value)}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                              maxLength={120}
                              placeholder="Ex. : Awa"
                            />
                          </div>
                        )}
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
                        <div className="break-words mt-0.5">{t.title}</div>
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

