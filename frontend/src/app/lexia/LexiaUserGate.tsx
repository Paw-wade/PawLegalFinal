'use client';

import { useSession } from 'next-auth/react';
import LexiaClient from '@/app/admin/lexia/LexiaClient';
import PawAiComingSoon from './PawAiComingSoon';

/**
 * /lexia : Paw AI accessible hors rôle client (ex. partenaire).
 * Comptes client → écran « en cours de conception » (desktop & mobile).
 */
export default function LexiaUserGate() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center text-sm text-muted-foreground">
        Chargement…
      </div>
    );
  }

  const role = String((session?.user as { role?: string } | undefined)?.role || 'client').toLowerCase();
  const isClient = role === 'client';

  if (isClient) {
    return <PawAiComingSoon />;
  }

  return <LexiaClient audience="user" />;
}
