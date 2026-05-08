'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function LexiaPublicLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
        Chargement…
      </div>
    );
  }

  if (status === 'unauthenticated' || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
        Redirection…
      </div>
    );
  }

  const userRole = (session.user as { role?: string })?.role || 'client';
  const isAdminUiRole =
    userRole === 'admin' ||
    userRole === 'superadmin' ||
    userRole === 'assistant' ||
    userRole === 'comptable' ||
    userRole === 'secretaire' ||
    userRole === 'juriste' ||
    userRole === 'stagiaire';
  const isPartenaire = userRole === 'partenaire';
  const variant = isAdminUiRole ? 'admin' : isPartenaire ? 'partenaire' : 'client';

  return <DashboardLayout variant={variant}>{children}</DashboardLayout>;
}
