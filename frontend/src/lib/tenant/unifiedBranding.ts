/**
 * Branding public Ada Papers unifié (orange + landing CMS).
 * Les champs `organizations.branding` / `landingPage` restent en base pour plus tard.
 *
 * Activer le branding par cabinet : NEXT_PUBLIC_USE_TENANT_PUBLIC_BRANDING=true
 */
export const ADAPAPERS_PRIMARY_HEX = '#f97316';
/** Aligné sur globals.css — orange Tailwind orange-500 */
export const ADAPAPERS_PRIMARY_HSL = '24 95% 53%';

export function useUnifiedPublicBranding(): boolean {
  return process.env.NEXT_PUBLIC_USE_TENANT_PUBLIC_BRANDING !== 'true';
}

/** Textes hero tenant ignorés tant que le branding public unifié est actif. */
export function shouldApplyTenantLandingCopy(): boolean {
  return !useUnifiedPublicBranding();
}
