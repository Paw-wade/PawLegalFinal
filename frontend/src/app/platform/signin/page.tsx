'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSession, signIn, signOut, useSession } from 'next-auth/react';
import { PlatformConsoleBrand } from '@/components/platform/PlatformConsoleBrand';
import {
  hasPlatformConsoleAccess,
  persistPlatformApiToken,
  PLATFORM_CONSOLE_PATH,
} from '@/lib/auth/platformSession';
import { getPlatformAccessDeniedMessage } from '@/lib/platformAdmin';

function PlatformSignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isRedirecting = useRef(false);

  const callbackUrl = searchParams.get('callbackUrl') || PLATFORM_CONSOLE_PATH;
  const denied = searchParams.get('denied') === '1';

  useEffect(() => {
    if (denied) {
      setError(
        'Ce compte n’a pas accès à la console plateforme. ' + getPlatformAccessDeniedMessage()
      );
    }
  }, [denied]);

  useEffect(() => {
    if (status !== 'authenticated' || isRedirecting.current) return;
    if (hasPlatformConsoleAccess(session)) {
      isRedirecting.current = true;
      const user = session?.user as { accessToken?: string };
      persistPlatformApiToken(user?.accessToken);
      router.replace(callbackUrl.startsWith('/platform') ? callbackUrl : PLATFORM_CONSOLE_PATH);
    }
  }, [status, session, router, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRedirecting.current) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(
          result.error === 'CredentialsSignin'
            ? 'Email ou mot de passe incorrect'
            : result.error
        );
        setIsLoading(false);
        return;
      }

      if (!result?.ok) {
        setIsLoading(false);
        return;
      }

      const sessionData = await getSession();
      if (!hasPlatformConsoleAccess(sessionData)) {
        await signOut({ redirect: false });
        setError(`Accès refusé. ${getPlatformAccessDeniedMessage()}`);
        setIsLoading(false);
        return;
      }

      const user = sessionData?.user as { accessToken?: string };
      persistPlatformApiToken(user?.accessToken);
      isRedirecting.current = true;
      router.replace(callbackUrl.startsWith('/platform') ? callbackUrl : PLATFORM_CONSOLE_PATH);
    } catch {
      setError('Une erreur est survenue lors de la connexion.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <PlatformConsoleBrand className="mx-auto" variant="signin" />
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-900/80 border border-slate-700 rounded-xl p-6 shadow-xl space-y-4 backdrop-blur-sm"
        >
          {error && (
            <div className="rounded-md bg-red-950/50 border border-red-800 text-red-200 text-sm px-3 py-2">
              {error}
            </div>
          )}

          <label className="block text-sm">
            <span className="text-slate-300 font-medium">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full h-11 rounded-md border border-slate-600 bg-slate-950 px-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="admin@adapapers.fr"
            />
          </label>

          <label className="block text-sm">
            <span className="text-slate-300 font-medium">Mot de passe</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full h-11 rounded-md border border-slate-600 bg-slate-950 px-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 rounded-md bg-orange-500 hover:bg-orange-600 font-semibold text-white transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Connexion…' : 'Accéder à la console'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500">
          Connexion cabinet ou client ?{' '}
          <Link href="/auth/signin" className="text-orange-400 hover:underline">
            Espace classique
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function PlatformSignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
          Chargement…
        </div>
      }
    >
      <PlatformSignInForm />
    </Suspense>
  );
}
