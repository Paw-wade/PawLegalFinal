'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  AdminPermissionDomain,
  canViewAdminDomain,
  getStaffLandingPath,
  isCabinetStaffRole,
} from '@/lib/staffAccess';

/**
 * Redirige les clients hors /admin et les rôles staff sans droit sur le domaine.
 */
export function useStaffDomainGuard(domain: AdminPermissionDomain | 'compte') {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role as string | undefined;

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    if (!isCabinetStaffRole(userRole)) {
      router.push('/client');
      return;
    }
    if (domain === 'compte') return;
    if (!canViewAdminDomain(userRole, domain)) {
      router.replace(getStaffLandingPath(userRole));
    }
  }, [session, status, userRole, domain, router]);

  const allowed =
    status === 'authenticated' &&
    isCabinetStaffRole(userRole) &&
    (domain === 'compte' || canViewAdminDomain(userRole, domain));

  return { allowed, loading: status === 'loading', userRole };
}
