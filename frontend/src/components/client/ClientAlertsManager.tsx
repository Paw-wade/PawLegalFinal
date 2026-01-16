'use client';

import { useEffect, useState } from 'react';
import { appointmentsAPI, documentRequestsAPI, dossiersAPI } from '@/lib/api';

interface Alert {
  id: string;
  type: 'appointment' | 'document_deadline' | 'dossier_deadline' | 'titre_expiration';
  title: string;
  message: string;
  level: 'urgent' | 'warning' | 'info';
  date: Date;
  actionUrl?: string;
}

export function ClientAlertsManager({ userId }: { userId: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    loadAlerts();
    // Vérifier les alertes toutes les heures
    const interval = setInterval(loadAlerts, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId]);

  const loadAlerts = async () => {
    const newAlerts: Alert[] = [];

    try {
      // Alertes pour les rendez-vous (24h et 1h avant)
      const appointmentsRes = await appointmentsAPI.getMyAppointments();
      if (appointmentsRes.data.success) {
        const appointments = appointmentsRes.data.data || appointmentsRes.data.appointments || [];
        const now = new Date();
        
        appointments
          .filter((apt: any) => apt.statut === 'confirme' || apt.statut === 'en_attente')
          .forEach((apt: any) => {
            const aptDate = new Date(apt.date);
            const aptTime = apt.heure ? apt.heure.split(':') : ['00', '00'];
            aptDate.setHours(parseInt(aptTime[0]), parseInt(aptTime[1]), 0, 0);
            const diffMs = aptDate.getTime() - now.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
            
            if (diffHours > 0 && diffHours <= 24) {
              if (diffHours <= 1) {
                newAlerts.push({
                  id: `apt-urgent-${apt._id}`,
                  type: 'appointment',
                  title: '⚠️ Rendez-vous dans moins d\'1 heure',
                  message: `Votre rendez-vous est prévu le ${aptDate.toLocaleDateString('fr-FR')} à ${apt.heure}`,
                  level: 'urgent',
                  date: aptDate,
                  actionUrl: `/client/rendez-vous`
                });
              } else if (diffHours <= 24) {
                newAlerts.push({
                  id: `apt-soon-${apt._id}`,
                  type: 'appointment',
                  title: '⏰ Rappel de rendez-vous',
                  message: `Votre rendez-vous est prévu demain le ${aptDate.toLocaleDateString('fr-FR')} à ${apt.heure}`,
                  level: 'warning',
                  date: aptDate,
                  actionUrl: `/client/rendez-vous`
                });
              }
            }
          });
      }

      // Alertes pour les échéances de documents
      const requestsRes = await documentRequestsAPI.getRequests({ status: 'pending' });
      if (requestsRes.data.success) {
        const requests = requestsRes.data.documentRequests || [];
        requests.forEach((req: any) => {
          if (req.isUrgent) {
            newAlerts.push({
              id: `doc-urgent-${req._id}`,
              type: 'document_deadline',
              title: '🔴 Document urgent requis',
              message: `Un document "${req.documentTypeLabel}" est requis de manière urgente pour votre dossier`,
              level: 'urgent',
              date: new Date(req.createdAt),
              actionUrl: `/client/dossiers/${req.dossier?._id || req.dossier}`
            });
          }
        });
      }

      // Alertes pour les échéances de dossiers
      const dossiersRes = await dossiersAPI.getMyDossiers();
      if (dossiersRes.data.success) {
        const dossiers = dossiersRes.data.dossiers || [];
        const now = new Date();
        
        dossiers.forEach((d: any) => {
          if (d.dateEcheance) {
            const echeanceDate = new Date(d.dateEcheance);
            const diffDays = Math.ceil((echeanceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            
            if (diffDays >= 0 && diffDays <= 7) {
              newAlerts.push({
                id: `dossier-deadline-${d._id}`,
                type: 'dossier_deadline',
                title: `⏰ Échéance du dossier dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`,
                message: `Le dossier "${d.titre}" a une échéance le ${echeanceDate.toLocaleDateString('fr-FR')}`,
                level: diffDays <= 3 ? 'urgent' : 'warning',
                date: echeanceDate,
                actionUrl: `/client/dossiers/${d._id}`
              });
            }
          }
        });
      }
    } catch (error) {
      console.error('Erreur lors du chargement des alertes:', error);
    }

    // Trier par priorité et date
    newAlerts.sort((a, b) => {
      const levelOrder = { urgent: 0, warning: 1, info: 2 };
      if (levelOrder[a.level] !== levelOrder[b.level]) {
        return levelOrder[a.level] - levelOrder[b.level];
      }
      return a.date.getTime() - b.date.getTime();
    });

    setAlerts(newAlerts);
  };

  if (alerts.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`p-4 rounded-lg border-l-4 ${
            alert.level === 'urgent' ? 'bg-red-50 border-red-500' :
            alert.level === 'warning' ? 'bg-orange-50 border-orange-500' :
            'bg-blue-50 border-blue-500'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-sm mb-1">{alert.title}</h3>
              <p className="text-xs text-gray-700">{alert.message}</p>
            </div>
            {alert.actionUrl && (
              <a
                href={alert.actionUrl}
                className="ml-4 text-xs font-medium text-primary hover:underline"
              >
                Voir →
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
