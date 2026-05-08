'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSession, useSession } from 'next-auth/react';
import { ensurePushSubscription } from '@/lib/pushClient';

const PUSH_PREPROMPT_LAST_SHOWN_KEY = 'push_preprompt_last_shown_at_v1';
const PREPROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function PushNotificationsBootstrap() {
  const { data: session, status } = useSession();
  const [showPrePrompt, setShowPrePrompt] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);

  const isAuthenticated = useMemo(
    () => Boolean((session?.user as any)?.accessToken || (typeof window !== 'undefined' && localStorage.getItem('token'))),
    [session]
  );

  useEffect(() => {
    if (status === 'loading' || !isAuthenticated) {
      setShowPrePrompt(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      if (typeof window === 'undefined') return;
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

      const s = await getSession();
      const hasAuth = Boolean((s?.user as any)?.accessToken || localStorage.getItem('token'));
      if (!hasAuth || cancelled) return;

      const permission = Notification.permission;

      // Best practice: permission accordee => on maintient l'abonnement automatiquement.
      if (permission === 'granted') {
        setShowPrePrompt(false);
        await ensurePushSubscription({ requestPermission: false });
        return;
      }

      if (permission === 'denied') {
        setShowPrePrompt(false);
        return;
      }

      // Permission "default": montrer une pre-demande in-app selon cooldown.
      if (permission === 'default') {
        let lastShown = 0;
        try {
          lastShown = Number(localStorage.getItem(PUSH_PREPROMPT_LAST_SHOWN_KEY) || 0);
        } catch {
          lastShown = 0;
        }
        const shouldShow = Date.now() - lastShown >= PREPROMPT_COOLDOWN_MS;
        if (!cancelled) setShowPrePrompt(shouldShow);
      }
    };

    run().catch((error: any) => {
      const code = error?.response?.status;
      const name = String(error?.name || '');
      if (code === 503 || name === 'AbortError') return;
      console.error('Initialisation Web Push impossible:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [status, isAuthenticated, session]);

  const dismissPrePrompt = () => {
    try {
      localStorage.setItem(PUSH_PREPROMPT_LAST_SHOWN_KEY, String(Date.now()));
    } catch {
      /* navigation privee */
    }
    setShowPrePrompt(false);
  };

  const handleEnablePush = async () => {
    setIsEnabling(true);
    try {
      const result = await ensurePushSubscription({ requestPermission: true });
      if (result.ok) {
        dismissPrePrompt();
        return;
      }
      // Si l'utilisateur ferme/refuse la demande, on attend le prochain cooldown.
      dismissPrePrompt();
    } catch (error: any) {
      const name = String(error?.name || '');
      if (error?.response?.status !== 503 && name !== 'AbortError') {
        console.error('Activation Web Push impossible:', error);
      }
      dismissPrePrompt();
    } finally {
      setIsEnabling(false);
    }
  };

  if (!showPrePrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:w-[420px] rounded-xl border border-border bg-background shadow-lg p-4">
      <p className="text-sm font-semibold text-foreground">Activer les notifications ?</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Recevez instantanement les nouveaux messages et mises a jour importantes.
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={dismissPrePrompt}
          className="px-3 py-2 text-sm rounded-md border border-border text-foreground hover:bg-muted transition-colors"
          disabled={isEnabling}
        >
          Plus tard
        </button>
        <button
          type="button"
          onClick={handleEnablePush}
          className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
          disabled={isEnabling}
        >
          {isEnabling ? 'Activation...' : 'Activer'}
        </button>
      </div>
    </div>
  );
}
