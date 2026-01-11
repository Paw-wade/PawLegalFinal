'use client';

import { useEffect, useState } from 'react';
import { notificationsAPI } from '@/lib/api';
import { Bell } from 'lucide-react';
import Link from 'next/link';

export default function PartenaireNotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
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
    loadNotifications();
  }, []);
  
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
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Notifications</h1>
      
      {notifications.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Bell className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Aucune notification pour le moment</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notifications.map((notif: any) => {
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
                className={`block bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow ${
                  !isRead ? 'border-l-4 border-primary' : ''
                }`}
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
      )}
    </div>
  );
}


