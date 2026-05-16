/**
 * Rôles du cabinet utilisant l'espace /admin (hors client / partenaire).
 * Les droits par domaine reprennent les presets backend (permissions.js).
 */

export const CABINET_STAFF_ROLES = [
  'admin',
  'superadmin',
  'assistant',
  'comptable',
  'secretaire',
  'juriste',
  'stagiaire',
  'visiteur',
] as const;

export type CabinetStaffRole = (typeof CABINET_STAFF_ROLES)[number];

export type AdminPermissionDomain =
  | 'tableau_de_bord'
  | 'utilisateurs'
  | 'dossiers'
  | 'taches'
  | 'rendez_vous'
  | 'creneaux'
  | 'messages'
  | 'documents'
  | 'temoignages'
  | 'notifications'
  | 'sms'
  | 'cms'
  | 'logs'
  | 'corbeille';

type DomainAccess = { view: boolean; modify: boolean };

const FULL: DomainAccess = { view: true, modify: true };
const VIEW: DomainAccess = { view: true, modify: false };
const DENY: DomainAccess = { view: false, modify: false };

/** Presets alignés sur GET /api/permissions/roles/presets + rôles métier. */
const ROLE_DOMAIN_ACCESS: Record<CabinetStaffRole, Partial<Record<AdminPermissionDomain, DomainAccess>>> = {
  admin: {
    tableau_de_bord: FULL,
    utilisateurs: FULL,
    dossiers: FULL,
    taches: FULL,
    rendez_vous: FULL,
    creneaux: FULL,
    messages: FULL,
    documents: FULL,
    temoignages: FULL,
    notifications: FULL,
    sms: FULL,
    cms: FULL,
    logs: VIEW,
    corbeille: FULL,
  },
  superadmin: {
    tableau_de_bord: FULL,
    utilisateurs: FULL,
    dossiers: FULL,
    taches: FULL,
    rendez_vous: FULL,
    creneaux: FULL,
    messages: FULL,
    documents: FULL,
    temoignages: FULL,
    notifications: FULL,
    sms: FULL,
    cms: FULL,
    logs: VIEW,
    corbeille: FULL,
  },
  assistant: {
    dossiers: FULL,
    documents: FULL,
    taches: FULL,
    rendez_vous: FULL,
  },
  juriste: {
    tableau_de_bord: VIEW,
    dossiers: FULL,
    documents: FULL,
    taches: FULL,
    rendez_vous: FULL,
    messages: FULL,
    notifications: VIEW,
  },
  comptable: {
    tableau_de_bord: VIEW,
    dossiers: VIEW,
    documents: VIEW,
  },
  secretaire: {
    tableau_de_bord: VIEW,
    dossiers: FULL,
    taches: FULL,
    rendez_vous: FULL,
    creneaux: FULL,
    messages: FULL,
    documents: VIEW,
    notifications: FULL,
    sms: FULL,
  },
  stagiaire: {
    tableau_de_bord: VIEW,
    dossiers: VIEW,
    documents: VIEW,
    taches: VIEW,
  },
  visiteur: {
    tableau_de_bord: VIEW,
    dossiers: VIEW,
    utilisateurs: DENY,
    taches: DENY,
    rendez_vous: DENY,
    creneaux: DENY,
    messages: DENY,
    documents: DENY,
    temoignages: DENY,
    notifications: DENY,
    sms: DENY,
    cms: DENY,
    logs: DENY,
    corbeille: DENY,
  },
};

const MENU_PATH_ORDER: { href: string; domain: AdminPermissionDomain | 'compte' | 'forum' | 'always' }[] = [
  { href: '/admin', domain: 'tableau_de_bord' },
  { href: '/admin/utilisateurs', domain: 'utilisateurs' },
  { href: '/admin/dossiers', domain: 'dossiers' },
  { href: '/admin/dossiers/tarification', domain: 'dossiers' },
  { href: '/admin/taches', domain: 'taches' },
  { href: '/admin/rendez-vous', domain: 'rendez_vous' },
  { href: '/admin/creneaux', domain: 'creneaux' },
  { href: '/admin/messages', domain: 'messages' },
  { href: '/admin/documents', domain: 'documents' },
  { href: '/admin/documents/preparation', domain: 'documents' },
  { href: '/admin/temoignages', domain: 'temoignages' },
  { href: '/admin/notifications', domain: 'notifications' },
  { href: '/admin/sms', domain: 'sms' },
  { href: '/admin/emails', domain: 'messages' },
  { href: '/admin/carousel', domain: 'cms' },
  { href: '/admin/cms', domain: 'cms' },
  { href: '/admin/recours', domain: 'dossiers' },
  { href: '/admin/lexia', domain: 'always' },
  { href: '/admin/corbeille', domain: 'corbeille' },
  { href: '/forum', domain: 'messages' },
  { href: '/admin/compte', domain: 'compte' },
];

export function isCabinetStaffRole(role?: string | null): role is CabinetStaffRole {
  if (!role) return false;
  return (CABINET_STAFF_ROLES as readonly string[]).includes(role);
}

export function isFullAdminRole(role?: string | null): boolean {
  return role === 'admin' || role === 'superadmin';
}

export function getDomainAccess(role: string | undefined | null, domain: AdminPermissionDomain): DomainAccess {
  if (isFullAdminRole(role)) return FULL;
  if (!role || !isCabinetStaffRole(role)) return DENY;
  return ROLE_DOMAIN_ACCESS[role][domain] ?? DENY;
}

export function canViewAdminDomain(role: string | undefined | null, domain: AdminPermissionDomain): boolean {
  return getDomainAccess(role, domain).view;
}

export function canModifyAdminDomain(role: string | undefined | null, domain: AdminPermissionDomain): boolean {
  return getDomainAccess(role, domain).modify;
}

/** Accès lecture aux dossiers (liste + fiche). */
export function canAccessDossiersAsStaff(role?: string | null): boolean {
  return canViewAdminDomain(role ?? '', 'dossiers');
}

export function resolveAdminPathDomain(pathname: string): AdminPermissionDomain | 'compte' | 'forum' | 'always' | null {
  const path = pathname.split('?')[0];
  if (path === '/admin/compte' || path.startsWith('/admin/compte/')) return 'compte';
  if (path === '/forum' || path.startsWith('/forum/')) return 'forum';
  if (path === '/admin/lexia' || path.startsWith('/admin/lexia/')) return 'always';
  if (path === '/admin/recours' || path.startsWith('/admin/recours/')) return 'dossiers';

  const sorted = [...MENU_PATH_ORDER].sort((a, b) => b.href.length - a.href.length);
  for (const entry of sorted) {
    if (entry.href === '/admin') {
      if (path === '/admin') return entry.domain as AdminPermissionDomain;
      continue;
    }
    if (path === entry.href || path.startsWith(`${entry.href}/`)) {
      return entry.domain;
    }
  }
  if (path.startsWith('/admin')) return null;
  return null;
}

export function canAccessAdminPath(role: string | undefined | null, pathname: string): boolean {
  if (!role) return false;
  if (isAdminOnlyPath(pathname)) return isFullAdminRole(role);
  if (isFullAdminRole(role)) return true;

  const domain = resolveAdminPathDomain(pathname);
  if (domain === 'compte') return isCabinetStaffRole(role);
  if (domain === 'always') return isFullAdminRole(role);
  if (domain === 'forum') return canViewAdminDomain(role, 'messages');
  if (!domain) return false;
  if (domain === null) return false;

  return canViewAdminDomain(role, domain);
}

export function getStaffLandingPath(role: string | undefined | null): string {
  if (!isCabinetStaffRole(role)) return '/client';
  if (canViewAdminDomain(role, 'tableau_de_bord')) return '/admin';
  for (const item of MENU_PATH_ORDER) {
    if (item.domain === 'compte' || item.domain === 'always') continue;
    if (item.domain === 'forum') {
      if (canAccessAdminPath(role, '/forum')) return '/forum';
      continue;
    }
    if (canViewAdminDomain(role, item.domain as AdminPermissionDomain)) return item.href;
  }
  return '/admin/compte';
}

/** Chemins réservés admin / superadmin uniquement (sidebar). */
export function isAdminOnlyPath(pathname: string): boolean {
  const path = pathname.split('?')[0];
  return (
    path === '/admin/lexia' ||
    path.startsWith('/admin/lexia/') ||
    path === '/admin/recours' ||
    path.startsWith('/admin/recours/')
  );
}

export { MENU_PATH_ORDER };
