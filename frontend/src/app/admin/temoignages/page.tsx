'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { temoignagesAPI } from '@/lib/api';

function Button({ children, variant = 'default', size = 'default', className = '', disabled = false, ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-red-500 text-white hover:bg-red-600',
  };
  const sizeClasses = {
    default: 'h-10 py-2 px-4',
    sm: 'h-9 px-3',
    lg: 'h-11 px-8',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} disabled={disabled} {...props}>{children}</button>;
}

export default function AdminTemoignagesPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [temoignages, setTemoignages] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'validated'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (session) {
      const userRole = (session.user as any)?.role;
      const isAuthorized = userRole === 'admin' || userRole === 'superadmin';
      if (!isAuthorized) {
        router.push('/client');
      }
    }
  }, [session, status, router]);

  useEffect(() => {
    loadTemoignages();
  }, [filter, status]);

  const loadTemoignages = async () => {
    if (status !== 'authenticated') return;
    
    setIsLoading(true);
    try {
      const valide = filter === 'all' ? undefined : filter === 'validated';
      const response = await temoignagesAPI.getAllTemoignages(valide);
      if (response.data.success) {
        setTemoignages(response.data.data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des témoignages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidate = async (id: string, valide: boolean) => {
    setProcessingId(id);
    try {
      const response = await temoignagesAPI.validateTemoignage(id, valide);
      if (response.data.success) {
        await loadTemoignages();
      }
    } catch (error) {
      console.error('Erreur lors de la validation:', error);
      alert('Une erreur est survenue lors de la validation');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce témoignage ?')) {
      return;
    }

    setProcessingId(id);
    try {
      const response = await temoignagesAPI.deleteTemoignage(id);
      if (response.data.success) {
        await loadTemoignages();
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      alert('Une erreur est survenue lors de la suppression');
    } finally {
      setProcessingId(null);
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const pendingCount = temoignages.filter(t => !t.valide).length;
  const validatedCount = temoignages.filter(t => t.valide).length;

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Gestion des témoignages</h1>
          <p className="text-muted-foreground text-lg">Validez ou rejetez les témoignages soumis par les clients</p>
        </div>

        {/* Statistiques */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-gray-400">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase">Total</h3>
              <span className="text-2xl">📝</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{temoignages.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-orange-500">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase">En attente</h3>
              <span className="text-2xl">⏳</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{pendingCount}</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase">Validés</h3>
              <span className="text-2xl">✅</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{validatedCount}</p>
          </div>
        </div>

        {/* Filtres */}
        <div className="mb-6 flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
          >
            Tous ({temoignages.length})
          </Button>
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            onClick={() => setFilter('pending')}
          >
            En attente ({pendingCount})
          </Button>
          <Button
            variant={filter === 'validated' ? 'default' : 'outline'}
            onClick={() => setFilter('validated')}
          >
            Validés ({validatedCount})
          </Button>
        </div>

        {/* Liste des témoignages */}
        <div className="space-y-4">
          {temoignages.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📝</span>
              </div>
              <p className="text-muted-foreground text-lg">Aucun témoignage {filter === 'pending' ? 'en attente' : filter === 'validated' ? 'validé' : ''}</p>
            </div>
          ) : (
            temoignages.map((temoignage) => (
              <div
                key={temoignage._id}
                className={`bg-white rounded-xl shadow-md p-6 border-l-4 ${
                  temoignage.valide ? 'border-green-500' : 'border-orange-500'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-primary font-semibold">
                          {temoignage.nom?.split(' ').map((n: string) => n[0]).join('') || 'C'}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{temoignage.nom}</p>
                        <p className="text-sm text-muted-foreground">{temoignage.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mb-3">
                      {[...Array(5)].map((_, i) => (
                        <span
                          key={i}
                          className={`text-xl ${i < temoignage.note ? 'text-primary' : 'text-muted-foreground'}`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    <p className="text-muted-foreground italic mb-4">"{temoignage.texte}"</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        Client: {temoignage.user?.firstName} {temoignage.user?.lastName}
                      </span>
                      <span>•</span>
                      <span>
                        Soumis le: {new Date(temoignage.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                      {temoignage.valide && temoignage.validePar && (
                        <>
                          <span>•</span>
                          <span>
                            Validé le: {new Date(temoignage.dateValidation).toLocaleDateString('fr-FR')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="ml-4">
                    {temoignage.valide ? (
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                        Validé
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
                        En attente
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-4 border-t">
                  {!temoignage.valide && (
                    <Button
                      onClick={() => handleValidate(temoignage._id, true)}
                      disabled={processingId === temoignage._id}
                      className="flex-1"
                    >
                      {processingId === temoignage._id ? 'Validation...' : 'Valider'}
                    </Button>
                  )}
                  {temoignage.valide && (
                    <Button
                      variant="outline"
                      onClick={() => handleValidate(temoignage._id, false)}
                      disabled={processingId === temoignage._id}
                      className="flex-1"
                    >
                      {processingId === temoignage._id ? 'Rejet...' : 'Rejeter'}
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    onClick={() => handleDelete(temoignage._id)}
                    disabled={processingId === temoignage._id}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}


