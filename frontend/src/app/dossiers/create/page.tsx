'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import DemandeWizard from '@/components/demande/DemandeWizard';

export default function CreateDossierPage() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-bold text-primary hover:text-primary/80 transition-colors">
            Ada Papers
          </Link>
          <nav className="hidden items-center gap-4 text-sm md:flex">
            {session ? (
              <>
                <Link href="/client" className="text-muted-foreground hover:text-primary transition-colors">
                  Dashboard
                </Link>
                <Link href="/client/dossiers" className="text-muted-foreground hover:text-primary transition-colors">
                  Mes dossiers
                </Link>
              </>
            ) : (
              <Link href="/" className="text-muted-foreground hover:text-primary transition-colors">
                Accueil
              </Link>
            )}
          </nav>
          {session ? (
            <Link href="/client" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              {session.user?.name || 'Mon compte'}
            </Link>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <Link href="/auth/signin" className="text-muted-foreground hover:text-primary transition-colors">
                Connexion
              </Link>
              <Link href="/auth/signup" className="font-medium text-primary hover:underline">
                Inscription
              </Link>
            </div>
          )}
        </div>
      </header>

      <DemandeWizard />
    </div>
  );
}
