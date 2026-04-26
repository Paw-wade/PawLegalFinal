import { pushAPI } from '@/lib/api';

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

export async function ensurePushSubscription(options?: { requestPermission?: boolean }) {
  if (typeof window === 'undefined') {
    return { ok: false as const, reason: 'unsupported' as const };
  }
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false as const, reason: 'unsupported' as const };
  }

  let publicKey = '';
  try {
    const keyRes = await pushAPI.getPublicKey();
    publicKey = keyRes?.data?.publicKey || '';
  } catch (error: any) {
    if (error?.response?.status === 503) {
      return { ok: false as const, reason: 'server_not_configured' as const };
    }
    throw error;
  }
  if (!publicKey) return { ok: false as const, reason: 'server_not_configured' as const };

  const registration = await navigator.serviceWorker.register('/sw.js');

  let permission = Notification.permission;
  if (permission === 'default' && options?.requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return {
      ok: false as const,
      reason: permission === 'denied' ? ('denied' as const) : ('permission_required' as const),
    };
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    await pushAPI.subscribe(existingSubscription.toJSON());
    return { ok: true as const, reason: 'already_subscribed' as const };
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await pushAPI.subscribe(subscription.toJSON());
  return { ok: true as const, reason: 'subscribed' as const };
}

