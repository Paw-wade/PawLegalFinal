'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Scale, Sparkles } from 'lucide-react';

function backHrefForRole(role: string | undefined): string {
  if (role === 'partenaire') return '/partenaire';
  return '/client';
}

export default function PawAiComingSoon() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const backHref = backHrefForRole(role);

  return (
    <div className="flex flex-1 flex-col min-h-0 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/80 shadow-sm px-6 py-10 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600 ring-1 ring-orange-500/20">
          <Scale className="h-8 w-8" aria-hidden />
        </div>
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          En cours de conception
        </div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Paw AI</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Cette fonctionnalité est en cours de conception. Elle sera bientôt disponible depuis votre espace.
        </p>
        <Link
          href={backHref}
          className="mt-8 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
