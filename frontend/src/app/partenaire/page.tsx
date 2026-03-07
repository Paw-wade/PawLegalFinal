'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { dossiersAPI, notificationsAPI, messagesAPI } from '@/lib/api';
import Link from 'next/link';
import { FolderOpen, Bell, MessageSquare, Clock, CheckCircle, XCircle } from 'lucide-react';

export default function PartenaireDashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState({
    dossiersTransmis: 0,
    dossiersEnAttente: 0,
    dossiersAcceptes: 0,
    dossiersRefuses: 0,
    messagesNonLus: 0,
    notificationsNonLues: 0
  });
  const [dossiersRecents, setDossiersRecents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadStats();
  }, []);
  
  const loadStats = async () => {
    try {
      setLoading(true);
      const [dossiersRes, notifsRes, messagesRes] = await Promise.all([
        dossiersAPI.getMyDossiers(),
        notificationsAPI.getUnreadCount(),
        messagesAPI.getUnreadCount()
      ]);
      
      if (dossiersRes.data.success) {
        const dossiers = dossiersRes.data.dossiers || [];
        const userId = (session?.user as any)?._id || (session?.user as any)?.id;
        
        // S'assurer que tous les dossiers sont des objets valides
        const validDossiers = Array.isArray(dossiers) ? dossiers.filter((d: any) => d && typeof d === 'object') : [];
        
        const userIdStr = userId?.toString();
        const dossiersEnAttente = validDossiers.filter((d: any) => 
          d.transmittedTo?.some((t: any) => {
            const transPartenaireId = t.partenaire?._id?.toString() || t.partenaire?.toString();
            return transPartenaireId === userIdStr && t.status === 'pending';
          })
        );
        const dossiersAcceptes = validDossiers.filter((d: any) => 
          d.transmittedTo?.some((t: any) => {
            const transPartenaireId = t.partenaire?._id?.toString() || t.partenaire?.toString();
            return transPartenaireId === userIdStr && t.status === 'accepted';
          })
        );
        const dossiersRefuses = validDossiers.filter((d: any) => 
          d.transmittedTo?.some((t: any) => {
            const transPartenaireId = t.partenaire?._id?.toString() || t.partenaire?.toString();
            return transPartenaireId === userIdStr && t.status === 'refused';
          })
        );
        
        setStats(prev => ({
          ...prev,
          dossiersTransmis: validDossiers.length,
          dossiersEnAttente: dossiersEnAttente.length,
          dossiersAcceptes: dossiersAcceptes.length,
          dossiersRefuses: dossiersRefuses.length
        }));
        
        // Dossiers récents (5 derniers)
        setDossiersRecents(validDossiers.slice(0, 5));
      }
      
      if (notifsRes.data.success) {
        setStats(prev => ({
          ...prev,
          notificationsNonLues: notifsRes.data.count || 0
        }));
      }
      
      if (messagesRes.data.success) {
        setStats(prev => ({
          ...prev,
          messagesNonLus: messagesRes.data.count || 0
        }));
      }
    } catch (error) {
      console.error('Erreur lors du chargement des stats:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const getDossierStatus = (dossier: any) => {
    const userId = (session?.user as any)?._id || (session?.user as any)?.id;
    const transmission = dossier.transmittedTo?.find((t: any) => 
      (t.partenaire?._id?.toString() || t.partenaire?.toString()) === userId
    );
    
    if (!transmission) return 'pending';
    return transmission.status || 'pending';
  };
  
  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
      pending: 'En attente',
      accepted: 'Accepté',
      refused: 'Refusé'
    };
    return labels[status] || 'En attente';
  };
  
  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      pending: 'bg-yellow-100 text-yellow-800',
      accepted: 'bg-green-100 text-green-800',
      refused: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };
  
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    // Si c'est un objet, essayer de le convertir en string (pour ObjectId MongoDB)
    if (typeof value === 'object') {
      // Si l'objet a une méthode toString(), l'utiliser
      if (typeof value.toString === 'function') {
        try {
          return value.toString();
        } catch (e) {
          console.warn('Erreur lors de la conversion toString:', value);
          return '';
        }
      }
      // Si l'objet a une propriété _id ou id, l'utiliser
      if (value._id) {
        return safeString(value._id);
      }
      if (value.id) {
        return safeString(value.id);
      }
      console.warn('Tentative de convertir un objet en string:', value);
      return '';
    }
    return '';
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <main className="w-full px-4 py-8 max-w-full">
        {/* En-tête avec navigation rapide */}
        <div id="dashboard-top" className="mb-8 scroll-mt-20">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Tableau de bord Partenaire
              </h1>
              <p className="text-muted-foreground text-lg">Gérez vos dossiers transmis et communiquez avec l'équipe</p>
            </div>
          </div>
        </div>
        
        {/* Statistiques principales - Design professionnel avec accès direct */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 scroll-mt-20">
          {/* Badge Dossiers transmis */}
          <Link href="/partenaire/dossiers" className="group">
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-primary hover:shadow-lg hover:border-primary/80 transition-all duration-200 hover:-translate-y-1 cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <FolderOpen className="w-6 h-6 text-primary" />
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-primary transition-colors">{stats.dossiersTransmis}</p>
                </div>
              </div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Dossiers transmis</h3>
              <p className="text-xs text-muted-foreground mb-3">Total des dossiers</p>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-muted-foreground">Tous les dossiers</span>
                <span className="text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Accéder →</span>
              </div>
            </div>
          </Link>

          {/* Badge En attente */}
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500 hover:shadow-lg hover:border-yellow-600 transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-foreground mb-0">{stats.dossiersEnAttente}</p>
          </div>
        </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">En attente</h3>
            <p className="text-xs text-muted-foreground mb-3">Dossiers en attente de traitement</p>
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="inline-flex items-center px-2 py-1 rounded-md bg-yellow-500/10 text-yellow-600 text-xs font-semibold">
                En attente d'action
              </span>
            </div>
          </div>

          {/* Badge Acceptés */}
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500 hover:shadow-lg hover:border-green-600 transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-green-600 transition-colors">{stats.dossiersAcceptes}</p>
          </div>
        </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Acceptés</h3>
            <p className="text-xs text-muted-foreground mb-3">Dossiers acceptés</p>
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-500/10 text-green-600 text-xs font-semibold">
                En cours de traitement
              </span>
            </div>
          </div>

          {/* Badge Refusés */}
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-red-500 hover:shadow-lg hover:border-red-600 transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-red-500/10 rounded-lg flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-foreground mb-0">{stats.dossiersRefuses}</p>
          </div>
        </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Refusés</h3>
            <p className="text-xs text-muted-foreground mb-3">Dossiers refusés</p>
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="inline-flex items-center px-2 py-1 rounded-md bg-red-500/10 text-red-600 text-xs font-semibold">
                Dossiers refusés
              </span>
            </div>
          </div>

          {/* Badge Messages */}
          <Link href="/partenaire/messages" className="group">
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500 hover:shadow-lg hover:border-blue-600 transition-all duration-200 hover:-translate-y-1 cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                  <MessageSquare className="w-6 h-6 text-blue-600" />
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-blue-600 transition-colors">{stats.messagesNonLus}</p>
                </div>
              </div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Messages</h3>
              <p className="text-xs text-muted-foreground mb-3">Messages non lus</p>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-muted-foreground">Consulter les messages</span>
                <span className="text-blue-600 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Accéder →</span>
              </div>
            </div>
          </Link>

          {/* Badge Notifications */}
          <Link href="/partenaire/notifications" className="group">
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500 hover:shadow-lg hover:border-purple-600 transition-all duration-200 hover:-translate-y-1 cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                  <Bell className="w-6 h-6 text-purple-600" />
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-foreground mb-0 group-hover:text-purple-600 transition-colors">{stats.notificationsNonLues}</p>
                </div>
              </div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Notifications</h3>
              <p className="text-xs text-muted-foreground mb-3">Notifications non lues</p>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-muted-foreground">Consulter les notifications</span>
                <span className="text-purple-600 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Accéder →</span>
              </div>
            </div>
          </Link>
        </div>
        
      {/* (Sections Dossiers / Messages rapides supprimées pour éviter les répétitions) */}
      </main>
    </div>
  );
}