'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  likesCount?: number;
  liked?: boolean;
}

interface ForumPost {
  _id: string;
  body: string;
  parentPost?: string | { _id: string };
  createdAt: string;
  createdBy?: {
    _id?: string;
    prenom?: string;
    nom?: string;
    role?: string;
  };
  guestName?: string;
  likesCount?: number;
  liked?: boolean;
  isVerified?: boolean;
  isRejected?: boolean;
  verifiedAt?: string;
  verifiedBy?: {
    prenom?: string;
    nom?: string;
    role?: string;
  };
  rejectedAt?: string;
  rejectedBy?: {
    prenom?: string;
    nom?: string;
    role?: string;
  };
  updatedAt?: string;
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
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [updatingThread, setUpdatingThread] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [verifyingPostId, setVerifyingPostId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [savingPostId, setSavingPostId] = useState<string | null>(null);
  const [openShareId, setOpenShareId] = useState<string | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const mainReplyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [allThreads, setAllThreads] = useState<ForumThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState<boolean>(true);

  const userRole = (session?.user as any)?.role || 'client';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  const currentUserId = ((session?.user as any)?._id || (session?.user as any)?.id || '').toString();
  const canReplyToThread = !!thread && thread.status !== 'resolved' && thread.status !== 'closed' && thread.status !== 'archived';

  const [isBookmarked, setIsBookmarked] = useState(false);
  const guestNameStorageKey = 'forum_guest_name';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedGuestName = window.localStorage.getItem(guestNameStorageKey);
    if (savedGuestName && !replyGuestName) {
      setReplyGuestName(savedGuestName);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const normalized = replyGuestName.trim();
    if (normalized) {
      window.localStorage.setItem(guestNameStorageKey, normalized);
    }
  }, [replyGuestName]);

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
        parentPostId: replyTargetId || undefined,
      });
      const created = response.data?.data as ForumPost;
      if (created) {
        setPosts((prev) => [...prev, created]);
        setReplyBody('');
        setReplyTargetId(null);
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

  const threadedPosts = useMemo(() => {
    type ThreadedPostItem = { post: ForumPost; depth: number };
    const getParentId = (post: ForumPost): string | null => {
      if (!post.parentPost) return null;
      return typeof post.parentPost === 'string' ? post.parentPost : post.parentPost._id || null;
    };

    const byId = new Map(posts.map((post) => [post._id, post]));
    const children = new Map<string, ForumPost[]>();
    const roots: ForumPost[] = [];

    posts.forEach((post) => {
      const parentId = getParentId(post);
      if (parentId && byId.has(parentId)) {
        const current = children.get(parentId) || [];
        current.push(post);
        children.set(parentId, current);
      } else {
        roots.push(post);
      }
    });

    const result: ThreadedPostItem[] = [];
    const walk = (post: ForumPost, depth: number) => {
      result.push({ post, depth });
      const childPosts = children.get(post._id) || [];
      childPosts.forEach((child) => walk(child, depth + 1));
    };

    roots.forEach((root) => walk(root, 0));
    return result;
  }, [posts]);

  const replyTargetLabel = useMemo(() => {
    if (!replyTargetId) return '';
    const idx = threadedPosts.findIndex((item) => item.post._id === replyTargetId);
    return idx >= 0 ? `Réponse #${idx + 1}` : 'cette réponse';
  }, [replyTargetId, threadedPosts]);

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

  const handleAdminVerifyPost = async (postId: string, data: { isVerified?: boolean; isRejected?: boolean }) => {
    if (!postId) return;
    try {
      setVerifyingPostId(postId);
      setError(null);
      const response = await forumAPI.verifyPostAsAdmin(postId, data);
      const updated = response.data?.data;
      if (updated) {
        setPosts((prev) =>
          prev.map((p) =>
            p._id === postId
              ? {
                  ...p,
                  isVerified: !!updated.isVerified,
                  isRejected: !!updated.isRejected,
                  verifiedAt: updated.verifiedAt || undefined,
                  verifiedBy: updated.verifiedBy || undefined,
                  rejectedAt: updated.rejectedAt || undefined,
                  rejectedBy: updated.rejectedBy || undefined,
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

  const handleAdminStartEditPost = (post: ForumPost) => {
    setEditingPostId(post._id);
    setEditingBody(post.body || '');
  };

  const handleAdminCancelEditPost = () => {
    setEditingPostId(null);
    setEditingBody('');
  };

  const handleAdminSavePostEdit = async (postId: string) => {
    const normalizedBody = editingBody.trim();
    if (!normalizedBody) return;
    try {
      setSavingPostId(postId);
      setError(null);
      const response = await forumAPI.updatePostAsAdmin(postId, { body: normalizedBody });
      const updated = response.data?.data as ForumPost;
      if (updated) {
        setPosts((prev) => prev.map((p) => (p._id === postId ? { ...p, ...updated } : p)));
      } else {
        setPosts((prev) => prev.map((p) => (p._id === postId ? { ...p, body: normalizedBody } : p)));
      }
      handleAdminCancelEditPost();
    } catch (err) {
      console.error('Erreur lors de la modification de la réponse (admin):', err);
      setError("Impossible de modifier la réponse.");
    } finally {
      setSavingPostId(null);
    }
  };

  const canEditPost = (post: ForumPost) => {
    if (isAdmin) return true;
    if (!currentUserId) return false;
    const postAuthorId = (post.createdBy?._id || '').toString();
    return !!postAuthorId && postAuthorId === currentUserId;
  };

  return (
    <>
      <Header variant="home" />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <div className="mb-4">
            <Link
              href="/forum"
              className="text-xs text-primary hover:underline"
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
                  href={`/auth/signup?callbackUrl=${encodeURIComponent(`/forum/${threadId}`)}`}
                  className="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-black transition-colors"
                >
                  Créer un compte
                </Link>
                <Link
                  href={`/auth/signin?callbackUrl=${encodeURIComponent(`/forum/${threadId}`)}`}
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
                      <div className="order-2 sm:order-1 flex-1 min-w-0">
                        <div className="mb-2 flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
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
                        <div className="mt-3 flex flex-col gap-2 text-[11px] md:text-xs text-gray-500">
                          <span className="break-words">
                            {thread.repliesCount || posts.length} réponse{(thread.repliesCount || posts.length) === 1 ? '' : 's'} •{' '}
                            {thread.viewsCount || 0} vue{thread.viewsCount === 1 ? '' : 's'}
                          </span>
                          <div className="flex w-full flex-row flex-wrap items-center justify-between gap-2">
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
                                  className="inline-flex items-center gap-1 text-[11px] md:text-xs text-primary hover:text-primary/80 hover:underline"
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
                            <div className="relative ml-auto flex flex-wrap items-center justify-end gap-2" ref={openShareId === 'thread' ? shareMenuRef : null}>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await forumAPI.toggleLikeThread(threadId);
                                  if (res.data?.success) {
                                    const updated = res.data.data as { likesCount: number; liked: boolean };
                                    setThread((prev) =>
                                      prev
                                        ? { ...prev, likesCount: updated.likesCount, liked: updated.liked }
                                        : prev
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
                              onClick={() => {
                                setReplyTargetId(null);
                                if (!canReplyToThread) return;
                                if (mainReplyTextareaRef.current) {
                                  mainReplyTextareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  mainReplyTextareaRef.current.focus();
                                }
                              }}
                              disabled={!canReplyToThread}
                              className="list-none cursor-pointer px-1.5 py-0.5 text-[11px] rounded border border-gray-300 text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Répondre
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenShareId((prev) => (prev === 'thread' ? null : 'thread'))}
                              className="list-none cursor-pointer px-1.5 py-0.5 text-[11px] rounded border border-green-300 text-green-700 hover:bg-green-50 inline-flex items-center gap-1"
                            >
                              Partager
                            </button>
                            {openShareId === 'thread' && (
                            <div className="fixed left-1/2 top-1/2 z-40 w-[170px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border border-gray-200 bg-white shadow-md p-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  const url = getThreadUrl();
                                  const message = `Vous êtes invité(e) à participer à cette discussion sur ${url}\nQuestion: ${getExcerpt(thread.body || thread.title || '')}\nhttps://www.adapapers.fr/`;
                                  if (navigator?.clipboard) await navigator.clipboard.writeText(message);
                                  setOpenShareId(null);
                                }}
                                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100 whitespace-normal break-words"
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
                                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100 text-green-700 whitespace-normal break-words"
                              >
                                WhatsApp
                              </button>
                            </div>
                            )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="order-1 sm:order-2 mb-2 sm:mb-0 flex w-full sm:w-auto flex-col items-end gap-1 text-[10px] md:text-xs text-gray-700">
                        {/* Badges de statut visibles pour tout le monde */}
                        <div className="flex w-full flex-wrap gap-1 justify-end">
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
                        {threadedPosts.map(({ post, depth }, index) => {
                          const likesCount = post.likesCount ?? 0;
                          const indentPx = depth > 0 ? 14 : 0;
                          const isNested = depth > 0;
                          const hasLiked = !!post.liked;
                          return (
                            <div
                              key={post._id}
                              id={`reponse-${post._id}`}
                              className={`px-3 py-2.5 text-sm flex flex-col sm:flex-row items-start justify-between gap-3 ${
                                isNested
                                  ? 'border-t border-gray-200'
                                  : 'border border-gray-200 rounded-lg bg-gray-50'
                              }`}
                            >
                              <div
                                className="flex-1 min-w-0"
                                style={{
                                  paddingLeft: `${indentPx}px`,
                                }}
                              >
                                <div className="mb-1.5">
                                  {post.isVerified && (
                                    <span
                                      className="ml-1 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold align-middle"
                                      title="Approuvée"
                                      aria-label="Approuvée"
                                      onClick={() => window.alert('Réponse approuvée')}
                                    >
                                      ✓
                                    </span>
                                  )}
                                  {post.isRejected && (
                                    <span
                                      className="ml-1 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-red-100 text-red-800 border border-red-200 text-[11px] font-bold align-middle"
                                      title="Désapprouvée"
                                      aria-label="Désapprouvée"
                                      onClick={() => window.alert('Réponse désapprouvée')}
                                    >
                                      X
                                    </span>
                                  )}
                                </div>
                                <div className="mb-1 text-[11px] text-gray-500 break-words">
                                  {getAuthorLabel(post.createdBy, post.guestName)}
                                </div>
                                {canEditPost(post) && editingPostId === post._id ? (
                                  <div className="space-y-2">
                                    <textarea
                                      value={editingBody}
                                      onChange={(e) => setEditingBody(e.target.value)}
                                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 min-h-[90px]"
                                      placeholder="Modifier la réponse..."
                                    />
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        disabled={savingPostId === post._id || !editingBody.trim()}
                                        onClick={() => handleAdminSavePostEdit(post._id)}
                                        className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
                                      >
                                        {savingPostId === post._id ? 'Enregistrement...' : 'Enregistrer'}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={savingPostId === post._id}
                                        onClick={handleAdminCancelEditPost}
                                        className="inline-flex items-center justify-center px-2.5 py-1 rounded-md border border-gray-300 bg-white text-[11px] text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                                      >
                                        Annuler
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-gray-800 whitespace-pre-line break-words">
                                    {post.body}
                                  </p>
                                )}
                                <div className="mt-2 flex w-full flex-row flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
                                  <span className="break-words">
                                    {post.createdAt
                                      ? new Date(post.createdAt).toLocaleString('fr-FR', {
                                          dateStyle: 'short',
                                          timeStyle: 'short',
                                        })
                                      : ''}
                                  </span>
                                  <div className="relative flex flex-wrap items-center justify-end gap-2" ref={openShareId === `post-${post._id}` ? shareMenuRef : null}>
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
                                    <button
                                      type="button"
                                      onClick={() => setReplyTargetId(post._id)}
                                      className="list-none cursor-pointer px-1.5 py-0.5 text-[11px] rounded border border-gray-300 text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1"
                                    >
                                      Répondre
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setOpenShareId((prev) => (prev === `post-${post._id}` ? null : `post-${post._id}`))}
                                      className="list-none cursor-pointer px-1.5 py-0.5 text-[11px] rounded border border-green-300 text-green-700 hover:bg-green-50 inline-flex items-center gap-1"
                                    >
                                      Partager
                                    </button>
                                    {openShareId === `post-${post._id}` && (
                                    <div className="fixed left-1/2 top-1/2 z-40 w-[170px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border border-gray-200 bg-white shadow-md p-1">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const base = getThreadUrl();
                                          const url = `${base}#reponse-${post._id}`;
                                          const message = `Vous êtes invité(e) à participer à cette discussion sur ${url}\nRéponse: ${getExcerpt(post.body || '')}\nhttps://www.adapapers.fr/`;
                                          if (navigator?.clipboard) await navigator.clipboard.writeText(message);
                                          setOpenShareId(null);
                                        }}
                                        className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100 whitespace-normal break-words"
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
                                        className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100 text-green-700 whitespace-normal break-words"
                                      >
                                        WhatsApp
                                      </button>
                                    </div>
                                    )}
                                  </div>
                                </div>
                                {replyTargetId === post._id && (
                                  <form onSubmit={handleSendReply} className="mt-3 space-y-2 rounded-md border border-gray-200 bg-white p-3">
                                    <div className="flex items-center justify-between gap-2 text-xs text-gray-700">
                                      <span>Réponse à {replyTargetLabel}</span>
                                      <button
                                        type="button"
                                        onClick={() => setReplyTargetId(null)}
                                        className="text-gray-600 hover:text-gray-900 underline"
                                      >
                                        Annuler
                                      </button>
                                    </div>
                                    {status !== 'authenticated' && (
                                      <input
                                        type="text"
                                        value={replyGuestName}
                                        onChange={(e) => setReplyGuestName(e.target.value)}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                        maxLength={120}
                                        placeholder="Votre nom (optionnel)"
                                      />
                                    )}
                                    <textarea
                                      value={replyBody}
                                      onChange={(e) => setReplyBody(e.target.value)}
                                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 min-h-[90px]"
                                      placeholder="Écrivez votre réponse..."
                                    />
                                    <div className="flex justify-end">
                                      <button
                                        type="submit"
                                        disabled={sending || !replyBody.trim()}
                                        className="inline-flex items-center justify-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                      >
                                        {sending ? 'Envoi...' : 'Publier'}
                                      </button>
                                    </div>
                                  </form>
                                )}
                              </div>
                              {(isAdmin || canEditPost(post)) && (
                                <div className="flex flex-row sm:flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                                  {isAdmin && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={verifyingPostId === post._id}
                                        onClick={() =>
                                          handleAdminVerifyPost(post._id, {
                                            isVerified: !post.isVerified,
                                            isRejected: false,
                                          })
                                        }
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
                                        disabled={verifyingPostId === post._id}
                                        onClick={() =>
                                          handleAdminVerifyPost(post._id, {
                                            isRejected: !post.isRejected,
                                            isVerified: false,
                                          })
                                        }
                                        className="text-[10px] text-red-700 hover:text-red-800 disabled:opacity-60"
                                      >
                                        {verifyingPostId === post._id
                                          ? 'Mise à jour...'
                                          : post.isRejected
                                            ? 'Retirer Désapprouvée'
                                            : 'Marquer Désapprouvée'}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={deletingPostId === post._id}
                                        onClick={() => handleAdminDeletePost(post._id)}
                                        className="text-[10px] text-red-600 hover:text-red-700 disabled:opacity-60"
                                      >
                                        {deletingPostId === post._id ? 'Suppression...' : 'Supprimer'}
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    disabled={savingPostId === post._id}
                                    onClick={() =>
                                      editingPostId === post._id
                                        ? handleAdminCancelEditPost()
                                        : handleAdminStartEditPost(post)
                                    }
                                    className="text-[10px] text-gray-700 hover:text-gray-900 disabled:opacity-60"
                                  >
                                    {editingPostId === post._id ? 'Fermer édition' : 'Modifier'}
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
                    ) : replyTargetId ? (
                      <p className="text-sm text-gray-600">
                        Vous répondez actuellement à {replyTargetLabel}. Le formulaire est affiché sous la réponse sélectionnée.
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
                            ref={mainReplyTextareaRef}
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
                            className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
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

