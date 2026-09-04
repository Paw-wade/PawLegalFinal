'use client';

import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { isStaffRole } from '@/lib/userRoles';
import { getAccessDeniedMessage } from '@/lib/permissions';
import { useStaffPermissions } from '@/contexts/StaffPermissionsContext';

interface RouteProtectionProps {
  children: React.ReactNode;
}

export function RouteProtection({ children }: RouteProtectionProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { loading, canAccessRoute, isScopedRoute } = useStaffPermissions();

  const userRole = (session?.user as any)?.role || 'client';

  // Les non-staff (clients/professionnels) ne sont pas soumis au contrôle
  // par domaine ici ; ils sont redirigés par les layouts respectifs.
  if (!isStaffRole(userRole)) {
    return <>{children}</>;
  }

  // Attendre le chargement des permissions avant de décider
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

  if (!canAccessRoute(pathname)) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center border border-gray-200">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Accès refusé</h2>
          <p className="text-gray-600 mb-6">{getAccessDeniedMessage(pathname)}</p>
          <button
            onClick={() => router.push('/admin')}
            className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
          >
            Retour au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  if (isScopedRoute(pathname)) {
    return (
      <>
        <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">Accès restreint -</span> vous n&apos;avez pas la permission
          complète pour cette rubrique. Seuls les éléments qui vous sont assignés sont affichés.
        </div>
        {children}
      </>
    );
  }

  return <>{children}</>;
}
