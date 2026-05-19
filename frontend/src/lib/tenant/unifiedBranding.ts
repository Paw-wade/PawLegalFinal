/**
 * Branding public Ada Papers unifié (orange + landing CMS).
 * Les champs `organizations.branding` / `landingPage` restent en base pour les autres cabinets.
 *
 * Activer le branding par cabinet : NEXT_PUBLIC_USE_TENANT_PUBLIC_BRANDING=true
 * Sauf cabinets legacy listés ci-dessous (ex. Wadepaw = orange + textes CMS d'origine).
 */
export const ADAPAPERS_PRIMARY_HEX = '#f97316';
/** Aligné sur globals.css — orange Tailwind orange-500 */
export const ADAPAPERS_PRIMARY_HSL = '24 95% 53%';

/** Cabinets qui gardent toujours l'expérience Ada Papers historique (orange, CMS). */
export const ADA_PAPERS_LEGACY_UNIFIED_SLUGS = new Set(['cabinet-wadepaw']);

export const ADA_PAPERS_PUBLIC_BRAND_NAME = 'Ada Papers';

export function usesAdaPapersUnifiedBranding(slug?: string | null): boolean {
  const s = String(slug || '')
    .trim()
    .toLowerCase();
  if (s && ADA_PAPERS_LEGACY_UNIFIED_SLUGS.has(s)) {
    return true;
  }
  return process.env.NEXT_PUBLIC_USE_TENANT_PUBLIC_BRANDING !== 'true';
}

/** @deprecated Préférer usesAdaPapersUnifiedBranding(slug) */
export function useUnifiedPublicBranding(slug?: string | null): boolean {
  return usesAdaPapersUnifiedBranding(slug);
}

/** Textes hero tenant ignorés tant que le branding public unifié est actif. */
export function shouldApplyTenantLandingCopy(slug?: string | null): boolean {
  return !usesAdaPapersUnifiedBranding(slug);
}
