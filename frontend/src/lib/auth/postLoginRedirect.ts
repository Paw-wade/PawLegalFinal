import { getStaffLandingPath, isCabinetStaffRole } from '@/lib/staffAccess';
import { persistTenantSlug, resolveTenantSlugForRequest } from '@/lib/tenantSlug';

export type SessionUserLike = {
  accessToken?: string;
  role?: string;
  profilComplete?: boolean;
  needsPasswordSetup?: boolean;
  tenantSlug?: string;
  authError?: string | null;
  redirectToSignup?: boolean;
  googleSignupPending?: boolean;
};

/** Redirige après connexion réussie (credentials ou Google). */
export function redirectAfterLogin(user: SessionUserLike): string {
  if (user.accessToken && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem('token', user.accessToken);
    } catch {
      /* ignore */
    }
  }
  const hostSlug = resolveTenantSlugForRequest();
  persistTenantSlug(hostSlug || user.tenantSlug);

  if (user.needsPasswordSetup) return '/auth/setup-password';
  if (user.role === 'partenaire') return '/partenaire';
  if (isCabinetStaffRole(user.role)) return getStaffLandingPath(user.role);
  if (user.profilComplete === false) return '/auth/complete-profile';
  return '/client';
}
