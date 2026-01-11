'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';

interface RouteProtectionProps {
  children: React.ReactNode;
}

export function RouteProtection({ children }: RouteProtectionProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  const userRole = (session?.user as any)?.role || 'client';
  const isProfessional = userRole === 'consulat' || userRole === 'avocat' || userRole === 'association';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  useEffect(() => {
    // Les admins ont toujours accès
    if (isAdmin) {
      setHasAccess(true);
      setLoading(false);
      return;
    }

    // Si ce n'est pas un professionnel, autoriser l'accès
    if (!isProfessional) {
      setHasAccess(true);
      setLoading(false);
      return;
    }

    // Pour les professionnels, tous les menus sont accessibles
    // Le contenu sera vide par défaut si aucun dossier n'est transmis
    setHasAccess(true);
    setLoading(false);
  }, [pathname, userRole, isAdmin, isProfessional, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement des permissions...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess && isProfessional) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Accès refusé</h2>
          <p className="text-gray-600 mb-6">
            Vous n'avez pas accès à cette page.
          </p>
          <button
            onClick={() => router.push('/admin')}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retour au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

