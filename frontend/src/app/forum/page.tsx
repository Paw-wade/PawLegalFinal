'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { forumAPI } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

interface ForumThread {
  _id: string;
  title: string;
  body: string;
  repliesCount: number;
  viewsCount: number;
  createdAt: string;
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

export default function ForumPage() {
  const { status, data: session } = useSession();
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [creating, setCreating] = useState(false);

  const userRole = (session?.user as any)?.role || 'client';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  useEffect(() => {
    const loadThreads = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await forumAPI.listThreads({ page: 1, limit: 50 });
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
  }, []);

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    try {
      setCreating(true);
      setError(null);
      const response = await forumAPI.createThread({ title: title.trim(), body: body.trim() });
      const created = response.data?.data as ForumThread;
      if (created) {
        setThreads((prev) => [created, ...prev]);
        setTitle('');
        setBody('');
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

        {/* Règles du forum */}
        <section className="mb-8 bg-white rounded-xl shadow-sm border border-amber-200 p-5">
          <h2 className="text-sm md:text-base font-semibold mb-2">Règles du forum</h2>
          <ul className="list-disc pl-5 space-y-1 text-xs md:text-sm text-gray-700">
            <li>Ne publiez pas de données sensibles : numéros de titre de séjour complets, numéros de passeport, adresses exactes, etc.</li>
            <li>Restez respectueux dans vos échanges, aucun propos discriminatoire ou agressif n&apos;est toléré.</li>
            <li>Les réponses données sur ce forum sont informatives et ne constituent pas un conseil juridique personnalisé.</li>
            <li>Pour une prise en charge complète de votre dossier, utilisez les fonctionnalités de la plateforme et suivez les instructions de votre espace client.</li>
            <li>Les administrateurs se réservent le droit de modifier ou supprimer tout contenu non conforme à ces règles.</li>
          </ul>
        </section>

        <div className="lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] lg:gap-6 items-start">
          {/* Colonne principale */}
          <div className="space-y-8">
            {/* Création d'une nouvelle discussion */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-lg font-semibold mb-3">Créer une nouvelle discussion</h2>
              {status !== 'authenticated' ? (
                <div className="text-sm text-gray-700 space-y-3">
                  <p>
                    Vous devez être connecté pour créer une discussion. Connectez-vous ou créez un compte pour poser vos questions.
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
                <form onSubmit={handleCreateThread} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Titre de la discussion
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      placeholder="Exemple : Question sur le renouvellement de titre de séjour"
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Message
                    </label>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 min-h-[120px]"
                      placeholder="Décrivez votre situation et vos questions de manière précise tout en respectant la confidentialité."
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-red-600">{error}</p>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={creating || !title.trim() || !body.trim()}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      {creating ? 'Publication...' : 'Publier la discussion'}
                    </button>
                  </div>
                </form>
              )}
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
                  {threads.map((thread) => {
                    const authorName = thread.createdBy
                      ? `${thread.createdBy.prenom || ''} ${thread.createdBy.nom || ''}`.trim() || 'Utilisateur'
                      : 'Utilisateur';
                    return (
                      <Link
                        key={thread._id}
                        href={`/forum/${thread._id}`}
                        className="block bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm md:text-base font-semibold text-gray-900">
                              {thread.title}
                            </h3>
                            <p className="mt-1 text-xs md:text-sm text-gray-600 line-clamp-2">
                              {thread.body}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] md:text-xs text-gray-500">
                              <span>
                                {thread.repliesCount || 0} réponse{thread.repliesCount === 1 ? '' : 's'} •{' '}
                                {thread.viewsCount || 0} vue{thread.viewsCount === 1 ? '' : 's'}
                              </span>
                              <span className="truncate max-w-[60%]">
                                par {authorName}
                              </span>
                              <span>
                                {thread.createdAt
                                  ? new Date(thread.createdAt).toLocaleDateString('fr-FR')
                                  : ''}
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
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Barre latérale : liste compacte des discussions */}
          <aside className="mt-8 lg:mt-0 space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-sm font-semibold mb-3">Toutes les discussions</h2>
              {loading ? (
                <p className="text-xs text-gray-600">Chargement...</p>
              ) : threads.length === 0 ? (
                <p className="text-xs text-gray-600">Aucune discussion pour le moment.</p>
              ) : (
                <ul className="space-y-2 max-h-[420px] overflow-y-auto text-xs">
                  {threads.map((thread) => (
                    <li key={thread._id}>
                      <Link
                        href={`/forum/${thread._id}`}
                        className="block rounded-md px-2 py-1 hover:bg-gray-50 text-gray-800"
                      >
                        <div className="font-medium truncate">{thread.title}</div>
                        <div className="text-[11px] text-gray-500 flex justify-between gap-2">
                          <span>{thread.repliesCount || 0} rep.</span>
                          <span>
                            {thread.createdAt
                              ? new Date(thread.createdAt).toLocaleDateString('fr-FR')
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

