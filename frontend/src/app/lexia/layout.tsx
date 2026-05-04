'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

/** Même périmètre que la sidebar admin (hors partenaire / client). */
const STAFF_ADMIN_UI_ROLES = new Set([
  'admin',
  'superadmin',
  'assistant',
  'comptable',
  'secretaire',
  'juriste',
  'stagiaire',
]);

export default function LexiaPublicLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) return;
    const userRole = (session.user as { role?: string })?.role || 'client';
    if (STAFF_ADMIN_UI_ROLES.has(userRole)) {
      router.replace('/admin/lexia');
    }
  }, [status, session, router]);

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
  if (STAFF_ADMIN_UI_ROLES.has(userRole)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
        Redirection vers Ada AI (espace équipe)…
      </div>
    );
  }

  const isPartenaire = userRole === 'partenaire';
  const variant = isPartenaire ? 'partenaire' : 'client';

  return <DashboardLayout variant={variant}>{children}</DashboardLayout>;
}
