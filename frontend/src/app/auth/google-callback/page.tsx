'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, useSession } from 'next-auth/react';
import { redirectAfterLogin, type SessionUserLike } from '@/lib/auth/postLoginRedirect';

/**
 * Page d’atterrissage après OAuth Google (connexion ou inscription).
 */
export default function GoogleCallbackPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [sessionPoll, setSessionPoll] = useState(0);

  useEffect(() => {
    if (status === 'loading') return;

    const user = (session?.user || {}) as SessionUserLike;
    const sessionMeta = session as {
      authError?: string;
      redirectToSignup?: boolean;
      tenantSlug?: string;
    } | null;

    const authError = user.authError ?? sessionMeta?.authError;
    const redirectToSignup = user.redirectToSignup ?? sessionMeta?.redirectToSignup;

    if (authError) {
      const q = new URLSearchParams({ error: 'google', message: authError });
      router.replace(`/auth/signin?${q.toString()}`);
      return;
    }

    if (redirectToSignup || user.googleSignupPending) {
      router.replace('/auth/signup');
      return;
    }

    if (user.accessToken) {
      const target = redirectAfterLogin({
        ...user,
        tenantSlug: user.tenantSlug ?? sessionMeta?.tenantSlug,
      });
      router.replace(target);
      return;
    }

    if (status === 'authenticated' && sessionPoll < 4) {
      const t = window.setTimeout(() => {
        void getSession().then(() => setSessionPoll((n) => n + 1));
      }, 350);
      return () => window.clearTimeout(t);
    }

    if (status === 'unauthenticated') {
      router.replace(
        '/auth/signin?error=google&message=' + encodeURIComponent('Connexion Google annulée ou expirée.')
      );
      return;
    }

    router.replace(
      '/auth/signin?error=google&message=' +
        encodeURIComponent('Connexion Google incomplète. Réessayez ou utilisez email et mot de passe.')
    );
  }, [session, status, router, sessionPoll]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <div className="text-center space-y-3 p-8">
        <div className="animate-spin h-10 w-10 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-sm text-muted-foreground">Finalisation de la connexion Google…</p>
      </div>
    </div>
  );
}

