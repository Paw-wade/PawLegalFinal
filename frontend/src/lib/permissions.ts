// Type d'une entrée de permission (aligné sur le modèle backend Permission)
export type PermissionEntry = {
  domaine: string;
  consulter: boolean;
  modifier?: boolean;
  nePasConsulter: boolean;
  nePasModifier?: boolean;
  supprimer?: boolean;
};

// Mapping entre les routes de la sidebar admin et les domaines de permissions.
// Chaque clé est un préfixe de route ; la correspondance se fait sur le préfixe le plus long.
export const ROUTE_PERMISSION_MAP: Record<string, string> = {
  '/admin/utilisateurs': 'utilisateurs',
  '/admin/dossiers/tarification': 'tarification',
  '/admin/dossiers': 'dossiers',
  '/admin/taches': 'taches',
  '/admin/rendez-vous': 'rendez_vous',
  '/admin/creneaux': 'creneaux',
  '/admin/documents/preparation': 'documents',
  '/admin/documents': 'documents',
  '/admin/temoignages': 'temoignages',
  '/admin/notifications': 'notifications',
  '/admin/sms': 'sms',
  '/admin/emails': 'sms',
  '/admin/carousel': 'cms',
  '/admin/cms': 'cms',
  '/admin/lexia': 'cms',
  '/admin/recours': 'documents',
  '/admin/corbeille': 'corbeille',
};

// Routes toujours accessibles (pas de permission requise)
export const ALWAYS_ACCESSIBLE_ROUTES = [
  '/admin/messages',
  '/admin/compte',
  '/admin', // Tableau de bord (la racine exacte est gérée dans resolveRouteDomain)
  '/forum',
];

// Rôles "professionnels" externes (accès sans permissions détaillées)
const PROFESSIONAL_ROLES = ['consulat', 'avocat', 'association'];

// Domaines pouvant s'ouvrir en mode "restreint" (scoped) : même sans permission
// de catégorie, un membre du staff ayant des dossiers assignés peut ouvrir la
// page qui n'affichera alors que les éléments qui lui sont assignés.
export const ASSIGNMENT_SCOPED_DOMAINS = ['dossiers', 'taches', 'documents'];

export type RouteAccess = 'full' | 'scoped' | 'denied';

/**
 * Résout le domaine de permission associé à un pathname.
 * Retourne `null` si la route est toujours accessible (pas de domaine requis).
 */
export function resolveRouteDomain(pathname: string): string | null {
  if (!pathname) return null;

  // Tableau de bord : la racine exacte /admin est toujours accessible
  if (pathname === '/admin' || pathname === '/admin/') return null;

  // Routes explicitement toujours accessibles
  if (
    ALWAYS_ACCESSIBLE_ROUTES.some(
      (r) => r !== '/admin' && (pathname === r || pathname.startsWith(`${r}/`))
    )
  ) {
    return null;
  }

  // Correspondance sur le préfixe le plus long
  let matchedDomain: string | null = null;
  let matchedLength = -1;
  for (const [route, domaine] of Object.entries(ROUTE_PERMISSION_MAP)) {
    if ((pathname === route || pathname.startsWith(`${route}/`)) && route.length > matchedLength) {
      matchedDomain = domaine;
      matchedLength = route.length;
    }
  }
  return matchedDomain;
}

// Vérifier si une route est accessible selon les permissions
export function hasRoutePermission(
  route: string,
  permissions: PermissionEntry[],
  userRole: string
): boolean {
  // Seul le superadmin a toujours accès à tout
  if (userRole === 'superadmin') {
    return true;
  }

  const domaine = resolveRouteDomain(route);

  // Pas de domaine requis => route toujours accessible
  if (!domaine) {
    return true;
  }

  // Chercher la permission correspondante
  const permission = permissions.find((p) => p.domaine === domaine);
  if (!permission) {
    // Pas de permission définie pour ce domaine : refuser pour le staff
    // (les professionnels externes conservent l'accès).
    return PROFESSIONAL_ROLES.includes(userRole);
  }

  // Accès explicitement refusé
  if (permission.nePasConsulter) {
    return false;
  }

  // Accès autorisé uniquement si "consulter" est vrai
  return permission.consulter;
}

/**
 * Détermine le niveau d'accès à une route :
 *  - 'full'   : accès complet (permission accordée ou superadmin)
 *  - 'scoped' : accès restreint aux éléments assignés (catégories dossiers/
 *               tâches/documents lorsque l'utilisateur a des dossiers assignés)
 *  - 'denied' : aucun accès
 */
export function getRouteAccess(
  route: string,
  permissions: PermissionEntry[],
  userRole: string,
  hasAssignments: boolean = false
): RouteAccess {
  if (userRole === 'superadmin') return 'full';

  const domaine = resolveRouteDomain(route);
  if (!domaine) return 'full';

  const permission = permissions.find((p) => p.domaine === domaine);
  const permitted = permission
    ? !permission.nePasConsulter && Boolean(permission.consulter)
    : PROFESSIONAL_ROLES.includes(userRole);

  if (permitted) return 'full';

  // Pas de permission : accès restreint possible si la catégorie le supporte
  // et que l'utilisateur a des dossiers assignés.
  if (hasAssignments && ASSIGNMENT_SCOPED_DOMAINS.includes(domaine)) {
    return 'scoped';
  }

  return 'denied';
}

// Obtenir le message d'erreur pour une route non accessible
export function getAccessDeniedMessage(route: string): string {
  const routeLabels: Record<string, string> = {
    utilisateurs: 'Utilisateurs',
    dossiers: 'Dossiers',
    tarification: 'Dossiers tarification',
    taches: 'Tâches',
    rendez_vous: 'Rendez-vous',
    creneaux: 'Créneaux',
    documents: 'Documents',
    temoignages: 'Témoignages',
    notifications: 'Notifications',
    sms: 'SMS',
    cms: 'CMS',
    corbeille: 'Corbeille',
  };

  const domaine = resolveRouteDomain(route);
  const label = (domaine && routeLabels[domaine]) || 'cette ressource';
  return `Vous n'avez pas accès à ${label}. Veuillez contacter l'administrateur pour plus d'informations.`;
}
