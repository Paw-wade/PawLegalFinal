'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { userAPI } from '@/lib/api';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

export default function ImpersonatePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    
    if (status === 'unauthenticated' || !session) {
      router.push('/auth/signin');
      return;
    }

    const userRole = (session?.user as any)?.role;
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      router.push('/client');
      return;
    }

    loadUsers();
  }, [session, status, router]);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await userAPI.getAllUsers();
      if (response.data.success) {
        // Filtrer pour ne garder que les clients (pas les admins)
        const clients = (response.data.users || []).filter(
          (user: any) => user.role === 'client'
        );
        setUsers(clients);
      } else {
        setError('Erreur lors du chargement des utilisateurs');
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des utilisateurs:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement des utilisateurs');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImpersonate = async (userId: string) => {
    try {
      // Stocker l'ID de l'utilisateur à impersonner dans localStorage
      localStorage.setItem('impersonateUserId', userId);
      localStorage.setItem('impersonateAdminId', (session?.user as any)?._id || '');
      
      // Rediriger vers le dashboard client avec un paramètre d'impersonation
      router.push(`/client?impersonate=true`);
    } catch (err: any) {
      console.error('Erreur lors de l\'impersonation:', err);
      setError('Erreur lors de l\'impersonation');
    }
  };

  const filteredUsers = users.filter((user) => {
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
    const email = (user.email || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return fullName.includes(search) || email.includes(search);
  });

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <main className="w-full px-4 py-8">
        <div className="mb-8">
          <Link href="/admin">
            <Button variant="ghost" className="mb-4">
              ← Retour au dashboard admin
            </Button>
          </Link>
          <h1 className="text-4xl font-bold mb-2">Vue Client - Sélection d'utilisateur</h1>
          <p className="text-muted-foreground text-lg">
            Sélectionnez un utilisateur pour accéder à son dashboard
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        )}

        {/* Barre de recherche */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Rechercher un utilisateur (nom, email)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Liste des utilisateurs */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <p className="text-muted-foreground">
                {searchTerm ? 'Aucun utilisateur trouvé' : 'Aucun utilisateur disponible'}
              </p>
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div
                key={user._id || user.id}
                className="bg-white rounded-xl shadow-md p-6 border border-border hover:shadow-lg transition-all cursor-pointer"
                onClick={() => handleImpersonate(user._id || user.id)}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-lg">
                      {user.firstName?.charAt(0)?.toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-foreground mb-1 truncate">
                      {user.firstName} {user.lastName}
                    </h3>
                    <p className="text-sm text-muted-foreground truncate mb-2">
                      {user.email}
                    </p>
                    {user.phone && (
                      <p className="text-xs text-muted-foreground">
                        {user.phone}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-border">
                  <Button className="w-full" onClick={(e: any) => {
                    e.stopPropagation();
                    handleImpersonate(user._id || user.id);
                  }}>
                    Accéder au dashboard →
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


