'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { notificationsAPI } from '@/lib/api';

interface NotificationBadgeProps {
  className?: string;
  showCount?: boolean;
  variant?: 'header' | 'dashboard';
}

export function NotificationBadge({ className = '', showCount = true, variant = 'header' }: NotificationBadgeProps) {
  const { data: session } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUnreadCount = async () => {
      try {
        const response = await notificationsAPI.getUnreadCount();
        if (response.data.success) {
          setUnreadCount(response.data.count || 0);
        }
      } catch (error) {
        console.error('Erreur lors du chargement du nombre de notifications:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUnreadCount();
    
    // Rafraîchir toutes les 30 secondes
    const interval = setInterval(loadUnreadCount, 30000);
    
    return () => clearInterval(interval);
  }, []);

  if (variant === 'header') {
    // Déterminer le lien selon le rôle
    const userRole = (session?.user as any)?.role;
    const isAdmin = userRole === 'admin' || userRole === 'superadmin';
    const isPartenaire = userRole === 'partenaire';
    const notificationsLink = isAdmin ? '/admin/notifications' : isPartenaire ? '/partenaire/notifications' : '/client/notifications';
    
    return (
      <Link 
        href={notificationsLink} 
        className={`relative inline-flex items-center justify-center p-2 rounded-md hover:bg-gray-100 transition-colors ${className}`}
      >
        <div className="relative">
          <span className="text-xl">🔔</span>
          {showCount && !isLoading && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center min-w-[20px] shadow-md">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </Link>
    );
  }

  // Variant dashboard
  const userRole = (session?.user as any)?.role;
  const isProfessional = userRole === 'consulat' || userRole === 'avocat' || userRole === 'association' || userRole === 'collaborateur';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  const isPartenaire = userRole === 'partenaire';
  const notificationsLink = isPartenaire ? '/partenaire/notifications' : (isAdmin || isProfessional) ? '/admin/notifications' : '/client/notifications';
  
  return (
    <Link 
      href={notificationsLink}
      className={`flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-white to-primary/5 border border-primary/20 hover:shadow-lg transition-all duration-200 hover:scale-105 ${className}`}
    >
      <div className="relative">
        <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/70 rounded-xl flex items-center justify-center shadow-md">
          <span className="text-2xl">🔔</span>
        </div>
        {showCount && !isLoading && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center min-w-[24px] shadow-md">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
        <p className="text-xs text-muted-foreground">
          {isLoading ? 'Chargement...' : unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Aucune notification'}
        </p>
      </div>
    </Link>
  );
}

