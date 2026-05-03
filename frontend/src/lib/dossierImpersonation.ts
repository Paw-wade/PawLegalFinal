/**
 * Impersonation « aperçu client » réservée aux admins : headers Axios (voir api.ts)
 * + localStorage pour X-Impersonate-*.
 */

const STORAGE_USER = 'impersonateUserId';
const STORAGE_ADMIN = 'impersonateAdminId';

export function getLinkedClientUserId(dossier: { user?: string | { _id?: string; id?: string } } | null): string | null {
  if (!dossier?.user) return null;
  const u = dossier.user as { _id?: string; id?: string };
  if (typeof dossier.user === 'string') return dossier.user;
  const id = u?._id || u?.id;
  return id != null ? String(id) : null;
}

export function startDossierClientImpersonation(clientUserId: string, adminUserId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_USER, String(clientUserId).trim());
  localStorage.setItem(STORAGE_ADMIN, String(adminUserId).trim());
}

export function stopDossierClientImpersonation(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_USER);
  localStorage.removeItem(STORAGE_ADMIN);
}

export function isDossierClientImpersonating(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem(STORAGE_USER) && localStorage.getItem(STORAGE_ADMIN));
}

export function adminIdFromSession(session: { user?: { id?: string; _id?: string } } | null): string {
  const u = session?.user as { id?: string; _id?: string } | undefined;
  return String(u?.id || u?._id || '').trim();
}
