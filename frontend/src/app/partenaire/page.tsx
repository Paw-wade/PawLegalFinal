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
    // Si c'est un objet, ne pas le convertir, retourner une chaîne vide
    if (typeof value === 'object') {
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

        {/* Actions rapides */}
        <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-4 mb-8 scroll-mt-20">
          <Link href="/partenaire/dossiers" className="group">
            <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl shadow-lg p-6 hover:shadow-2xl transition-all duration-300 border border-blue-200 hover:border-blue-400 hover:scale-105">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                  <FolderOpen className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-foreground group-hover:text-blue-600 transition-colors mb-1">Dossiers</h3>
                  <p className="text-sm text-muted-foreground">Consultez tous vos dossiers transmis</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-blue-200">
                <span className="text-xs font-medium text-blue-600">Accéder →</span>
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <span className="text-blue-600 text-sm">→</span>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/partenaire/messages" className="group">
            <div className="bg-gradient-to-br from-white to-green-50 rounded-2xl shadow-lg p-6 hover:shadow-2xl transition-all duration-300 border border-green-200 hover:border-green-400 hover:scale-105">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-foreground group-hover:text-green-600 transition-colors mb-1">Messages</h3>
                  <p className="text-sm text-muted-foreground">Communiquez avec l'équipe</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-green-200">
                <span className="text-xs font-medium text-green-600">Accéder →</span>
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                  <span className="text-green-600 text-sm">→</span>
                </div>
              </div>
            </div>
          </Link>
        </div>
      
        {/* Dossiers récents */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Dossiers récents</h2>
              <Link 
                href="/partenaire/dossiers"
                className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
              >
                Voir tout →
              </Link>
            </div>
          </div>
          
          <div className="p-6">
            {dossiersRecents.length === 0 ? (
              <div className="text-center py-12">
                <FolderOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">Aucun dossier transmis pour le moment</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dossiersRecents.map((dossier: any) => {
                  const status = getDossierStatus(dossier);
                  const dossierId = safeString(dossier._id) || safeString(dossier.id) || '';
                  const dossierHref = dossierId ? `/partenaire/dossiers/${dossierId}` : '#';
                  
                  return (
                    <Link
                      key={dossierId || `dossier-${Math.random()}`}
                      href={dossierHref}
                      className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-primary/30 transition-all duration-200"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-lg text-foreground mb-1 truncate">
                            {safeString(dossier.titre) || safeString(dossier.numero) || 'Sans titre'}
                          </h3>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {(() => {
                              const numStr = safeString(dossier.numero);
                              const descStr = safeString(dossier.description);
                              const parts: string[] = [];
                              if (numStr) parts.push(`N° ${numStr}`);
                              if (numStr && descStr) parts.push(' • ');
                              if (descStr) {
                                const truncated = descStr.substring(0, 100);
                                parts.push(truncated);
                                if (descStr.length > 100) parts.push('...');
                              }
                              return parts.join('');
                            })()}
                          </p>
                          {dossier.user && typeof dossier.user === 'object' && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Client: {safeString(dossier.user.firstName)} {safeString(dossier.user.lastName)}
                            </p>
                          )}
                        </div>
                        <div className="ml-4 flex-shrink-0">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                            {getStatusLabel(status)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}