'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { getStaffLandingPath, isCabinetStaffRole } from '@/lib/staffAccess';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'loading') return;
    
    if (status === 'authenticated' && session) {
      const userRole = (session.user as any)?.role;
      const isPartenaire = userRole === 'partenaire';

      if (isCabinetStaffRole(userRole)) {
        router.push(getStaffLandingPath(userRole));
        return;
      }

      if (isPartenaire) {
        router.push('/partenaire');
        return;
      }
    }
  }, [session, status, router, pathname]);

  // Si admin ou partenaire, ne rien afficher (redirection en cours)
  if (status === 'authenticated' && session) {
    const userRole = (session.user as any)?.role;
    const isPartenaire = userRole === 'partenaire';

    if (isCabinetStaffRole(userRole) || isPartenaire) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Redirection...</p>
          </div>
        </div>
      );
    }
  }

  return <DashboardLayout variant="client">{children}</DashboardLayout>;
}

