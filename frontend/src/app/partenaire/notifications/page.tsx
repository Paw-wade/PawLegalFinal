'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { notificationsAPI } from '@/lib/api';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

export default function PartenaireNotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedDossierId, setSelectedDossierId] = useState<string>('');
  
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
  
  useEffect(() => {
    const dossierIdParam = searchParams.get('dossierId');
    if (dossierIdParam) {
      setSelectedDossierId(dossierIdParam);
    }
    loadNotifications();
  }, [searchParams]);
  
  const loadNotifications = async () => {
    try {
      setLoading(true);
      const response = await notificationsAPI.getNotifications();
      if (response.data.success) {
        setNotifications(response.data.notifications || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    try {
      const confirmed = window.confirm('Supprimer toutes vos notifications ?');
      if (!confirmed) return;
      setLoading(true);
      await notificationsAPI.deleteAllNotifications();
      setNotifications([]);
    } catch (error) {
      console.error('Erreur lors de la suppression des notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = async (e: MouseEvent, notifId: string, notifLien: string, isRead: boolean) => {
    if (isRead) return;
    if (!notifId || notifId === '#') return;

    // On attend la requête "mark as read" puis on navigue.
    e.preventDefault();
    try {
      await notificationsAPI.markAsRead(notifId);
      await loadNotifications();
    } catch (error) {
      console.error('Erreur lors du marquage notification comme lue:', error);
    }

    if (notifLien && notifLien !== '#') {
      router.push(notifLien);
    }
  };

  const getNotificationColor = (type: string) => {
    const colors: { [key: string]: string } = {
      dossier_created: 'border-blue-300/70',
      dossier_updated: 'border-yellow-300/70',
      dossier_deleted: 'border-red-300/70',
      dossier_status_changed: 'border-green-300/70',
      dossier_assigned: 'border-purple-300/70',
      dossier_cancelled: 'border-orange-300/70',
      document_uploaded: 'border-indigo-300/70',
      document_request: 'border-orange-300/70',
      document_received: 'border-green-300/70',
      appointment_created: 'border-teal-300/70',
      appointment_updated: 'border-teal-300/70',
      appointment_cancelled: 'border-red-300/70',
      message_received: 'border-pink-300/70',
      other: 'border-gray-300/70',
    };
    return colors[type] || 'border-gray-300/70';
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteAll();
          }}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors w-full sm:w-auto"
        >
          Supprimer tout
        </button>
      </div>
      
      {(() => {
        const filtered = selectedDossierId
          ? notifications.filter((notif: any) => {
              const notifDossierId = notif.data?.dossierId || notif.dossierId;
              return notifDossierId && (
                notifDossierId.toString() === selectedDossierId.toString() ||
                (typeof notifDossierId === 'object' && notifDossierId._id?.toString() === selectedDossierId.toString())
              );
            })
          : notifications;

        if (filtered.length === 0) {
          return (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Bell className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">
                {selectedDossierId ? 'Aucune notification pour ce dossier' : 'Aucune notification pour le moment'}
              </p>
            </div>
          );
        }

        return (
          <div className="space-y-4">
          {filtered.map((notif: any) => {
            // Extraire toutes les valeurs de manière sécurisée
            const notifId = safeString(notif._id) || safeString(notif.id) || `notif-${Math.random()}`;
            const notifLien = safeString(notif.lien) || '#';
            const notifTitre = safeString(notif.titre) || 'Notification';
            
            // Pour le message, vérifier s'il n'est pas un objet
            let notifMessage = '';
            if (notif.message) {
              if (typeof notif.message === 'string') {
                notifMessage = notif.message;
              } else if (typeof notif.message === 'object') {
                // Si c'est un objet, essayer d'extraire des propriétés utiles
                console.warn('Notification message est un objet:', notif.message);
                notifMessage = safeString(notif.message.titre) || safeString(notif.message.numero) || safeString(notif.message.message) || '';
              } else {
                notifMessage = safeString(notif.message);
              }
            }
            
            const isRead = notif.lu === true || notif.lu === false ? notif.lu : false;
            
            return (
              <Link
                key={notifId}
                href={notifLien}
                className={`block bg-white rounded-xl border p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-18px_rgba(59,130,246,0.35)] ${getNotificationColor(notif.type)} ${
                  !isRead ? 'ring-1 ring-primary/30' : 'opacity-90'
                }`}
                onClick={(e) => handleNotificationClick(e, notifId, notifLien, isRead)}
              >
                <h3 className="font-semibold mb-1">{notifTitre}</h3>
                {notifMessage && (
                  <p className="text-gray-600">{notifMessage}</p>
                )}
                {notif.createdAt && (
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(notif.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
        );
      })()}
    </div>
  );
}


