'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { temoignagesAPI } from '@/lib/api';

function Button({ children, variant = 'default', className = '', disabled = false, ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} disabled={disabled} {...props}>{children}</button>;
}

function Input({ className = '', ...props }: any) {
  return (
    <input
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function Label({ className = '', children, ...props }: any) {
  return (
    <label className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`} {...props}>
      {children}
    </label>
  );
}

export default function TemoignagesPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [texte, setTexte] = useState('');
  const [note, setNote] = useState(5);
  const [nom, setNom] = useState('');
  const [role, setRole] = useState('Client');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [myTemoignage, setMyTemoignage] = useState<any>(null);
  const [loadingTemoignage, setLoadingTemoignage] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (session && !(session.user as any).profilComplete) {
      router.push('/auth/complete-profile');
    } else if (session) {
      // Vérifier si on est en mode impersonation
      const isImpersonating = typeof window !== 'undefined' && 
        !!localStorage.getItem('impersonateUserId');
      
      // Si admin et PAS en impersonation, rediriger vers /admin
      if (((session.user as any)?.role === 'admin' || (session.user as any)?.role === 'superadmin') && !isImpersonating) {
        router.push('/admin');
      }
    }
  }, [session, status, router]);

  useEffect(() => {
    const loadMyTemoignage = async () => {
      if (status === 'authenticated') {
        try {
          const response = await temoignagesAPI.getMyTemoignage();
          if (response.data.success && response.data.data) {
            setMyTemoignage(response.data.data);
            setTexte(response.data.data.texte);
            setNote(response.data.data.note);
            setNom(response.data.data.nom || '');
            setRole(response.data.data.role || 'Client');
          }
        } catch (error: any) {
          if (error.response?.status !== 404) {
            console.error('Erreur lors du chargement du témoignage:', error);
          }
        } finally {
          setLoadingTemoignage(false);
        }
      }
    };
    loadMyTemoignage();
  }, [status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    if (texte.trim().length < 10) {
      setError('Le témoignage doit contenir au moins 10 caractères');
      setIsLoading(false);
      return;
    }

    if (texte.trim().length > 500) {
      setError('Le témoignage ne peut pas dépasser 500 caractères');
      setIsLoading(false);
      return;
    }

    try {
      const response = await temoignagesAPI.createTemoignage({
        texte: texte.trim(),
        note,
        nom: nom.trim() || undefined,
        role: role.trim() || undefined,
      });

      if (response.data.success) {
        setSuccess(response.data.message);
        setMyTemoignage(response.data.data);
        setTimeout(() => {
          router.push('/client');
        }, 2000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Une erreur est survenue lors de la soumission du témoignage');
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading' || loadingTemoignage) {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <main className="w-full px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Publier un témoignage
          </h1>
          <p className="text-muted-foreground text-lg">
            Partagez votre expérience avec Paw Legal. Votre témoignage sera publié après validation par un administrateur.
          </p>
        </div>

        {myTemoignage && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Note :</strong> Vous avez déjà soumis un témoignage. 
              {myTemoignage.valide ? (
                <span className="text-green-700"> Il a été validé et est visible sur le site.</span>
              ) : (
                <span className="text-orange-700"> Il est en attente de validation par un administrateur.</span>
              )}
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">{success}</p>
              </div>
            )}

            <div>
              <Label htmlFor="note">Note (sur 5) *</Label>
              <div className="flex items-center gap-2 mt-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNote(n)}
                    className={`text-3xl transition-transform hover:scale-110 ${
                      n <= note ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    ★
                  </button>
                ))}
                <span className="ml-4 text-sm text-muted-foreground">{note}/5</span>
              </div>
            </div>

            <div>
              <Label htmlFor="texte">Votre témoignage *</Label>
              <textarea
                id="texte"
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                placeholder="Partagez votre expérience avec Paw Legal (10-500 caractères)"
                required
                rows={6}
                maxLength={500}
                className="mt-2 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {texte.length}/500 caractères
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nom">Nom (optionnel)</Label>
                <Input
                  id="nom"
                  type="text"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Votre nom (par défaut: votre prénom et nom)"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="role">Rôle (optionnel)</Label>
                <Input
                  id="role"
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Ex: Client, Cliente"
                  className="mt-2"
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={isLoading || texte.trim().length < 10}
                className="flex-1"
              >
                {isLoading ? 'Envoi en cours...' : 'Soumettre mon témoignage'}
              </Button>
              <Link href="/client">
                <Button type="button" variant="outline">
                  Annuler
                </Button>
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}


