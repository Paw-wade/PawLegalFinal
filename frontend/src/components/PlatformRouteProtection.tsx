'use client';

import { useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  hasPlatformConsoleAccess,
  PLATFORM_SIGNIN_PATH,
} from '@/lib/auth/platformSession';
import { getPlatformAccessDeniedMessage } from '@/lib/platformAdmin';

interface PlatformRouteProtectionProps {
  children: React.ReactNode;
}

export function PlatformRouteProtection({ children }: PlatformRouteProtectionProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = hasPlatformConsoleAccess(session);
  const user = session?.user as { email?: string; role?: string } | undefined;

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      const q = new URLSearchParams();
      q.set('callbackUrl', pathname || '/platform');
      router.replace(`${PLATFORM_SIGNIN_PATH}?${q.toString()}`);
    }
  }, [status, pathname, router]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin h-10 w-10 border-2 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-slate-600 text-sm">
        Redirection vers la connexion plateforme…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="max-w-lg mx-auto mt-16 p-8 bg-white border border-slate-200 rounded-xl shadow-sm text-center space-y-4">
        <div className="text-4xl">🔒</div>
        <h2 className="text-xl font-bold text-slate-900">Accès plateforme refusé</h2>
        <p className="text-sm text-slate-600">
          La console SaaS est réservée aux <strong>superadmins Ada Papers</strong> (équipe
          plateforme). Un superadmin d&apos;un cabinet client ne peut pas y accéder.
        </p>
        <p className="text-xs text-slate-500">{getPlatformAccessDeniedMessage()}</p>
        <p className="text-xs text-slate-500">
          Connecté : {user?.email || '—'} ({user?.role || '—'})
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: PLATFORM_SIGNIN_PATH })}
            className="px-4 py-2 text-sm bg-slate-900 text-white rounded-md hover:bg-slate-800"
          >
            Changer de compte
          </button>
          <Link
            href="/auth/signin"
            className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Connexion cabinet / client
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
