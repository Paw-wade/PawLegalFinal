'use client';

import { useEffect } from 'react';
import { getSession } from 'next-auth/react';
import { ensurePushSubscription } from '@/lib/pushClient';

const PUSH_PERMISSION_REQUESTED_KEY = 'push_permission_requested_v1';

export function PushNotificationsBootstrap() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (typeof window === 'undefined') return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (Notification.permission === 'denied') return;

      const session = await getSession();
      const isAuthenticated = Boolean((session?.user as any)?.accessToken || localStorage.getItem('token'));
      if (!isAuthenticated) return;
      if (cancelled) return;

      const alreadyRequested = localStorage.getItem(PUSH_PERMISSION_REQUESTED_KEY) === '1';
      const shouldRequestPermission = Notification.permission === 'default' && !alreadyRequested;

      // Activation par défaut: on tente automatiquement l'abonnement.
      // Si la permission n'a jamais été demandée sur cet appareil, on la demande une fois.
      await ensurePushSubscription({ requestPermission: shouldRequestPermission });

      if (shouldRequestPermission) {
        localStorage.setItem(PUSH_PERMISSION_REQUESTED_KEY, '1');
      }
    };

    run().catch((error: any) => {
      const status = error?.response?.status;
      if (status === 503) return;
      console.error('Initialisation Web Push impossible:', error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

