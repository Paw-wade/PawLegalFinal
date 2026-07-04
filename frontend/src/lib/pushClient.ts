import { getSession } from 'next-auth/react';
import { getPublicApiBaseUrl } from './publicApiUrl';

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

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  let token: string | null = null;
  if (typeof window !== 'undefined') {
    token = localStorage.getItem('token');
  }
  if (!token) {
    const session = await getSession();
    token = (session?.user as { accessToken?: string } | undefined)?.accessToken || null;
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function pushRequest<T>(path: string, init?: RequestInit): Promise<{ data: T; status: number }> {
  const base = getPublicApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(await getAuthHeaders()),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const err = new Error(res.statusText || 'Push API error') as Error & {
      response?: { status: number };
    };
    err.response = { status: res.status };
    throw err;
  }
  const data = (await res.json()) as T;
  return { data, status: res.status };
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
    const keyRes = await pushRequest<{ publicKey?: string }>('/push/public-key');
    publicKey = keyRes?.data?.publicKey || '';
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 503) {
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
    await pushRequest('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: existingSubscription.toJSON() }),
    });
    return { ok: true as const, reason: 'already_subscribed' as const };
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await pushRequest('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  return { ok: true as const, reason: 'subscribed' as const };
}
