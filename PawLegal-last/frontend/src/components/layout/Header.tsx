'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { userAPI } from '@/lib/api';
import { NotificationBadge } from '@/components/NotificationBadge';
import { useCmsText } from '@/lib/contentClient';

// Composant Button simplifié
function Button({ 
  children, 
  variant = 'default', 
  className = '', 
  ...props 
}: {
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  className?: string;
  [key: string]: any;
}) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
  };
  
  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// Fonction pour obtenir le libellé du rôle
function getRoleLabel(role: string | undefined): string {
  const roleLabels: { [key: string]: string } = {
    'client': 'Client',
    'admin': 'Administrateur',
    'superadmin': 'Super Administrateur',
    'avocat': 'Avocat',
    'assistant': 'Assistant',
    'comptable': 'Comptable',
    'secretaire': 'Secrétaire',
    'juriste': 'Juriste',
    'stagiaire': 'Stagiaire',
    'visiteur': 'Visiteur',
  };
  return roleLabels[role || 'client'] || 'Client';
}

interface HeaderProps {
  variant?: 'home' | 'client' | 'admin';
  showNav?: boolean;
  navItems?: Array<{ href: string; label: string; active?: boolean; highlight?: boolean }>;
  onMenuClick?: () => void; // Pour le bouton hamburger
}

export function Header({ variant = 'home', showNav = true, navItems, onMenuClick }: HeaderProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [userInfo, setUserInfo] = useState<{
    name: string;
    role: string;
    email: string;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Textes CMS pour le sous-titre du header
  const subtitleHome = useCmsText(
    'layout.header.subtitle_home',
    "Service d'accompagnement juridique"
  );
  const subtitleAdmin = useCmsText(
    'layout.header.subtitle_admin',
    "Panneau d'Administration"
  );
  const subtitleClient = useCmsText(
    'layout.header.subtitle_client',
    'Espace Client'
  );

  // Éviter les problèmes d'hydratation
  useEffect(() => {
    setMounted(true);
  }, []);

  // Récupérer les informations utilisateur depuis la session ou l'API
  useEffect(() => {
    const fetchUserInfo = async () => {
      // Si on a une session, utiliser les données de la session
      if (session?.user) {
        setUserInfo({
          name: session.user.name || '',
          role: (session.user as any)?.role || 'client',
          email: session.user.email || '',
        });
        
        // Si l'email n'est pas dans la session, essayer de le récupérer depuis l'API
        if (!session.user.email && typeof window !== 'undefined') {
          const token = localStorage.getItem('token') || sessionStorage.getItem('token');
          if (token) {
            try {
              const response = await userAPI.getProfile();
              if (response.data.success) {
                const user = response.data.user || response.data.data;
                setUserInfo(prev => ({
                  name: prev?.name || '',
                  role: prev?.role || 'client',
                  email: user.email || prev?.email || '',
                }));
              }
            } catch (error: any) {
              // Gérer les erreurs de connexion de manière gracieuse
              if (error.isConnectionError) {
                console.warn('⚠️ Impossible de récupérer l\'email: le serveur backend n\'est pas disponible.');
              } else {
                console.error('Erreur lors de la récupération de l\'email:', error);
              }
            }
          }
        }
        return;
      }

      // Si pas de session mais on a un token, récupérer depuis l'API
      // Vérifier aussi si status est 'loading' pour éviter d'afficher "déconnecté" pendant le chargement
      if ((status === 'unauthenticated' || status === 'loading') && typeof window !== 'undefined') {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (token) {
          try {
            const response = await userAPI.getProfile();
            if (response.data.success) {
              const user = response.data.user || response.data.data;
              setUserInfo({
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Utilisateur',
                role: user.role || 'client',
                email: user.email || '',
              });
            }
          } catch (error: any) {
            // Gérer les erreurs de connexion de manière gracieuse
            if (error.isConnectionError) {
              console.warn('⚠️ Le serveur backend n\'est pas disponible. Les fonctionnalités peuvent être limitées.');
              // Ne pas supprimer le token si c'est juste une erreur de connexion
              // L'utilisateur peut toujours utiliser l'application en mode hors ligne
            } else {
              console.error('Erreur lors de la récupération du profil:', error);
              // Si le token est invalide (401, 403), le supprimer
              if (error.response?.status === 401 || error.response?.status === 403) {
                localStorage.removeItem('token');
                sessionStorage.removeItem('token');
                setUserInfo(null);
              }
            }
          }
        } else if (status === 'unauthenticated') {
          // Seulement mettre userInfo à null si on est vraiment non authentifié ET qu'on n'a pas de token
          setUserInfo(null);
        }
      } else if (status === 'unauthenticated' && !session) {
        setUserInfo(null);
      }
    };

    fetchUserInfo();
  }, [session, status]);

  // Utiliser les informations de la session ou de l'API
  const userName = session?.user?.name || userInfo?.name || '';
  const userRole = (session?.user as any)?.role || userInfo?.role || 'client';
  // Prioriser l'email de la session, puis celui de userInfo, puis celui de la session NextAuth par défaut
  const userEmail = session?.user?.email || userInfo?.email || (session?.user as any)?.email || '';
  const roleLabel = getRoleLabel(userRole);
  
  // Déterminer si l'utilisateur est connecté (session ou token)
  const isAuthenticated = !!session || !!userInfo;

  // Mapping des sections pour la navigation par ancres
  const sectionMapping: { [key: string]: { client: string; admin: string } } = {
    'Mes dossiers': { client: 'dossiers-section', admin: 'dossiers-section' },
    'Dossiers': { client: 'dossiers-section', admin: 'dossiers-section' },
    'Rendez-vous': { client: 'rendez-vous-section', admin: 'rendez-vous-section' },
    'Documents': { client: 'documents-section', admin: 'documents-section' },
    'Messages': { client: 'messages-section', admin: 'messages-section' },
    'Témoignage': { client: 'temoignages-section', admin: 'temoignages-section' },
    'Témoignages': { client: 'temoignages-section', admin: 'temoignages-section' },
    'Utilisateurs': { client: '', admin: 'utilisateurs-section' },
    'Notifications': { client: 'notifications-section', admin: 'notifications-section' },
    'Tableau de bord': { client: '', admin: 'dashboard-top' },
  };

  // Fonction pour obtenir le lien approprié selon la page actuelle
  const getNavLink = (item: any) => {
    const isOnDashboard = pathname === '/client' || pathname === '/admin';
    const sectionId = sectionMapping[item.label]?.[variant] || '';
    
    if (isOnDashboard && sectionId) {
      // Si on est sur le dashboard, utiliser une ancre
      return `#${sectionId}`;
    }
    // Sinon, utiliser le lien normal
    return item.href;
  };

  // Fonction pour gérer le clic sur les liens de navigation
  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, item: any) => {
    const isOnDashboard = pathname === '/client' || pathname === '/admin';
    const sectionId = sectionMapping[item.label]?.[variant] || '';
    
    if (isOnDashboard && sectionId) {
      e.preventDefault();
      // Si c'est "Tableau de bord", scroller vers le haut
      if (item.label === 'Tableau de bord' && sectionId === 'dashboard-top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // Navigation par défaut selon le variant
  const defaultNavItems = {
    home: [
      { href: '#', label: 'Dashboard', isDashboard: true },
    ],
    client: [
      { href: '/client/dossiers', label: 'Mes dossiers', requiresAuth: true },
      { href: '/client/rendez-vous', label: 'Rendez-vous', requiresAuth: true },
      { href: '/client/documents', label: 'Documents', requiresAuth: true },
      { href: '/client/messages', label: 'Messages', requiresAuth: true },
      { href: '/client/taches', label: 'Mes tâches', requiresAuth: true },
      { href: '/client/notifications', label: 'Notifications', requiresAuth: true },
      { href: '/client/temoignages', label: 'Témoignage', requiresAuth: true },
      { href: '/calculateur', label: 'Calculateur', highlight: true },
    ],
    admin: [
      { href: '/admin', label: 'Tableau de bord', requiresAuth: true, requiresRole: ['admin', 'superadmin'] },
      { href: '/admin/utilisateurs', label: 'Utilisateurs', requiresAuth: true, requiresRole: ['admin', 'superadmin'] },
      { href: '/admin/dossiers', label: 'Dossiers', requiresAuth: true, requiresRole: ['admin', 'superadmin'] },
      { href: '/admin/rendez-vous', label: 'Rendez-vous', requiresAuth: true, requiresRole: ['admin', 'superadmin'] },
      { href: '/admin/messages', label: 'Messages', requiresAuth: true, requiresRole: ['admin', 'superadmin'] },
      { href: '/admin/creneaux', label: 'Créneaux', requiresAuth: true, requiresRole: ['admin', 'superadmin'] },
      { href: '/admin/documents', label: 'Documents', requiresAuth: true, requiresRole: ['admin', 'superadmin'] },
      { href: '/admin/temoignages', label: 'Témoignages', requiresAuth: true, requiresRole: ['admin', 'superadmin'] },
      { href: '/admin/logs', label: 'Logs', requiresAuth: true, requiresRole: ['superadmin'] },
      { href: '/calculateur', label: 'Calculateur', highlight: true },
    ],
  };

  // Filtrer les items de navigation selon l'authentification et le rôle
  let currentNavItems = navItems || defaultNavItems[variant] || [];
  
  // Si on a des navItems personnalisés, ne pas filtrer
  if (!navItems) {
    currentNavItems = currentNavItems.filter((item: any) => {
      // Si l'item nécessite une authentification
      if (item.requiresAuth && !isAuthenticated) {
        return false;
      }
      
      // Si l'item nécessite un rôle spécifique
      if (item.requiresRole && isAuthenticated) {
        const userRole = (session?.user as any)?.role || userInfo?.role || 'client';
        if (!item.requiresRole.includes(userRole)) {
          return false;
        }
      }
      
      return true;
    });
  }

  const handleSignOut = async () => {
    if (typeof window === 'undefined') return;
    
    // Nettoyer complètement l'état de l'utilisateur
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    setUserInfo(null);
    
    // Si on a une session NextAuth, la déconnecter
    if (session) {
      try {
        // Déconnecter de NextAuth en arrière-plan
        await signOut({ redirect: false });
      } catch (error) {
        console.warn('Erreur lors de la déconnexion NextAuth:', error);
      }
    }
    
    // Rediriger immédiatement vers la page d'accueil
    // Utiliser window.location.href pour une redirection complète qui évite les requêtes API
    window.location.href = '/';
  };

  const handleDashboardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const isAuthenticated = status === 'authenticated' && (session || userInfo);
    
    if (isAuthenticated) {
      // Rediriger vers le dashboard approprié selon le rôle
      const userRole = (session?.user as any)?.role || userInfo?.role || 'client';
      if (userRole === 'admin' || userRole === 'superadmin') {
        router.push('/admin');
      } else {
        router.push('/client');
      }
    } else {
      // Ouvrir le modal de connexion/inscription
      setShowAuthModal(true);
    }
  };

  return (
    <header className="border-b border-gray-200/80 bg-white/98 backdrop-blur-md sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4 py-2.5">
        <div className="flex items-center justify-between">
          {/* Logo et bouton menu (pour dashboard) */}
          <div className="flex items-center gap-3">
            {/* Bouton hamburger pour mobile/tablette sur dashboard - uniquement pour les clients */}
            {!showNav && onMenuClick && variant === 'client' && (
              <button
                onClick={onMenuClick}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-md transition-colors"
                aria-label="Ouvrir le menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            {/* Logo - visible UNIQUEMENT sur la page d'accueil (variant === 'home') */}
            {/* Sur les pages client et admin, le logo est déjà dans la sidebar, donc on ne l'affiche PAS ici */}
            {variant === 'home' && (
              <>
                <Link
                  href="/"
                  className="font-bold text-orange-500 hover:text-orange-600 transition-colors text-xl"
                >
                  Paw Legal
                </Link>
                <div className="h-4 w-px bg-gray-300"></div>
                <p className="text-[9px] text-gray-600 font-normal leading-tight whitespace-nowrap">
                  {subtitleHome}
                </p>
              </>
            )}
            {/* Sur les pages client, afficher uniquement le sous-titre (le logo est dans la sidebar) */}
            {variant === 'client' && (
              <p className="text-[9px] text-gray-600 font-normal leading-tight whitespace-nowrap">
                {subtitleClient}
              </p>
            )}
            {/* Sur les pages admin, afficher uniquement le sous-titre */}
            {variant === 'admin' && (
              <p className="text-[9px] text-gray-600 font-normal leading-tight whitespace-nowrap">
                {subtitleAdmin}
              </p>
            )}
          </div>

          {/* Navigation - Liens permanents (Domaines, Services, FAQ, Contact, Calculateur, Dashboard) */}
          <nav className="hidden md:flex items-center gap-0.5">
            <Link
              href="/domaines"
              className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              Domaines
            </Link>
            <Link
              href="/services"
              className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              Services
            </Link>
            <Link
              href="/faq"
              className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              FAQ
            </Link>
            <Link
              href="/contact"
              className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              Contact
            </Link>
            <Link
              href="/calculateur"
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 bg-orange-500 text-white hover:bg-orange-600 shadow-sm font-semibold"
            >
              Calculateur
            </Link>
            {/* Afficher le bouton Logs si l'utilisateur est admin ou superadmin */}
            {isAuthenticated && (userRole === 'admin' || userRole === 'superadmin') && (
              <Link
                href="/admin/logs"
                className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                Logs
              </Link>
            )}
            {/* Afficher le bouton Dashboard si l'utilisateur est connecté et n'est pas déjà sur son dashboard */}
            {isAuthenticated && (
              (userRole === 'admin' || userRole === 'superadmin') && pathname !== '/admin' ? (
                <button
                  type="button"
                  onClick={handleDashboardClick}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  Dashboard
                </button>
              ) : (userRole === 'client' || !userRole || userRole === 'visiteur') && pathname !== '/client' ? (
                <button
                  type="button"
                  onClick={handleDashboardClick}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  Dashboard
                </button>
              ) : variant === 'home' ? (
                <button
                  type="button"
                  onClick={handleDashboardClick}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  Dashboard
                </button>
              ) : null
            )}
          </nav>

          {/* Navigation - Liens conditionnels (showNav) - pas pour la home pour éviter le décalage */}
          {showNav && variant !== 'home' && (
            <nav className="hidden md:flex items-center gap-0.5">
              {currentNavItems.map((item) => {
                // Si c'est le Dashboard, utiliser un bouton au lieu d'un Link
                if ((item as any).isDashboard) {
                  return (
                    <button
                      key="dashboard"
                      onClick={handleDashboardClick}
                      className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-gray-100 text-gray-700"
                    >
                      Dashboard
                    </button>
                  );
                }
                const navHref = getNavLink(item);
                return (
                  <Link
                    key={item.href}
                    href={navHref}
                    onClick={(e) => handleNavClick(e, item)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                      (item as any).active
                        ? 'bg-orange-500 text-white shadow-sm'
                        : item.highlight && item.href === '/client'
                        ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm font-semibold'
                        : item.highlight
                        ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm font-semibold'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              {/* Afficher le bouton Logs si l'utilisateur est admin ou superadmin */}
              {isAuthenticated && (userRole === 'admin' || userRole === 'superadmin') && (
                <Link
                  href="/admin/logs"
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Logs
                </Link>
              )}
              {/* Afficher le bouton Dashboard si l'utilisateur est connecté et n'est pas déjà sur son dashboard */}
              {isAuthenticated && (
                (userRole === 'admin' || userRole === 'superadmin') && pathname !== '/admin' ? (
                  <button
                    type="button"
                    onClick={handleDashboardClick}
                    className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Dashboard
                  </button>
                ) : (userRole === 'client' || !userRole || userRole === 'visiteur') && pathname !== '/client' ? (
                  <button
                    type="button"
                    onClick={handleDashboardClick}
                    className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Dashboard
                  </button>
                ) : null
              )}
            </nav>
          )}


          {/* Informations utilisateur et actions */}
          <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  {/* Badge de notification */}
                  <NotificationBadge 
                    variant="header" 
                    className="mr-2"
                  />
                  
                  {/* Affichage du nom et de la qualité - TOUJOURS VISIBLE */}
                  <div className="text-right border-r border-gray-200 pr-2.5 mr-2">
                    <Link 
                      href={variant === 'admin' ? '/admin/compte' : '/client/compte'}
                      className="text-xs font-semibold text-gray-900 hover:text-orange-500 transition-colors cursor-pointer block leading-tight"
                    >
                      {userName || 'Utilisateur'}
                    </Link>
                    <p className="text-[10px] text-gray-500 font-normal leading-tight">{roleLabel}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    className="text-xs px-2.5 py-1.5 h-auto text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                    onClick={handleSignOut}
                  >
                    Déconnexion
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/auth/signin">
                    <Button variant="ghost" className="text-xs px-2.5 py-1.5 h-auto text-gray-700 hover:text-gray-900">Connexion</Button>
                  </Link>
                  <Link href="/auth/signup">
                    <Button className="text-xs px-3 py-1.5 h-auto">Créer un compte</Button>
                  </Link>
                </>
              )}
            </div>
        </div>
      </div>

      {/* Modal de connexion/inscription */}
      {showAuthModal && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={() => setShowAuthModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden relative"
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="p-6 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-bold text-foreground">Connexion / Inscription</h2>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAuthModal(false);
                }}
                className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-full w-8 h-8 flex items-center justify-center transition-colors text-2xl leading-none font-light"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-muted-foreground text-center mb-6 text-sm">
                Connectez-vous pour accéder à votre tableau de bord ou créez un compte gratuitement.
              </p>
              <div className="flex flex-col gap-3">
                <Link href="/auth/signin" onClick={() => setShowAuthModal(false)}>
                  <Button className="w-full h-11 text-base font-semibold">
                    Se connecter
                  </Button>
                </Link>
                <Link href="/auth/signup" onClick={() => setShowAuthModal(false)}>
                  <Button variant="outline" className="w-full h-11 text-base font-semibold">
                    Créer un compte gratuit
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

