'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { AdminSidebar } from './AdminSidebar';
import { PartenaireSidebar } from './PartenaireSidebar';
import { NotificationBanner } from '@/components/NotificationBanner';
import { TaskNotificationBanner } from '@/components/TaskNotificationBanner';
import { DossierTransmissionBanner } from '@/components/DossierTransmissionBanner';
import { Toast } from '@/components/Toast';

interface DashboardLayoutProps {
  children: React.ReactNode;
  variant?: 'admin' | 'client' | 'partenaire';
}

export function DashboardLayout({ children, variant = 'client' }: DashboardLayoutProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const lexiaFullscreen = pathname === '/lexia' || pathname === '/admin/lexia';
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Déterminer si l'utilisateur est admin ou partenaire
  const userRole = (session?.user as any)?.role || 'client';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  const isPartenaire = userRole === 'partenaire';
  
  // Les admins ont maintenant un menu latéral fixe
  const showClientSidebar = variant === 'client' && !isAdmin;
  const showAdminSidebar = variant === 'admin' && isAdmin;
  const showPartenaireSidebar = variant === 'partenaire' && isPartenaire;

  // Fermer la sidebar sur desktop (large screens) pour client, admin, partenaire
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex min-h-0 h-[100dvh] max-h-[100dvh] overflow-hidden bg-background">
      {/* Sidebar client - uniquement pour les clients */}
      {showClientSidebar && (
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar admin - drawer sur mobile, fixe sur desktop */}
      {showAdminSidebar && (
        <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar partenaire - drawer sur mobile, fixe sur desktop */}
      {showPartenaireSidebar && (
        <PartenaireSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}

      {/* Contenu principal */}
      <div
        className={`flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden transition-all duration-300 ${(showClientSidebar || showAdminSidebar || showPartenaireSidebar) ? 'ml-0 lg:ml-64' : ''}`}
      >
        {/* Header simplifié (sans navigation) */}
        <Header 
          variant={variant} 
          showNav={false}
          onMenuClick={(showClientSidebar || showAdminSidebar || showPartenaireSidebar) ? () => setSidebarOpen(!sidebarOpen) : undefined}
        />

        {/* Barre de notification défilante */}
        {session && (
          <>
            <NotificationBanner 
              userRole={isAdmin ? 'admin' : isPartenaire ? 'partenaire' : 'client'} 
              userId={(session.user as any)?.id}
            />
            <TaskNotificationBanner 
              userRole={isAdmin ? 'admin' : isPartenaire ? 'partenaire' : 'client'} 
              userId={(session.user as any)?._id || (session.user as any)?.id}
            />
            <DossierTransmissionBanner 
              userRole={isAdmin ? 'admin' : isPartenaire ? 'partenaire' : 'client'} 
              userId={(session.user as any)?._id || (session.user as any)?.id}
            />
          </>
        )}

        {/* Contenu — padding mobile et pas de débordement */}
        <main
          className={`flex flex-1 flex-col min-h-0 overflow-x-hidden w-full max-w-[100vw] px-3 sm:px-4 lg:px-6 safe-bottom ${
            lexiaFullscreen ? 'overflow-y-hidden pb-0 pt-0' : 'overflow-y-auto pb-6'
          }`}
        >
          {children}
        </main>
      </div>

    </div>
  );
}


