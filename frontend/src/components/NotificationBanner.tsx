'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { appointmentsAPI, notificationsAPI } from '@/lib/api';
import { useNotificationBannerVisibility } from '@/hooks/useNotificationBannerVisibility';

interface NotificationBannerProps {
  userRole: 'admin' | 'client' | 'partenaire';
  userId?: string;
}

// Fonction pour convertir en string de manière sécurisée
const safeString = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  // Si c'est un objet, ne pas le convertir, retourner une chaîne vide
  if (typeof value === 'object') {
    console.warn('Tentative de convertir un objet en string:', value);
    return '';
  }
  return '';
};

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
    // Chargement unique au montage / changement de rôle utilisateur
    loadBannerItems();
  }, [userRole, userId]);

  const loadBannerItems = async () => {
    setIsLoading(true);
    try {
      const items: BannerItem[] = [];

      // Pour les admins et partenaires : nouveaux rendez-vous
      if (userRole === 'admin' || userRole === 'partenaire') {
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
              const aptId = safeString(apt._id) || safeString(apt.id) || '';
              const clientName = `${safeString(apt.prenom)} ${safeString(apt.nom)}`.trim() || 'Client';
              const heure = safeString(apt.heure);
              const aptDate = apt.date ? safeString(apt.date) : '';
              const link = userRole === 'partenaire' 
                ? `/partenaire/rendez-vous?date=${aptDate}`
                : `/admin/rendez-vous?date=${aptDate}`;
              
              items.push({
                id: `appointment-today-${aptId || Math.random()}`,
                type: 'appointment',
                message: `Rendez-vous aujourd'hui avec ${clientName}${heure ? ` à ${heure.substring(0, 5)}` : ''}`,
                link,
                icon: '📅',
                priority: 'high'
              });
            });

            // Ajouter les rendez-vous de demain
            tomorrowApps.slice(0, 2).forEach((apt: any) => {
              const aptId = safeString(apt._id) || safeString(apt.id) || '';
              const clientName = `${safeString(apt.prenom)} ${safeString(apt.nom)}`.trim() || 'Client';
              const heure = safeString(apt.heure);
              const aptDate = apt.date ? safeString(apt.date) : '';
              const link = userRole === 'partenaire' 
                ? `/partenaire/rendez-vous?date=${aptDate}`
                : `/admin/rendez-vous?date=${aptDate}`;
              
              items.push({
                id: `appointment-tomorrow-${aptId || Math.random()}`,
                type: 'appointment',
                message: `Rendez-vous demain avec ${clientName}${heure ? ` à ${heure.substring(0, 5)}` : ''}`,
                link,
                icon: '📆',
                priority: 'normal'
              });
            });
          }
        } catch (error) {
          console.error('Erreur lors du chargement des rendez-vous:', error);
        }
      }

      // Pour les clients : notifications importantes de dossiers (documents, échéances, explications)
      if (userRole === 'client' && userId) {
        try {
          const notificationsResponse = await notificationsAPI.getNotifications({
            lu: false,
            limit: 10
          });
          if (notificationsResponse.data.success) {
            const notifications = notificationsResponse.data.notifications || [];
            
            // Filtrer les notifications importantes pour le client :
            // - demandes de documents
            // - transmissions de dossier
            // - clôture / archivage de dossier
            // - tarification (choix demandé, montant fixé, exonération)
            const importantNotifications = notifications.filter((notif: any) => {
              const rawType = notif.type || '';
              const type = rawType.toLowerCase();

              const isDocument =
                type === 'document_request' ||
                type.includes('document');

              const isTransmission =
                type.includes('transmis') ||
                type.includes('transmission');

              const isClosureOrArchive =
                type.includes('cloture') ||
                type.includes('clôture') ||
                type.includes('closed') ||
                type.includes('archive');

              const isTarification =
                type === 'tarification_choice_requested' ||
                type.includes('tarification');

              return isDocument || isTransmission || isClosureOrArchive || isTarification;
            });

            importantNotifications.slice(0, 3).forEach((notif: any) => {
              // Utiliser safeString pour éviter de rendre des objets
              let message = safeString(notif.message) || safeString(notif.titre) || 'Nouvelle notification';
              let link = '/client/notifications';
              let icon = '🔔';

              const notifType = notif.type || '';
              const lowerType = notifType.toLowerCase();
              const data = notif.data || notif.metadata || {};

              if (notifType === 'document_request') {
                // Cas spécifique: demande de document pour le client
                const dossierId = safeString(data.dossierId);
                const dossierNumero = safeString(data.dossierNumero);
                const label =
                  safeString(data.documentTypeLabel) ||
                  safeString(data.documentType) ||
                  'document';
                const isUrgent = !!data.isUrgent;

                message = `${isUrgent ? '[URGENT] ' : ''}Un document "${label}" est demandé pour votre dossier ${dossierNumero || ''}`.trim();
                icon = '📄';
                link = dossierId ? `/client/dossiers/${dossierId}` : '/client/documents';

                items.push({
                  id: `notification-${safeString(notif._id) || safeString(notif.id) || Math.random()}`,
                  type: 'dossier',
                  message,
                  link,
                  icon,
                  priority: isUrgent ? 'high' : 'normal'
                });
                return;
              }

              if (notifType === 'tarification_choice_requested' || lowerType.includes('tarification')) {
                message =
                  safeString(notif.message) ||
                  safeString(notif.titre) ||
                  'Information de tarification disponible pour votre dossier.';
                icon = '💶';
                link = '/client/tarification';
                items.push({
                  id: `notification-${safeString(notif._id) || safeString(notif.id) || Math.random()}`,
                  type: 'custom',
                  message,
                  link,
                  icon,
                  priority: 'high'
                });
                return;
              }

              if (lowerType.includes('document')) {
                icon = '📄';
                const dossierId = safeString(notif.dossierId) || safeString(notif.metadata?.dossierId);
                if (dossierId) {
                  link = `/client/dossiers/${dossierId}`;
                }
              } else if (
                lowerType.includes('transmis') ||
                lowerType.includes('transmission')
              ) {
                icon = '📤';
                const dossierId =
                  safeString(notif.dossierId) ||
                  safeString(notif.metadata?.dossierId) ||
                  safeString(data.dossierId);
                if (dossierId) {
                  link = `/client/dossiers/${dossierId}`;
                }
                if (!message) {
                  message = 'Votre dossier a été transmis.';
                }
              } else if (
                lowerType.includes('cloture') ||
                lowerType.includes('clôture') ||
                lowerType.includes('closed') ||
                lowerType.includes('archive')
              ) {
                icon = '📁';
                const dossierId =
                  safeString(notif.dossierId) ||
                  safeString(notif.metadata?.dossierId) ||
                  safeString(data.dossierId);
                if (dossierId) {
                  link = `/client/dossiers/${dossierId}`;
                }
                if (!message) {
                  message = 'Le statut de votre dossier a été mis à jour.';
                }
              }

              items.push({
                id: `notification-${safeString(notif._id) || safeString(notif.id) || Math.random()}`,
                type: 'dossier',
                message,
                link,
                icon,
                priority: notifType.includes('urgent') ? 'high' : 'normal'
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
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5">
        <div className="space-y-2">
          {bannerItems.map((item) => (
            <Link
              key={item.id}
              href={item.link || '#'}
              className={`flex items-start gap-2 px-3 py-2 rounded-lg transition-all hover:bg-primary/10 ${
                item.priority === 'high' ? 'bg-red-50 border border-red-200' : 'bg-white/70 border border-primary/10'
              }`}
            >
              <span className="text-lg mt-0.5">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium leading-snug ${
                    item.priority === 'high' ? 'text-red-900' : 'text-foreground'
                  }`}
                >
                  {item.message}
                </p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 mt-0.5">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

