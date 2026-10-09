import type { Session } from 'next-auth';
import { canAccessPlatformConsole } from '@/lib/platformAdmin';

export const PLATFORM_CONSOLE_PATH = '/platform';
export const PLATFORM_SIGNIN_PATH = '/platform/signin';

export type PlatformSessionUser = {
  role?: string;
  email?: string;
  accessToken?: string;
};

export function getPlatformSessionUser(session: Session | null): PlatformSessionUser | undefined {
  return session?.user as PlatformSessionUser | undefined;
}

export function hasPlatformConsoleAccess(session: Session | null): boolean {
  const user = getPlatformSessionUser(session);
  return canAccessPlatformConsole(user?.role, user?.email);
}

export function persistPlatformApiToken(accessToken?: string): void {
  if (typeof window === 'undefined' || !accessToken) return;
  try {
    window.localStorage.setItem('token', accessToken);
  } catch {
    /* ignore */
  }
}
