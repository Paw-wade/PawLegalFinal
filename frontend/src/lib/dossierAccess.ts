export const DOSSIER_STAFF_ROLES = [
  'admin',
  'superadmin',
  'assistant',
  'comptable',
  'secretaire',
  'juriste',
  'stagiaire',
] as const;

export type DossierStaffRole = (typeof DOSSIER_STAFF_ROLES)[number];

export function isDossierStaffRole(role?: string | null): boolean {
  if (!role) return false;
  return (DOSSIER_STAFF_ROLES as readonly string[]).includes(role);
}

export function normalizeDossierId(value: unknown): string {
  return String(value ?? '').trim();
}

export function dossierListCardId(scope: 'admin' | 'partenaire', dossierId: string): string {
  return `${scope}-dossier-card-${normalizeDossierId(dossierId)}`;
}
