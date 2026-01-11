// Mapping entre les routes de la sidebar admin et les domaines de permissions
export const ROUTE_PERMISSION_MAP: Record<string, string> = {
  '/admin': 'tableau_de_bord',
  '/admin/utilisateurs': 'utilisateurs',
  '/admin/dossiers': 'dossiers',
  '/admin/taches': 'taches',
  '/admin/rendez-vous': 'rendez_vous',
  '/admin/creneaux': 'creneaux',
  '/admin/messages': 'messages', // Toujours accessible
  '/admin/documents': 'documents',
  '/admin/temoignages': 'temoignages',
  '/admin/notifications': 'notifications',
  '/admin/sms': 'sms',
  '/admin/cms': 'cms',
  '/admin/logs': 'logs',
  '/admin/corbeille': 'corbeille',
  '/admin/compte': 'tableau_de_bord', // Toujours accessible
};

// Routes toujours accessibles (pas de permission requise)
export const ALWAYS_ACCESSIBLE_ROUTES = [
  '/admin/messages',
  '/admin/compte',
];

// Vérifier si une route est accessible selon les permissions
export function hasRoutePermission(
  route: string,
  permissions: Array<{ domaine: string; consulter: boolean; nePasConsulter: boolean }>,
  userRole: string
): boolean {
  // Les admins et superadmins ont toujours accès
  if (userRole === 'admin' || userRole === 'superadmin') {
    return true;
  }

  // Les routes toujours accessibles
  if (ALWAYS_ACCESSIBLE_ROUTES.some(r => route.startsWith(r))) {
    return true;
  }

  // Trouver le domaine correspondant à la route
  const domaine = ROUTE_PERMISSION_MAP[route];
  if (!domaine) {
    // Si pas de mapping, refuser par défaut pour consulat/avocat
    return userRole !== 'consulat' && userRole !== 'avocat';
  }

  // Chercher la permission correspondante
  const permission = permissions.find(p => p.domaine === domaine);
  if (!permission) {
    // Si pas de permission définie, refuser pour consulat/avocat
    return userRole !== 'consulat' && userRole !== 'avocat';
  }

  // Vérifier si l'accès est explicitement refusé
  if (permission.nePasConsulter) {
    return false;
  }

  // Vérifier si l'accès est autorisé
  return permission.consulter;
}

// Obtenir le message d'erreur pour une route non accessible
export function getAccessDeniedMessage(route: string): string {
  const routeLabels: Record<string, string> = {
    '/admin': 'Tableau de bord',
    '/admin/utilisateurs': 'Utilisateurs',
    '/admin/dossiers': 'Dossiers',
    '/admin/taches': 'Tâches',
    '/admin/rendez-vous': 'Rendez-vous',
    '/admin/creneaux': 'Créneaux',
    '/admin/documents': 'Documents',
    '/admin/temoignages': 'Témoignages',
    '/admin/notifications': 'Notifications',
    '/admin/sms': 'SMS',
    '/admin/cms': 'CMS',
    '/admin/logs': 'Logs',
    '/admin/corbeille': 'Corbeille',
  };

  const label = routeLabels[route] || 'cette page';
  return `Vous n'avez pas accès à ${label}. Veuillez contacter un administrateur pour obtenir les permissions nécessaires.`;
}

