/** Liste blanche côté client (miroir de PLATFORM_ADMIN_EMAILS). Vide = tout superadmin. */
export function getPlatformAdminEmails(): string[] {
  const raw =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS) || '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function canAccessPlatformConsole(
  role?: string | null,
  email?: string | null
): boolean {
  if (role !== 'superadmin') return false;
  const whitelist = getPlatformAdminEmails();
  if (whitelist.length === 0) return true;
  return whitelist.includes(String(email || '').toLowerCase());
}

export function isPlatformConsolePath(pathname: string): boolean {
  const path = pathname.split('?')[0];
  return path === '/admin/platform' || path.startsWith('/admin/platform/');
}
