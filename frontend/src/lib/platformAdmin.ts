/** Liste blanche explicite (emails personnels / legacy hors @adapapers.fr). */
export function getPlatformAdminEmails(): string[] {
  const raw =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS) || '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Domaine Ada Papers autorisé pour les superadmins plateforme (défaut : adapapers.fr). */
export function getPlatformAdminEmailDomain(): string {
  const raw =
    (typeof process !== 'undefined' &&
      (process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAIL_DOMAIN ||
        process.env.PLATFORM_ADMIN_EMAIL_DOMAIN)) ||
    'adapapers.fr';
  return raw.trim().toLowerCase().replace(/^@/, '');
}

/**
 * Email d’un superadmin Ada Papers (équipe plateforme), pas d’un superadmin cabinet client.
 */
export function isAdaPapersSuperadminEmail(email?: string | null): boolean {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;

  if (getPlatformAdminEmails().includes(normalized)) {
    return true;
  }

  const domain = getPlatformAdminEmailDomain();
  if (domain && normalized.endsWith(`@${domain}`)) {
    return true;
  }

  return false;
}

/**
 * Console SaaS : uniquement superadmin + email Ada Papers (domaine ou liste blanche).
 * Les superadmins d’un cabinet client (ex. admin@cabinet-dupont.fr) sont exclus.
 */
export function canAccessPlatformConsole(
  role?: string | null,
  email?: string | null
): boolean {
  if (role !== 'superadmin') return false;
  return isAdaPapersSuperadminEmail(email);
}

export function getPlatformAccessDeniedMessage(): string {
  const domain = getPlatformAdminEmailDomain();
  const whitelist = getPlatformAdminEmails();
  const parts = [`Rôle superadmin Ada Papers requis`];
  if (domain) {
    parts.push(`email *@${domain}`);
  }
  if (whitelist.length > 0) {
    parts.push(`ou email autorisé : ${whitelist.join(', ')}`);
  }
  return parts.join(' — ');
}

export function isPlatformConsolePath(pathname: string): boolean {
  const path = pathname.split('?')[0];
  return (
    path === '/admin/platform' ||
    path.startsWith('/admin/platform/') ||
    path === '/platform' ||
    path.startsWith('/platform/')
  );
}
