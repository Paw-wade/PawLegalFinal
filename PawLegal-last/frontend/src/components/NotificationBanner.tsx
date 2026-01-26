'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { appointmentsAPI, notificationsAPI } from '@/lib/api';
import { useNotificationBannerVisibility } from '@/hooks/useNotificationBannerVisibility';

interface NotificationBannerProps {
  userRole: 'admin' | 'client';
  userId?: string;
}

interface BannerItem {
  id: string;
  type: 'appointment' | 'document' | 'dossier' | 'custom';
  message: string;
  link?: string;
  icon: string;
  priority: 'high' | 'normal';
}

export function NotificationBanner({ userRole, userId }: NotificationBannerProps) {
  const [bannerItems, setBannerItems] = useState<BannerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { isVisible, toggleVisibility } = useNotificationBannerVisibility();

  useEffect(() => {
    loadBannerItems();
    // Recharger toutes les 30 secondes
    const interval = setInterval(loadBannerItems, 30000);
    return () => clearInterval(interval);
  }, [userRole, userId]);

  const loadBannerItems = async () => {
    setIsLoading(true);
    try {
      const items: BannerItem[] = [];

      // Pour les admins : nouveaux rendez-vous
      if (userRole === 'admin') {
        try {
          const appointmentsResponse = await appointmentsAPI.getAllAppointments();
          if (appointmentsResponse.data.success) {
            const appointments = appointmentsResponse.data.data || appointmentsResponse.data.appointments || [];
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Rendez-vous d'aujourd'hui
            const todayApps = appointments.filter((apt: any) => {
              if (!apt.date) return false;
              const aptDate = new Date(apt.date);
              aptDate.setHours(0, 0, 0, 0);
              return aptDate.getTime() === today.getTime() && apt.statut !== 'annule' && apt.statut !== 'annulé';
            });

            // Rendez-vous de demain
            const tomorrowApps = appointments.filter((apt: any) => {
              if (!apt.date) return false;
              const aptDate = new Date(apt.date);
              aptDate.setHours(0, 0, 0, 0);
              return aptDate.getTime() === tomorrow.getTime() && apt.statut !== 'annule' && apt.statut !== 'annulé';
            });

            // Ajouter les rendez-vous d'aujourd'hui
            todayApps.slice(0, 3).forEach((apt: any) => {
              const clientName = `${apt.prenom || ''} ${apt.nom || ''}`.trim() || 'Client';
              items.push({
                id: `appointment-today-${apt._id || apt.id}`,
                type: 'appointment',
                message: `Rendez-vous aujourd'hui avec ${clientName} à ${apt.heure?.substring(0, 5) || 'N/A'}`,
                link: `/admin/rendez-vous?date=${apt.date}`,
                icon: '📅',
                priority: 'high'
              });
            });

            // Ajouter les rendez-vous de demain
            tomorrowApps.slice(0, 2).forEach((apt: any) => {
              const clientName = `${apt.prenom || ''} ${apt.nom || ''}`.trim() || 'Client';
              items.push({
                id: `appointment-tomorrow-${apt._id || apt.id}`,
                type: 'appointment',
                message: `Rendez-vous demain avec ${clientName} à ${apt.heure?.substring(0, 5) || 'N/A'}`,
                link: `/admin/rendez-vous?date=${apt.date}`,
                icon: '📆',
                priority: 'normal'
              });
            });
          }
        } catch (error) {
          console.error('Erreur lors du chargement des rendez-vous:', error);
        }
      }

      // Pour les clients : notifications importantes de dossiers
      if (userRole === 'client' && userId) {
        try {
          const notificationsResponse = await notificationsAPI.getNotifications({
            lu: false,
            limit: 10
          });
          if (notificationsResponse.data.success) {
            const notifications = notificationsResponse.data.notifications || [];
            
            // Filtrer les notifications importantes (documents manquants, échéances, etc.)
            const importantNotifications = notifications.filter((notif: any) => {
              const type = notif.type || '';
              return type.includes('document') || type.includes('echeance') || type.includes('urgent');
            });

            importantNotifications.slice(0, 3).forEach((notif: any) => {
              let message = notif.message || notif.titre || 'Nouvelle notification';
              let link = '/client/notifications';
              let icon = '🔔';

              if (notif.type?.includes('document')) {
                icon = '📄';
                if (notif.dossierId) {
                  link = `/client/dossiers/${notif.dossierId}`;
                }
              } else if (notif.type?.includes('echeance')) {
                icon = '⏰';
                if (notif.dossierId) {
                  link = `/client/dossiers/${notif.dossierId}`;
                }
              }

              items.push({
                id: `notification-${notif._id || notif.id}`,
                type: 'dossier',
                message,
                link,
                icon,
                priority: notif.type?.includes('urgent') ? 'high' : 'normal'
              });
            });
          }
        } catch (error) {
          console.error('Erreur lors du chargement des notifications:', error);
        }
      }

      setBannerItems(items);
    } catch (error) {
      console.error('Erreur lors du chargement des éléments de la bannière:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Ne rien afficher si on charge ou s'il n'y a pas d'éléments
  if (isLoading || bannerItems.length === 0) {
    return null;
  }

  // Si la bannière est fermée, afficher une petite barre pour la rouvrir
  if (!isVisible) {
    return (
      <div className="w-full bg-gradient-to-r from-primary/5 via-primary/3 to-primary/5 border-b border-primary/10 shadow-sm">
        <div className="flex items-center justify-center py-2">
          <button
            onClick={() => toggleVisibility(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            aria-label="Afficher la bannière de notifications"
          >
            <span>🔔</span>
            <span>Notifications</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border-b border-primary/20 shadow-sm relative">
      <button
        onClick={() => toggleVisibility(false)}
        className="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-white/80 hover:bg-white text-muted-foreground hover:text-foreground transition-all shadow-sm"
        aria-label="Fermer la bannière de notifications"
        title="Fermer"
      >
        <span className="text-sm">×</span>
      </button>
      <div className="overflow-hidden pr-10">
        <div className="flex animate-scroll-banner whitespace-nowrap">
          {bannerItems.map((item) => (
            <Link
              key={item.id}
              href={item.link || '#'}
              className={`inline-flex items-center gap-2 px-6 py-3 mx-2 rounded-lg transition-all hover:bg-primary/20 ${
                item.priority === 'high' ? 'bg-red-50 border border-red-200' : 'bg-white/50'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className={`text-sm font-medium ${
                item.priority === 'high' ? 'text-red-900' : 'text-foreground'
              }`}>
                {item.message}
              </span>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
          ))}
          {/* Dupliquer pour animation continue */}
          {bannerItems.map((item) => (
            <Link
              key={`${item.id}-dup`}
              href={item.link || '#'}
              className={`inline-flex items-center gap-2 px-6 py-3 mx-2 rounded-lg transition-all hover:bg-primary/20 ${
                item.priority === 'high' ? 'bg-red-50 border border-red-200' : 'bg-white/50'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className={`text-sm font-medium ${
                item.priority === 'high' ? 'text-red-900' : 'text-foreground'
              }`}>
                {item.message}
              </span>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
          ))}
        </div>
      </div>
      <style jsx>{`
        @keyframes scroll-banner {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll-banner {
          animation: scroll-banner 30s linear infinite;
        }
        .animate-scroll-banner:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}

