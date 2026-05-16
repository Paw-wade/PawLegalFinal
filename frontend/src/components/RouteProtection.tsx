'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import {
  canAccessAdminPath,
  getStaffLandingPath,
  isCabinetStaffRole,
  isFullAdminRole,
} from '@/lib/staffAccess';

interface RouteProtectionProps {
  children: React.ReactNode;
}

function LoaderSpinner({ label }: { label: string }) {
  return (
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}

export function RouteProtection({ children }: RouteProtectionProps) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [denied, setDenied] = useState(false);

  const userRole = (session?.user as any)?.role || 'client';
  const isProfessional =
    userRole === 'consulat' || userRole === 'avocat' || userRole === 'association';
  const isStaff = isCabinetStaffRole(userRole);
  const isAdmin = isFullAdminRole(userRole);

  useEffect(() => {
    if (status === 'loading') return;

    setDenied(false);

    if (status === 'unauthenticated') {
      setHasAccess(false);
      setLoading(false);
      router.push('/auth/signin');
      return;
    }

    if (!isStaff && !isProfessional) {
      setHasAccess(false);
      setLoading(false);
      router.push('/client');
      return;
    }

    if (isAdmin || isProfessional) {
      setHasAccess(true);
      setLoading(false);
      return;
    }

    if (canAccessAdminPath(userRole, pathname)) {
      setHasAccess(true);
      setLoading(false);
      return;
    }

    const fallback = getStaffLandingPath(userRole);
    if (fallback && fallback !== pathname) {
      setLoading(true);
      router.replace(fallback);
      return;
    }

    setHasAccess(false);
    setDenied(true);
    setLoading(false);
  }, [pathname, userRole, isAdmin, isProfessional, isStaff, router, status]);

  if (loading || status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoaderSpinner label="Chargement des permissions..." />
      </div>
    );
  }

  if (!hasAccess && !denied) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoaderSpinner label="Redirection..." />
      </div>
    );
  }

  if (denied) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Accès refusé</h2>
          <p className="text-gray-600 mb-6">Vous n&apos;avez pas accès à cette page.</p>
          <button
            type="button"
            onClick={() => router.push(getStaffLandingPath(userRole))}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retour à mon espace
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
