'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { DossierDraftsPanel } from '@/components/DossierDraftsPanel';

export default function AdminDossierDocumentsEnPreparationPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const dossierId = params?.id as string;

  useEffect(() => {
    if (status === 'loading') return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (status === 'unauthenticated' && !token) {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated' && session) {
      const role = (session.user as any)?.role;
      if (role !== 'admin' && role !== 'superadmin') {
        router.push('/client');
      }
    }
  }, [session, status, router]);

  if (!dossierId) {
    return (
      <div className="min-h-screen bg-background p-8">
        <p className="text-muted-foreground">Dossier introuvable.</p>
        <Link href="/admin/dossiers" className="text-primary hover:underline mt-2 inline-block">
          Retour aux dossiers
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/10">
      <main className="w-full max-w-5xl mx-auto px-4 py-8">
        <Link
          href={`/admin/dossiers/${dossierId}`}
          className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 mb-6 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Retour au dossier
        </Link>
        <DossierDraftsPanel dossierId={dossierId} />
      </main>
    </div>
  );
}
