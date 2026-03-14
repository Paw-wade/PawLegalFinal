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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
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
    <div className="min-h-screen bg-background flex">
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
      <div className={`flex-1 flex flex-col ${(showAdminSidebar || showPartenaireSidebar) ? 'ml-0 lg:ml-64' : ''} transition-all duration-300 min-w-0`}>
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

        {/* Contenu */}
        <main className="flex-1 overflow-x-hidden w-full">
          {children}
        </main>
      </div>

    </div>
  );
}


