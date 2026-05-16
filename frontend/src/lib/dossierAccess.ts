import { canAccessDossiersAsStaff } from './staffAccess';

export const DOSSIER_STAFF_ROLES = [
  'admin',
  'superadmin',
  'assistant',
  'comptable',
  'secretaire',
  'juriste',
  'stagiaire',
  'visiteur',
] as const;

export type DossierStaffRole = (typeof DOSSIER_STAFF_ROLES)[number];

export function isDossierStaffRole(role?: string | null): boolean {
  return canAccessDossiersAsStaff(role);
}

export function normalizeDossierId(value: unknown): string {
  return String(value ?? '').trim();
}

export function dossierListCardId(scope: 'admin' | 'partenaire' | 'client', dossierId: string): string {
  return `${scope}-dossier-card-${normalizeDossierId(dossierId)}`;
}
