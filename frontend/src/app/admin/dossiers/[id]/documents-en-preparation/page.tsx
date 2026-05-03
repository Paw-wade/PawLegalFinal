'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { DossierDraftsPanel } from '@/components/DossierDraftsPanel';

const STAFF_ROLES = ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'] as const;

function isStaffRole(role: string | undefined) {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

export default function AdminDossierDocumentsEnPreparationPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const dossierId = params?.id as string;
  const initialDraftId = searchParams.get('draft');

  useEffect(() => {
    if (status === 'loading') return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (status === 'unauthenticated' && !token) {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated' && session) {
      const role = (session.user as any)?.role;
      if (!isStaffRole(role)) {
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
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-gray-800">
          <span className="font-medium">Autre brouillon (même éditeur riche, export .docx)</span>
          {' — '}
          <Link
            href={`/admin/documents/preparation?dossierId=${encodeURIComponent(dossierId)}`}
            className="text-primary font-semibold hover:underline"
          >
            Liste globale des documents en préparation
          </Link>
        </div>
        <DossierDraftsPanel dossierId={dossierId} initialDraftId={initialDraftId} />
      </main>
    </div>
  );
}
