'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { AdminSidebar } from './AdminSidebar';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { NotificationBanner } from '@/components/NotificationBanner';
import { Toast } from '@/components/Toast';
import { userAPI } from '@/lib/api';

interface DashboardLayoutProps {
  children: React.ReactNode;
  variant?: 'admin' | 'client';
}

export function DashboardLayout({ children, variant = 'client' }: DashboardLayoutProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Déterminer si l'utilisateur est admin
  const userRole = (session?.user as any)?.role || 'client';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  
  // Vérifier si on est en mode impersonation
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState<any>(null);
  const [showExitToast, setShowExitToast] = useState(false);
  const previousImpersonationState = useRef<boolean>(false);

  // Charger les informations de l'utilisateur impersonné
  useEffect(() => {
    const checkImpersonation = async () => {
      if (typeof window !== 'undefined') {
        const impersonateUserId = localStorage.getItem('impersonateUserId');
        const isActive = !!impersonateUserId;
        
        // Détecter si on vient de quitter le mode impersonation
        if (previousImpersonationState.current && !isActive) {
          // On vient de quitter le mode impersonation
          setShowExitToast(true);
          console.log('👋 Mode impersonation quitté');
        }
        
        previousImpersonationState.current = isActive;
        setIsImpersonating(isActive);

        if (isActive && impersonateUserId) {
          // Si on a déjà l'utilisateur, ne pas recharger
          if (!impersonatedUser || impersonatedUser._id !== impersonateUserId) {
            try {
              const response = await userAPI.getUserById(impersonateUserId);
              if (response.data.success && response.data.user) {
                setImpersonatedUser(response.data.user);
              }
            } catch (error) {
              console.error('Erreur lors du chargement de l\'utilisateur impersonné:', error);
            }
          }
        } else if (!isActive) {
          setImpersonatedUser(null);
        }
      }
    };

    // Initialiser l'état précédent au montage
    if (typeof window !== 'undefined') {
      const wasImpersonating = !!localStorage.getItem('impersonateUserId');
      previousImpersonationState.current = wasImpersonating;
    }

    checkImpersonation();

    // Écouter les changements de localStorage
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'impersonateUserId') {
        checkImpersonation();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Vérifier périodiquement (pour détecter les changements dans le même onglet)
    const interval = setInterval(checkImpersonation, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [impersonatedUser]);

  // Détecter quand on arrive sur la page admin après avoir quitté l'impersonation
  useEffect(() => {
    if (typeof window !== 'undefined' && variant === 'admin') {
      // Vérifier si on vient de quitter l'impersonation en regardant sessionStorage
      const justExitedImpersonation = sessionStorage.getItem('justExitedImpersonation');
      if (justExitedImpersonation === 'true') {
        setShowExitToast(true);
        sessionStorage.removeItem('justExitedImpersonation');
      }
    }
  }, [pathname, variant]);

  // Fonction pour quitter l'impersonation
  const stopImpersonating = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('impersonateUserId');
      localStorage.removeItem('impersonateAdminId');
      // Marquer dans sessionStorage qu'on vient de quitter l'impersonation
      sessionStorage.setItem('justExitedImpersonation', 'true');
    }
    setIsImpersonating(false);
    setImpersonatedUser(null);
    // Afficher le toast avant de rediriger
    setShowExitToast(true);
    // Rediriger après un court délai pour que le toast soit visible
    setTimeout(() => {
      router.push('/admin');
    }, 500);
  };

  // Obtenir le nom et l'email de l'utilisateur impersonné
  const getUserName = () => {
    if (isImpersonating && impersonatedUser) {
      const name = `${impersonatedUser?.firstName || ''} ${impersonatedUser?.lastName || ''}`.trim();
      return name || impersonatedUser?.email || 'Utilisateur';
    }
    return '';
  };

  const getUserEmail = () => {
    if (isImpersonating && impersonatedUser) {
      return impersonatedUser?.email || '';
    }
    return '';
  };

  // Les admins ont maintenant un menu latéral fixe
  // Le sidebar client n'apparaît que pour les clients OU pour les admins en impersonation
  const showClientSidebar = variant === 'client' && (!isAdmin || isImpersonating);
  const showAdminSidebar = variant === 'admin' && isAdmin && !isImpersonating;

  // Fermer la sidebar client sur desktop (large screens)
  useEffect(() => {
    if (!showClientSidebar) return;
    
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [showClientSidebar]);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar client - uniquement pour les clients ou les admins en impersonation */}
      {showClientSidebar && (
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar admin - fixe pour tous les admins */}
      {showAdminSidebar && (
        <AdminSidebar isOpen={true} onClose={() => setSidebarOpen(false)} />
      )}

      {/* Contenu principal */}
      <div className={`flex-1 flex flex-col ${showAdminSidebar ? 'ml-0 lg:ml-64' : ''} transition-all duration-300 min-w-0`}>
        {/* Header simplifié (sans navigation) */}
        <Header 
          variant={variant} 
          showNav={false}
          onMenuClick={showClientSidebar ? () => setSidebarOpen(!sidebarOpen) : undefined}
        />

        {/* Barre de notification défilante */}
        {session && (
          <NotificationBanner 
            userRole={isAdmin ? 'admin' : 'client'} 
            userId={(session.user as any)?.id}
          />
        )}

        {/* Banner d'impersonation - toujours visible en mode impersonation */}
        {isImpersonating && variant === 'client' && (
          <div className="w-full px-4 pt-4">
            <ImpersonationBanner
              userName={getUserName() || 'Chargement...'}
              userEmail={getUserEmail() || ''}
              onStopImpersonating={stopImpersonating}
            />
          </div>
        )}

        {/* Contenu */}
        <main className="flex-1 overflow-x-hidden w-full">
          {children}
        </main>
      </div>

      {/* Toast de notification pour la sortie du mode impersonation */}
      {showExitToast && (
        <Toast
          message="Vous avez quitté le mode impersonation"
          type="info"
          duration={3000}
          onClose={() => setShowExitToast(false)}
        />
      )}
    </div>
  );
}


