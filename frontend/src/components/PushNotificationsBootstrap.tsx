'use client';

import { useEffect } from 'react';
import { pushAPI } from '@/lib/api';
import { getSession } from 'next-auth/react';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationsBootstrap() {
  useEffect(() => {
    let cancelled = false;
    let hasLoggedConfigWarning = false;

    const run = async () => {
      if (typeof window === 'undefined') return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (Notification.permission === 'denied') return;

      const session = await getSession();
      const isAuthenticated = Boolean((session?.user as any)?.accessToken || localStorage.getItem('token'));
      if (!isAuthenticated) return;

      let publicKey = '';
      try {
        const keyRes = await pushAPI.getPublicKey();
        publicKey = keyRes?.data?.publicKey || '';
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 503) {
          // Serveur non configuré: situation attendue en local avant ajout des clés VAPID.
          if (!hasLoggedConfigWarning) {
            console.info('Web Push non configuré côté serveur (VAPID manquant).');
            hasLoggedConfigWarning = true;
          }
          return;
        }
        throw error;
      }
      if (!publicKey) return;

      const registration = await navigator.serviceWorker.register('/sw.js');
      if (cancelled) return;

      const permission = Notification.permission;
      const finalPermission: NotificationPermission =
        permission === 'default' ? await Notification.requestPermission() : permission;
      if (finalPermission !== 'granted') return;

      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        try {
          await pushAPI.subscribe(existingSubscription.toJSON());
        } catch (error) {
          console.error('Erreur resync abonnement push:', error);
        }
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      if (cancelled) return;
      await pushAPI.subscribe(subscription.toJSON());
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

