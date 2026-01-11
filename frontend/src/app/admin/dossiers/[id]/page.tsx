'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { DossierDetailView } from '@/components/DossierDetailView';
import { dossiersAPI, notificationsAPI, messagesAPI, documentRequestsAPI, documentsAPI, userAPI } from '@/lib/api';
import { DocumentRequestNotificationModal } from '@/components/DocumentRequestNotificationModal';
import { DocumentPreview } from '@/components/DocumentPreview';
import { getStatutColor, getStatutLabel, getPrioriteColor, getDossierProgress, calculateDaysSince, formatRelativeTime, getNextAction, getTimelineSteps } from '@/lib/dossierUtils';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent',
    ghost: 'hover:bg-accent',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

export default function AdminDossierDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const dossierId = params?.id as string;
  
  const [dossier, setDossier] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [documentRequests, setDocumentRequests] = useState<any[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [selectedDocumentRequestNotification, setSelectedDocumentRequestNotification] = useState<any>(null);
  const [showDocumentRequestModal, setShowDocumentRequestModal] = useState(false);
  const [selectedDocumentForPreview, setSelectedDocumentForPreview] = useState<any>(null);
  const [showDocumentPreviewModal, setShowDocumentPreviewModal] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (status === 'loading') {
      return;
    }

    if (status === 'unauthenticated' && !token) {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated' && session) {
      const userRole = (session.user as any)?.role;
      const isAuthorized = userRole === 'admin' || userRole === 'superadmin';
      if (!isAuthorized) {
        router.push('/client');
        return;
      }
      
      if ((session.user as any)?.accessToken && typeof window !== 'undefined') {
        const token = (session.user as any).accessToken;
        if (!localStorage.getItem('token')) {
          localStorage.setItem('token', token);
        }
      }
      loadDossier();
      loadNotifications();
      loadMessagesForDossier();
      loadDocumentRequests();
      loadDocuments();
    } else if (token) {
      loadDossier();
      loadNotifications();
      loadDocumentRequests();
      loadDocuments();
    }
  }, [session, status, router, dossierId]);

  // Rafraîchissement automatique toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(() => {
      if (session || localStorage.getItem('token')) {
        loadDossier();
        loadNotifications();
        loadMessagesForDossier();
        loadDocumentRequests();
        loadDocuments();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [session, dossierId]);

  const loadDossier = async () => {
    if (!dossierId) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token && session && (session.user as any)?.accessToken) {
        localStorage.setItem('token', (session.user as any).accessToken);
      }
      
      const response = await dossiersAPI.getDossierById(dossierId);
      
      if (response.data.success) {
        setDossier(response.data.dossier);
      } else {
        setError('Erreur lors du chargement du dossier');
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement du dossier:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement du dossier');
    } finally {
      setIsLoading(false);
    }
  };

  const loadNotifications = async () => {
    if (!dossierId) return;
    
    try {
      const response = await notificationsAPI.getNotifications({
        limit: 50
      });
      
      if (response.data.success) {
        // Filtrer les notifications liées à ce dossier
        const dossierNotifications = (response.data.notifications || []).filter((notif: any) => 
          (notif.metadata?.dossierId === dossierId) || 
          (notif.data?.dossierId === dossierId)
        );
        setNotifications(dossierNotifications);
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement des notifications:', err);
    }
  };

  const loadMessagesForDossier = async () => {
    if (!dossierId) return;

    setIsLoadingMessages(true);
    setMessagesError(null);
    try {
      const response = await messagesAPI.getMessages({ type: 'all', dossierId });
      if (response.data.success) {
        setMessages(response.data.messages || []);
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement des messages du dossier:', err);
      setMessagesError(err.response?.data?.message || 'Erreur lors du chargement des messages du dossier');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const loadDocumentRequests = async () => {
    if (!dossierId) return;
    setIsLoadingRequests(true);
    try {
      const response = await documentRequestsAPI.getRequests({
        dossierId: dossierId
      });
      if (response.data.success) {
        setDocumentRequests(response.data.documentRequests || []);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des demandes de documents:', err);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  const loadDocuments = async () => {
    if (!dossierId) return;
    setIsLoadingDocuments(true);
    try {
      const response = await documentsAPI.getAllDocuments();
      if (response.data.success) {
        const allDocuments = response.data.documents || response.data.data || [];
        // Filtrer les documents liés à ce dossier
        const dossierDocuments = allDocuments.filter((doc: any) => 
          doc.dossierId && (doc.dossierId._id || doc.dossierId).toString() === dossierId.toString()
        );
        setDocuments(dossierDocuments);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des documents:', err);
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement du dossier...</p>
        </div>
      </div>
    );
  }

  if (error || !dossier) {
    return (
      <div className="min-h-screen bg-background">
        <main className="w-full px-4 py-16">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <h2 className="text-xl font-bold text-red-900 mb-2">Erreur</h2>
            <p className="text-red-700 mb-4">{error || 'Dossier non trouvé'}</p>
            <Link href="/admin/dossiers">
              <Button variant="outline">Retour à la liste des dossiers</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/10">
      <main className="w-full px-4 py-8 overflow-x-hidden">
        {/* En-tête amélioré */}
        <div className="mb-6">
          <Link href="/admin/dossiers" className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 mb-4 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour aux dossiers
          </Link>
          
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6 overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-foreground">{dossier.titre}</h1>
                  {(dossier.numero || dossier.numeroDossier) && (
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-sm font-semibold">
                      N° {dossier.numero || dossier.numeroDossier}
                    </span>
                  )}
                </div>
                {dossier.description && (
                  <p className="text-muted-foreground text-sm mb-3">{dossier.description}</p>
                )}
                
                {/* Barre de progression */}
                {(() => {
                  const progress = getDossierProgress(dossier.statut);
                  return (
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground font-medium">Progression du dossier</span>
                        <span className="font-bold text-foreground">{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div 
                          className={`h-3 rounded-full transition-all duration-500 ${
                            progress >= 80 ? 'bg-green-500' : 
                            progress >= 50 ? 'bg-blue-500' : 
                            progress >= 25 ? 'bg-yellow-500' : 
                            'bg-gray-400'
                          }`}
                          style={{width: `${Math.min(progress, 100)}%`, maxWidth: '100%'}}
                        ></div>
                      </div>
                    </div>
                  );
                })()}
                
                {/* Timeline */}
                {(() => {
                  const steps = getTimelineSteps(dossier.statut);
                  return (
                    <div className="mb-4 pb-4 border-b border-gray-200 overflow-x-auto">
                      <div className="flex items-center gap-2 min-w-max">
                        {steps.map((step, index) => (
                          <div key={step.key} className="flex items-center gap-2 flex-shrink-0">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
                                step.completed ? 'bg-green-500' : 'bg-gray-300'
                              }`}></span>
                              <span className={`text-[10px] font-medium whitespace-nowrap ${
                                step.completed ? 'text-green-700' : 'text-gray-400'
                              }`}>
                                {step.label}
                              </span>
                            </div>
                            {index < steps.length - 1 && (
                              <div className={`h-0.5 w-6 flex-shrink-0 ${
                                step.completed ? 'bg-green-500' : 'bg-gray-300'
                              }`}></div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                
                {/* Statuts et informations rapides */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${getStatutColor(dossier.statut)}`}>
                    {getStatutLabel(dossier.statut)}
                  </span>
                  {dossier.priorite && (
                    <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${getPrioriteColor(dossier.priorite)}`}>
                      {dossier.priorite}
                    </span>
                  )}
                  {/* Indication de transmission */}
                  {dossier.transmittedTo && dossier.transmittedTo.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-100 text-blue-800 border border-blue-300">
                        📤 Dossier transmis
                      </span>
                      {dossier.transmittedTo.map((trans: any, idx: number) => (
                        <span key={idx} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-purple-100 text-purple-800 border border-purple-300">
                          {trans.quality || 'Professionnel'}: {trans.user?.firstName} {trans.user?.lastName}
                          {trans.user?.organisationName && ` (${trans.user.organisationName})`}
                        </span>
                      ))}
                    </div>
                  )}
                  {dossier.createdAt && (
                    <span className="text-xs text-muted-foreground">
                      ⏱️ Ouvert il y a {calculateDaysSince(dossier.createdAt)} jour{calculateDaysSince(dossier.createdAt) > 1 ? 's' : ''}
                    </span>
                  )}
                  {dossier.updatedAt && (
                    <span className="text-xs text-muted-foreground">
                      🔄 {formatRelativeTime(dossier.updatedAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {/* Indication de transmission - Section visible */}
            {dossier.transmittedTo && dossier.transmittedTo.length > 0 && (
              <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-r-lg mb-4">
                <div className="flex items-start gap-3">
                  <span className="text-purple-600 text-xl">📤</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-purple-900 mb-2">Dossier transmis</p>
                    <div className="space-y-2">
                      {dossier.transmittedTo.map((trans: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-purple-800">
                            {trans.quality || 'Professionnel'}:
                          </span>
                          <span className="text-sm text-purple-700 font-semibold">
                            {trans.user?.firstName} {trans.user?.lastName}
                            {trans.user?.organisationName && ` (${trans.user.organisationName})`}
                          </span>
                          <span className="text-xs text-purple-600">
                            - Transmis le {new Date(trans.transmittedAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Prochaine action */}
            {(() => {
              const nextAction = getNextAction(dossier.statut);
              if (nextAction) {
                return (
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
                    <div className="flex items-start gap-3">
                      <span className="text-blue-600 text-xl">📋</span>
                      <div>
                        <p className="text-sm font-semibold text-blue-900 mb-1">Prochaine action requise</p>
                        <p className="text-sm text-blue-700">{nextAction}</p>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Vue détaillée du dossier */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 mb-6">
          <DossierDetailView dossier={dossier} variant="admin" />
        </div>

        {/* Section Transmission aux professionnels */}
        {((session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'superadmin' || (session?.user as any)?.role === 'secretaire') && (
          <TransmissionSection dossier={dossier} onUpdate={loadDossier} />
        )}

        {/* Informations complètes du dossier - Section visible */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">📋 Informations Complètes du Dossier</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-muted-foreground font-semibold">Numéro de dossier</p>
              <p className="font-bold text-lg text-primary">{dossier.numero || dossier._id}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-semibold">Titre</p>
              <p className="font-medium">{dossier.titre || 'Sans titre'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-semibold">Catégorie</p>
              <p className="font-medium">{dossier.categorie?.replace(/_/g, ' ') || 'Non spécifiée'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-semibold">Type de demande</p>
              <p className="font-medium">{dossier.type || 'Non spécifié'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-semibold">Date de création</p>
              <p className="font-medium">
                {new Date(dossier.createdAt).toLocaleDateString('fr-FR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-semibold">Dernière mise à jour</p>
              <p className="font-medium">
                {new Date(dossier.updatedAt || dossier.createdAt).toLocaleDateString('fr-FR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            {dossier.dateEcheance && (
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Date d'échéance</p>
                <p className="font-medium text-orange-600">
                  {new Date(dossier.dateEcheance).toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            )}
            {dossier.createdBy && (
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Créé par</p>
                <p className="font-medium">
                  {dossier.createdBy.firstName} {dossier.createdBy.lastName}
                  {dossier.createdBy.email && ` (${dossier.createdBy.email})`}
                </p>
              </div>
            )}
            {dossier.assignedTo && (
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Assigné à</p>
                <p className="font-medium">
                  {dossier.assignedTo.firstName} {dossier.assignedTo.lastName}
                  {dossier.assignedTo.email && ` (${dossier.assignedTo.email})`}
                  {dossier.assignedTo.role && ` - ${dossier.assignedTo.role}`}
                </p>
              </div>
            )}
            {dossier.teamLeader && (
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Chef d'équipe</p>
                <p className="font-medium">
                  {dossier.teamLeader.firstName} {dossier.teamLeader.lastName}
                  {dossier.teamLeader.email && ` (${dossier.teamLeader.email})`}
                </p>
              </div>
            )}
            {dossier.teamMembers && dossier.teamMembers.length > 0 && (
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground font-semibold mb-2">Membres de l'équipe</p>
                <div className="flex flex-wrap gap-2">
                  {dossier.teamMembers.map((member: any, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                      {member.firstName} {member.lastName}
                      {member.email && ` (${member.email})`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Coordonnées client complètes */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">👤 Coordonnées Client</h2>
          {dossier.user ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Prénom</p>
                <p className="font-medium">{dossier.user.firstName || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Nom</p>
                <p className="font-medium">{dossier.user.lastName || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Email</p>
                <p className="font-medium">{dossier.user.email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Téléphone</p>
                <p className="font-medium">{dossier.user.phone || 'N/A'}</p>
              </div>
              {dossier.user.dateNaissance && (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Date de naissance</p>
                  <p className="font-medium">
                    {new Date(dossier.user.dateNaissance).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              )}
              {dossier.user.lieuNaissance && (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Lieu de naissance</p>
                  <p className="font-medium">{dossier.user.lieuNaissance}</p>
                </div>
              )}
              {dossier.user.nationalite && (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Nationalité</p>
                  <p className="font-medium">{dossier.user.nationalite}</p>
                </div>
              )}
              {dossier.user.sexe && (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Sexe</p>
                  <p className="font-medium">
                    {dossier.user.sexe === 'M' ? 'Masculin' : dossier.user.sexe === 'F' ? 'Féminin' : 'Autre'}
                  </p>
                </div>
              )}
              {dossier.user.numeroEtranger && (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Numéro d'étranger</p>
                  <p className="font-medium">{dossier.user.numeroEtranger}</p>
                </div>
              )}
              {dossier.user.numeroTitre && (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Numéro de titre</p>
                  <p className="font-medium">{dossier.user.numeroTitre}</p>
                </div>
              )}
              {dossier.user.typeTitre && (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Type de titre</p>
                  <p className="font-medium">{dossier.user.typeTitre}</p>
                </div>
              )}
              {dossier.user.dateDelivrance && (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Date de délivrance</p>
                  <p className="font-medium">
                    {new Date(dossier.user.dateDelivrance).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              )}
              {dossier.user.dateExpiration && (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Date d'expiration</p>
                  <p className="font-medium">
                    {new Date(dossier.user.dateExpiration).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              )}
              {dossier.user.adressePostale && (
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground font-semibold">Adresse postale</p>
                  <p className="font-medium">{dossier.user.adressePostale}</p>
                </div>
              )}
              {dossier.user.ville && (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Ville</p>
                  <p className="font-medium">{dossier.user.ville}</p>
                </div>
              )}
              {dossier.user.codePostal && (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Code postal</p>
                  <p className="font-medium">{dossier.user.codePostal}</p>
                </div>
              )}
              {dossier.user.pays && (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Pays</p>
                  <p className="font-medium">{dossier.user.pays}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Prénom</p>
                <p className="font-medium">{dossier.clientPrenom || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Nom</p>
                <p className="font-medium">{dossier.clientNom || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Email</p>
                <p className="font-medium">{dossier.clientEmail || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Téléphone</p>
                <p className="font-medium">{dossier.clientTelephone || 'N/A'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-orange-600 font-semibold">⚠️ Client non inscrit</p>
                <p className="text-sm text-muted-foreground">
                  Les informations complètes ne sont disponibles que pour les clients inscrits
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Motif et catégorie */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">📑 Motif et Nature du Dossier</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground font-semibold">Catégorie principale</p>
              <p className="font-medium text-lg">{dossier.categorie?.replace(/_/g, ' ') || 'Non spécifiée'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-semibold">Type de demande</p>
              <p className="font-medium text-lg">{dossier.type || 'Non spécifié'}</p>
            </div>
            {dossier.categorie && (
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground font-semibold">Code catégorie</p>
                <p className="font-medium text-sm text-muted-foreground">{dossier.categorie}</p>
              </div>
            )}
          </div>
        </div>

        {/* Rendez-vous associés */}
        {dossier.rendezVous && dossier.rendezVous.length > 0 && (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">📅 Rendez-vous Associés ({dossier.rendezVous.length})</h2>
            <div className="space-y-3">
              {dossier.rendezVous.map((rdv: any, index: number) => (
                <div key={index} className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground font-semibold">Date</p>
                      <p className="font-medium">
                        {new Date(rdv.date).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    {rdv.heure && (
                      <div>
                        <p className="text-sm text-muted-foreground font-semibold">Heure</p>
                        <p className="font-medium">{rdv.heure}</p>
                      </div>
                    )}
                    {rdv.motif && (
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground font-semibold">Motif</p>
                        <p className="font-medium">{rdv.motif}</p>
                      </div>
                    )}
                    {rdv.statut && (
                      <div>
                        <p className="text-sm text-muted-foreground font-semibold">Statut</p>
                        <p className="font-medium">{rdv.statut}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes administratives */}
        {dossier.notes && (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">📝 Notes Administratives</h2>
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
              <p className="whitespace-pre-wrap text-foreground">{dossier.notes}</p>
            </div>
          </div>
        )}

        {/* Motif de refus */}
        {dossier.motifRefus && (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-red-600">❌ Motif de Refus</h2>
            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-lg">
              <p className="whitespace-pre-wrap text-foreground">{dossier.motifRefus}</p>
            </div>
          </div>
        )}

        {/* Sections supplémentaires */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Documents demandés */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
            <h2 className="text-xl font-bold mb-4">📄 Documents demandés</h2>
            {isLoadingRequests ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : documentRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune demande de document</p>
            ) : (
              <div className="space-y-3">
                {documentRequests.map((request: any) => (
                  <div
                    key={request._id || request.id}
                    className={`border-l-4 rounded-lg p-4 ${
                      request.isUrgent
                        ? 'bg-red-50 border-red-500'
                        : 'bg-blue-50 border-blue-500'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{request.isUrgent ? '🔴' : '📄'}</span>
                          <h3 className="font-semibold text-base">
                            {request.documentTypeLabel}
                          </h3>
                          {request.isUrgent && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs font-semibold">
                              URGENT
                            </span>
                          )}
                        </div>
                        {request.message && (
                          <p className="text-sm text-muted-foreground mt-1">{request.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Demandé le {new Date(request.createdAt).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        <span className={`inline-block mt-2 px-2 py-1 rounded text-xs font-semibold ${
                          request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          request.status === 'received' ? 'bg-green-100 text-green-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {request.status === 'pending' ? 'En attente' :
                           request.status === 'received' ? '✅ Document reçu' :
                           'Envoyé'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Documents du dossier */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
            <h2 className="text-xl font-bold mb-4">📁 Documents du dossier</h2>
            {isLoadingDocuments ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun document</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc: any) => (
                  <div
                    key={doc._id || doc.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-lg">📄</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{doc.nom}</p>
                        <p className="text-xs text-muted-foreground">
                          {(doc.taille / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="text-xs h-8"
                        onClick={() => {
                          setSelectedDocumentForPreview(doc);
                          setShowDocumentPreviewModal(true);
                        }}
                      >
                        👁️ Voir
                      </Button>
                      <Button
                        variant="outline"
                        className="text-xs h-8"
                        onClick={async () => {
                          try {
                            const response = await documentsAPI.downloadDocument(doc._id || doc.id);
                            const blob = new Blob([response.data]);
                            const url = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = doc.nom;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(url);
                          } catch (error) {
                            console.error('Erreur lors du téléchargement:', error);
                            alert('Erreur lors du téléchargement du document');
                          }
                        }}
                      >
                        ⬇️ Télécharger
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Messages du dossier */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">💬 Messagerie du dossier</h2>
          {isLoadingMessages ? (
            <p className="text-sm text-muted-foreground">Chargement des messages...</p>
          ) : messagesError ? (
            <p className="text-sm text-red-600">{messagesError}</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun message pour ce dossier pour le moment.
            </p>
          ) : (
            <div className="space-y-3">
              {messages.slice(0, 5).map((msg: any) => (
                <div
                  key={msg._id || msg.id}
                  className="border border-gray-100 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm">{msg.sujet}</p>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {new Date(msg.createdAt).toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {msg.contenu}
                  </p>
                </div>
              ))}
              <Link href={`/admin/messages?dossierId=${dossierId}`}>
                <Button variant="outline" className="w-full text-xs mt-2">
                  Voir tous les messages
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Notifications du dossier */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <h2 className="text-xl font-bold mb-4">🔔 Notifications</h2>
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune notification pour ce dossier</p>
          ) : (
            <div className="space-y-2">
              {notifications.slice(0, 5).map((notif: any) => (
                <div
                  key={notif._id || notif.id}
                  className="border border-gray-100 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm">{notif.titre || notif.title}</p>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {new Date(notif.createdAt).toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {notif.message || notif.content}
                  </p>
                </div>
              ))}
              <Link href={`/admin/notifications?dossierId=${dossierId}`}>
                <Button variant="outline" className="w-full text-xs mt-2">
                  Voir toutes les notifications
                </Button>
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Modal de demande de document */}
      <DocumentRequestNotificationModal
        isOpen={showDocumentRequestModal}
        onClose={() => {
          setShowDocumentRequestModal(false);
          setSelectedDocumentRequestNotification(null);
          loadDocumentRequests();
          loadNotifications();
        }}
        notification={selectedDocumentRequestNotification}
        onDocumentSent={async () => {
          await loadDocumentRequests();
          await loadNotifications();
          await loadDocuments();
        }}
      />

      {/* Modal de prévisualisation de document */}
      {selectedDocumentForPreview && (
        <DocumentPreview
          document={selectedDocumentForPreview}
          isOpen={showDocumentPreviewModal}
          onClose={() => {
            setShowDocumentPreviewModal(false);
            setSelectedDocumentForPreview(null);
          }}
        />
      )}
    </div>
  );
}

// Composant pour la section de transmission
function TransmissionSection({ dossier, onUpdate }: { dossier: any; onUpdate: () => void }) {
  const { data: session } = useSession();
  const [professionnels, setProfessionnels] = useState<any[]>([]);
  const [isLoadingProf, setIsLoadingProf] = useState(false);
  const [showTransmitModal, setShowTransmitModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [transmitNotes, setTransmitNotes] = useState('');
  const [isTransmitting, setIsTransmitting] = useState(false);

  useEffect(() => {
    loadProfessionnels();
  }, []);

  const loadProfessionnels = async () => {
    setIsLoadingProf(true);
    try {
      const response = await userAPI.getAllUsers();
      if (response.data.success) {
        // Filtrer pour ne garder que les partenaires
        const partenaires = (response.data.users || []).filter((user: any) => user.role === 'partenaire');
        setProfessionnels(partenaires);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des partenaires:', err);
    } finally {
      setIsLoadingProf(false);
    }
  };

  const handleTransmit = async () => {
    if (!selectedUserId) return;
    setIsTransmitting(true);
    try {
      await dossiersAPI.transmitDossier(dossier._id || dossier.id, {
        partenaireId: selectedUserId,
        notes: transmitNotes
      });
      setShowTransmitModal(false);
      setSelectedUserId('');
      setTransmitNotes('');
      onUpdate();
    } catch (err: any) {
      console.error('Erreur lors de la transmission:', err);
      alert(err.response?.data?.message || 'Erreur lors de la transmission');
    } finally {
      setIsTransmitting(false);
    }
  };

  const handleRemoveTransmission = async (userId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir retirer cette transmission ?')) return;
    try {
      await dossiersAPI.removeTransmission(dossier._id || dossier.id, userId);
      onUpdate();
    } catch (err: any) {
      console.error('Erreur lors du retrait de la transmission:', err);
      alert(err.response?.data?.message || 'Erreur lors du retrait de la transmission');
    }
  };

  const transmittedTo = dossier.transmittedTo || [];
  const currentUserId = (session?.user as any)?.id || '';
  const userRole = (session?.user as any)?.role;
  const isProfessional = false; // Plus de comptes professionnels
  
  // Vérifier si le dossier a été transmis à l'utilisateur actuel
  const myTransmission = transmittedTo.find((trans: any) => {
    const transUserId = trans.user ? (trans.user._id ? trans.user._id.toString() : trans.user.toString()) : null;
    return transUserId === currentUserId;
  });
  const hasAcknowledged = myTransmission?.status === 'accepted' || myTransmission?.status === 'refused';
  const isPending = myTransmission?.status === 'pending' || (!myTransmission?.status && myTransmission?.acknowledgedAt === undefined);
  const isAccepted = myTransmission?.status === 'accepted';
  const isRefused = myTransmission?.status === 'refused';

  const handleAcknowledge = async (action: 'accept' | 'refuse', notes?: string) => {
    if (!confirm(action === 'accept' ? 'Accepter la prise en charge de ce dossier ?' : 'Refuser la prise en charge de ce dossier ?')) return;
    try {
      await dossiersAPI.acknowledgeDossier(dossier._id || dossier.id, action, notes);
      onUpdate();
      alert(action === 'accept' ? 'Dossier accepté avec succès' : 'Dossier refusé');
    } catch (err: any) {
      console.error('Erreur lors de l\'accusé de réception:', err);
      alert(err.response?.data?.message || 'Erreur lors de l\'accusé de réception');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 mb-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">📤 Transmission aux partenaires</h2>
        {(userRole === 'admin' || userRole === 'superadmin') && (
          <Button onClick={() => setShowTransmitModal(true)}>
            + Transmettre le dossier
          </Button>
        )}
      </div>

      {/* Bouton d'acceptation/refus pour les professionnels */}
      {isProfessional && myTransmission && isPending && (
        <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded-r-lg">
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-yellow-900">Action requise</p>
              <p className="text-sm text-yellow-700">
                Vous devez accepter ou refuser ce dossier avant de pouvoir le modifier
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => handleAcknowledge('accept')} className="bg-green-600 hover:bg-green-700">
                ✓ Accepter le dossier
              </Button>
              <Button onClick={() => {
                const notes = prompt('Raison du refus (optionnel):');
                handleAcknowledge('refuse', notes || undefined);
              }} variant="outline" className="border-red-500 text-red-600 hover:bg-red-50">
                ✗ Refuser le dossier
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Indication si déjà accepté */}
      {isProfessional && myTransmission && isAccepted && (
        <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-r-lg">
          <div className="flex items-center gap-2">
            <span className="text-green-600 text-xl">✓</span>
            <div>
              <p className="font-semibold text-green-900">Dossier accepté</p>
              <p className="text-sm text-green-700">
                Vous avez accepté ce dossier le {new Date(myTransmission.acknowledgedAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Indication si refusé */}
      {isProfessional && myTransmission && isRefused && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
          <div className="flex items-center gap-2">
            <span className="text-red-600 text-xl">✗</span>
            <div>
              <p className="font-semibold text-red-900">Dossier refusé</p>
              <p className="text-sm text-red-700">
                Vous avez refusé ce dossier le {new Date(myTransmission.acknowledgedAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
              <p className="text-xs text-red-600 mt-1">
                Le dossier reste visible en lecture seule
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Liste des transmissions */}
      {transmittedTo.length > 0 ? (
        <div className="space-y-3">
          {transmittedTo.map((trans: any, index: number) => {
            const partenaire = trans.partenaire;
            const partenaireName = partenaire 
              ? `${partenaire.firstName || ''} ${partenaire.lastName || ''}`.trim() || partenaire.email
              : 'Partenaire inconnu';
            const organismeName = partenaire?.partenaireInfo?.nomOrganisme;
            const typeOrganisme = partenaire?.partenaireInfo?.typeOrganisme;
            
            return (
              <div key={index} className="border rounded-lg p-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      typeOrganisme === 'consulat' 
                        ? 'bg-blue-100 text-blue-800' 
                        : typeOrganisme === 'avocat'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {typeOrganisme === 'consulat' ? 'Consulat' :
                       typeOrganisme === 'avocat' ? 'Avocat' :
                       typeOrganisme === 'association' ? 'Association' :
                       'Partenaire'}
                    </span>
                    <span className="font-semibold">
                      {partenaireName}
                    </span>
                    {organismeName && (
                      <span className="text-sm text-muted-foreground">
                        ({organismeName})
                      </span>
                    )}
                    {trans.status === 'accepted' && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                        ✓ Accepté
                      </span>
                    )}
                    {trans.status === 'refused' && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                        ✗ Refusé
                      </span>
                    )}
                    {trans.status === 'pending' && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                        ⏳ En attente
                      </span>
                    )}
                  </div>
                  {trans.notes && (
                    <p className="text-sm text-muted-foreground mb-1">{trans.notes}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Transmis le {new Date(trans.transmittedAt).toLocaleDateString('fr-FR')} par {trans.transmittedBy?.firstName} {trans.transmittedBy?.lastName}
                    {trans.acknowledgedAt && (
                      <> • {trans.status === 'accepted' ? 'Accepté' : trans.status === 'refused' ? 'Refusé' : 'Accusé réception'} le {new Date(trans.acknowledgedAt).toLocaleDateString('fr-FR')}</>
                    )}
                  </p>
                </div>
                {(userRole === 'admin' || userRole === 'superadmin') && (
                  <Button 
                    variant="outline" 
                    onClick={() => handleRemoveTransmission(partenaire?._id || partenaire)}
                    className="ml-4"
                  >
                    Retirer
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-center py-8">
          Aucune transmission pour le moment
        </p>
      )}

      {/* Modal de transmission */}
      {showTransmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-4">Transmettre le dossier</h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold mb-2">Sélectionner un partenaire *</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">-- Sélectionner --</option>
                  {professionnels.map((partenaire) => {
                    const typeLabel = partenaire.partenaireInfo?.typeOrganisme === 'consulat' ? 'Consulat' :
                                     partenaire.partenaireInfo?.typeOrganisme === 'avocat' ? 'Avocat' :
                                     partenaire.partenaireInfo?.typeOrganisme === 'association' ? 'Association' :
                                     'Partenaire';
                    const organismeName = partenaire.partenaireInfo?.nomOrganisme;
                    return (
                      <option key={partenaire.id || partenaire._id} value={partenaire.id || partenaire._id}>
                        {partenaire.firstName} {partenaire.lastName} 
                        {organismeName ? ` (${organismeName})` : ''} 
                        - {typeLabel}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Notes (optionnel)</label>
                <textarea
                  value={transmitNotes}
                  onChange={(e) => setTransmitNotes(e.target.value)}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px]"
                  placeholder="Ajouter des notes sur cette transmission..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setShowTransmitModal(false);
                setSelectedUserId('');
                setTransmitNotes('');
              }}>
                Annuler
              </Button>
              <Button onClick={handleTransmit} disabled={!selectedUserId || isTransmitting}>
                {isTransmitting ? 'Transmission...' : 'Transmettre'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

