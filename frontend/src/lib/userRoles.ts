export const STAFF_ROLES = [
  'admin',
  'superadmin',
  'assistant',
  'comptable',
  'secretaire',
  'juriste',
  'stagiaire',
  'visiteur',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export type InterfaceGroup = 'client' | 'partenaire' | 'staff';

export function isStaffRole(role?: string | null): boolean {
  if (!role) return false;
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function isFullAdminRole(role?: string | null): boolean {
  return role === 'admin' || role === 'superadmin';
}

export function isPartenaireRole(role?: string | null): boolean {
  return role === 'partenaire';
}

export function isClientInterfaceRole(role?: string | null): boolean {
  const r = String(role || 'client').trim();
  return !isStaffRole(r) && !isPartenaireRole(r);
}

export function getInterfaceGroup(role?: string | null): InterfaceGroup {
  if (isPartenaireRole(role)) return 'partenaire';
  if (isStaffRole(role)) return 'staff';
  return 'client';
}

export function getHomePathForRole(role?: string | null): string {
  const group = getInterfaceGroup(role);
  if (group === 'staff') return '/admin';
  if (group === 'partenaire') return '/partenaire';
  return '/client';
}

/** @deprecated Utiliser isStaffRole */
export function isDossierStaffRole(role?: string | null): boolean {
  return isStaffRole(role);
}

export const DOSSIER_STAFF_ROLES = STAFF_ROLES;
export type DossierStaffRole = StaffRole;
