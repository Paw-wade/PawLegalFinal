'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ReservationWidget } from '@/components/ReservationWidget';
import { appointmentsAPI, userAPI, dossiersAPI } from '@/lib/api';

function Button({ children, variant = 'default', size = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  const sizeClasses = {
    default: 'h-10 py-2 px-4',
    sm: 'h-9 px-3',
    lg: 'h-11 px-8',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} {...props}>{children}</button>;
}

function RendezVousPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rendezVous, setRendezVous] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReservationWidgetOpen, setIsReservationWidgetOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState<string | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editFormData, setEditFormData] = useState({
    date: '',
    heure: '',
    motif: '',
    description: '',
    notes: ''
  });
  const [markingAsDone, setMarkingAsDone] = useState<string | null>(null);
  const [showCreateDossierModal, setShowCreateDossierModal] = useState(false);
  const [appointmentForDossier, setAppointmentForDossier] = useState<any>(null);
  const [isCreatingDossier, setIsCreatingDossier] = useState(false);
  const [dossierFormData, setDossierFormData] = useState({
    titre: '',
    description: '',
    categorie: 'autre',
    type: '',
    priorite: 'normale'
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated' && session) {
      // S'assurer que le token est stocké dans localStorage
      if ((session.user as any)?.accessToken && typeof window !== 'undefined') {
        const token = (session.user as any).accessToken;
        if (!localStorage.getItem('token')) {
          localStorage.setItem('token', token);
          console.log('🔑 Token stocké dans localStorage depuis la session');
        }
      }
      loadRendezVous();
    }
  }, [session, status, router, searchParams]);

  const loadRendezVousForUser = async (userId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('📅 Chargement des rendez-vous pour l\'utilisateur:', userId);
      
      // Utiliser l'API admin avec l'ID de l'utilisateur
      const response = await appointmentsAPI.getAllAppointments({ userId });
      console.log('📅 Réponse API rendez-vous:', response.data);
      
      if (response.data.success) {
        const appointments = response.data.data || response.data.appointments || [];
        setRendezVous(appointments);
        console.log('✅ Rendez-vous chargés:', appointments.length);
      } else {
        setError('Erreur lors du chargement des rendez-vous');
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement des rendez-vous:', err);
      console.error('❌ Détails de l\'erreur:', {
        status: err.response?.status,
        message: err.response?.data?.message,
        data: err.response?.data
      });
      setError(err.response?.data?.message || 'Erreur lors du chargement des rendez-vous');
    } finally {
      setIsLoading(false);
    }
  };

  const loadRendezVous = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userEmail = session?.user?.email || 'utilisateur';
      console.log('📅 Chargement des rendez-vous pour l\'utilisateur:', userEmail);
      
      // Vérifier que le token est disponible
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token && session && (session.user as any)?.accessToken) {
          localStorage.setItem('token', (session.user as any).accessToken);
          console.log('🔑 Token stocké dans localStorage depuis la session');
        }
        if (!token) {
          console.warn('⚠️ Aucun token trouvé pour charger les rendez-vous');
        }
      }
      
      const response = await appointmentsAPI.getMyAppointments();
      console.log('📅 Réponse API rendez-vous:', response.data);
      
      if (response.data.success) {
        const appointments = response.data.data || response.data.appointments || [];
        setRendezVous(appointments);
        console.log('✅ Rendez-vous chargés:', appointments.length);
      } else {
        setError('Erreur lors du chargement des rendez-vous');
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement des rendez-vous:', err);
      console.error('❌ Détails de l\'erreur:', {
        status: err.response?.status,
        message: err.response?.data?.message,
        data: err.response?.data
      });
      setError(err.response?.data?.message || 'Erreur lors du chargement des rendez-vous');
    } finally {
      setIsLoading(false);
    }
  };

  const getUserName = () => {
    return session?.user?.name || 'Utilisateur';
  };

  const getUserEmail = () => {
    return session?.user?.email || '';
  };

  const handleCancelAppointment = async (appointmentId: string) => {
    setCancellingId(appointmentId);
    setError(null);
    try {
      const response = await appointmentsAPI.cancelAppointment(appointmentId);
      
      if (response.data.success) {
        // Recharger la liste des rendez-vous
        await loadRendezVous();
        setShowCancelConfirm(null);
      } else {
        setError(response.data.message || 'Erreur lors de l\'annulation du rendez-vous');
      }
    } catch (err: any) {
      console.error('❌ Erreur lors de l\'annulation du rendez-vous:', err);
      setError(err.response?.data?.message || 'Erreur lors de l\'annulation du rendez-vous');
    } finally {
      setCancellingId(null);
    }
  };

  const handleEditAppointment = (rdv: any) => {
    setEditingAppointment(rdv);
    setEditFormData({
      date: rdv.date ? new Date(rdv.date).toISOString().split('T')[0] : '',
      heure: rdv.heure || '',
      motif: rdv.motif || '',
      description: rdv.description || '',
      notes: rdv.notes || ''
    });
    setShowEditModal(true);
  };

  const handleUpdateAppointment = async () => {
    if (!editingAppointment) return;

    setIsUpdating(true);
    setError(null);
    try {
      const response = await appointmentsAPI.updateMyAppointment(editingAppointment._id || editingAppointment.id, {
        date: editFormData.date,
        heure: editFormData.heure,
        motif: editFormData.motif,
        description: editFormData.description
      });
      
      if (response.data.success) {
        // Recharger la liste des rendez-vous
        await loadRendezVous();
        setShowEditModal(false);
        setEditingAppointment(null);
        setEditFormData({
          date: '',
          heure: '',
          motif: '',
          description: '',
          notes: ''
        });
        alert('Rendez-vous modifié avec succès ! Vous recevrez une notification.');
      } else {
        setError(response.data.message || 'Erreur lors de la modification du rendez-vous');
      }
    } catch (err: any) {
      console.error('❌ Erreur lors de la modification du rendez-vous:', err);
      setError(err.response?.data?.message || 'Erreur lors de la modification du rendez-vous');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkAsDone = async (appointmentId: string, isDone: boolean) => {
    setMarkingAsDone(appointmentId);
    setError(null);
    try {
      const response = await appointmentsAPI.updateMyAppointment(appointmentId, {
        effectue: isDone
      } as any);
      
      if (response.data.success) {
        // Utiliser les données du rendez-vous mis à jour depuis la réponse
        const updatedAppointment = response.data.data;
        
        // Recharger la liste des rendez-vous
        await loadRendezVous();
        
        if (isDone && updatedAppointment) {
          // Si marqué comme effectué, proposer de créer un dossier
          setAppointmentForDossier(updatedAppointment);
          setDossierFormData({
            titre: `Dossier suite au rendez-vous du ${new Date(updatedAppointment.date).toLocaleDateString('fr-FR')}`,
            description: `Dossier créé suite au rendez-vous du ${new Date(updatedAppointment.date).toLocaleDateString('fr-FR')} à ${updatedAppointment.heure}.\n\nMotif: ${updatedAppointment.motif || 'N/A'}\n${updatedAppointment.description ? `Description: ${updatedAppointment.description}` : ''}`,
            categorie: 'autre',
            type: '',
            priorite: 'normale'
          });
          setShowCreateDossierModal(true);
        }
      } else {
        setError(response.data.message || 'Erreur lors de la mise à jour du rendez-vous');
      }
    } catch (err: any) {
      console.error('❌ Erreur lors de la mise à jour du rendez-vous:', err);
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour du rendez-vous');
    } finally {
      setMarkingAsDone(null);
    }
  };

  const handleCreateDossierFromAppointment = async () => {
    if (!appointmentForDossier) return;

    setIsCreatingDossier(true);
    setError(null);
    try {
      const dossierData: any = {
        titre: dossierFormData.titre || `Dossier suite au rendez-vous du ${new Date(appointmentForDossier.date).toLocaleDateString('fr-FR')}`,
        description: dossierFormData.description,
        categorie: dossierFormData.categorie,
        type: dossierFormData.type || '',
        statut: 'recu',
        priorite: dossierFormData.priorite,
        rendezVousId: appointmentForDossier._id || appointmentForDossier.id
      };

      // Si l'utilisateur est connecté, utiliser son ID
      if (session && (session.user as any)?.id) {
        dossierData.userId = (session.user as any).id;
      } else {
        // Sinon, utiliser les informations du rendez-vous
        dossierData.clientNom = appointmentForDossier.nom || '';
        dossierData.clientPrenom = appointmentForDossier.prenom || '';
        dossierData.clientEmail = appointmentForDossier.email || '';
        dossierData.clientTelephone = appointmentForDossier.telephone || '';
      }

      const response = await dossiersAPI.createDossier(dossierData);
      
      if (response.data.success) {
        setShowCreateDossierModal(false);
        setAppointmentForDossier(null);
        setDossierFormData({
          titre: '',
          description: '',
          categorie: 'autre',
          type: '',
          priorite: 'normale'
        });
        alert('Dossier créé avec succès ! Vous pouvez le consulter dans la section "Mes Dossiers".');
        // Optionnel : rediriger vers les dossiers
        // router.push('/client/dossiers');
      } else {
        setError(response.data.message || 'Erreur lors de la création du dossier');
      }
    } catch (err: any) {
      console.error('❌ Erreur lors de la création du dossier:', err);
      setError(err.response?.data?.message || 'Erreur lors de la création du dossier');
    } finally {
      setIsCreatingDossier(false);
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

  if (status === 'unauthenticated') return null;

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full px-4 py-16">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Mes Rendez-vous</h1>
            <p className="text-muted-foreground">Gérez vos rendez-vous et prenez de nouveaux créneaux</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadRendezVous} disabled={isLoading}>
              Actualiser
            </Button>
            <Button onClick={() => setIsReservationWidgetOpen(true)}>Prendre rendez-vous</Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement des rendez-vous...</p>
          </div>
        ) : rendezVous.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <div className="text-6xl mb-4">📅</div>
            <p className="text-muted-foreground mb-4">Vous n'avez pas de rendez-vous programmé</p>
            <Button onClick={() => setIsReservationWidgetOpen(true)}>Prendre mon premier rendez-vous</Button>
          </div>
        ) : (
          <>
            {/* Liste des rendez-vous en cartes - Style identique aux dossiers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {rendezVous.map((rdv) => {
                const getStatutColor = (statut: string) => {
                  switch (statut) {
                    case 'confirme':
                      return 'bg-green-100 text-green-800';
                    case 'en_attente':
                      return 'bg-yellow-100 text-yellow-800';
                    case 'annule':
                      return 'bg-red-100 text-red-800';
                    case 'termine':
                      return 'bg-gray-100 text-gray-800';
                    default:
                      return 'bg-blue-100 text-blue-800';
                  }
                };

                const getStatutLabel = (statut: string) => {
                  switch (statut) {
                    case 'confirme':
                      return 'Confirmé';
                    case 'en_attente':
                      return 'En attente';
                    case 'annule':
                      return 'Annulé';
                    case 'termine':
                      return 'Terminé';
                    default:
                      return statut?.replace('_', ' ') || 'En attente';
                  }
                };

                const formatDate = (date: string) => {
                  if (!date) return '-';
                  const d = new Date(date);
                  return d.toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  });
                };

                const formatTime = (time: string) => {
                  if (!time) return '';
                  return time.substring(0, 5); // Format HH:MM
                };

                // Calculer si le rendez-vous est passé en tenant compte de la date ET de l'heure
                let isPast = false;
                if (rdv.date && rdv.heure) {
                  const dateObj = new Date(rdv.date);
                  const [hours, minutes] = rdv.heure.split(':').map(Number);
                  const appointmentDateTime = new Date(dateObj);
                  appointmentDateTime.setHours(hours || 0, minutes || 0, 0, 0);
                  const now = new Date();
                  isPast = appointmentDateTime < now;
                } else if (rdv.date) {
                  const dateObj = new Date(rdv.date);
                  const appointmentDateEnd = new Date(dateObj);
                  appointmentDateEnd.setHours(23, 59, 59, 999);
                  isPast = appointmentDateEnd < new Date();
                }

                const canCancel = rdv.statut !== 'annule' && rdv.statut !== 'termine' && !isPast;
                const canMarkAsDone = rdv.statut !== 'annule' && !rdv.effectue;
                const appointmentId = rdv._id || rdv.id;

                // Déterminer le style de la carte (bordure gauche colorée comme les dossiers)
                const getCardBorderStyle = () => {
                  if (rdv.statut === 'annule') {
                    return 'border-l-4 border-l-red-500 border-t border-r border-b border-gray-200';
                  }
                  if (rdv.statut === 'termine' || rdv.effectue) {
                    return 'border-l-4 border-l-green-500 border-t border-r border-b border-gray-200';
                  }
                  if (isPast && !rdv.effectue) {
                    return 'border-l-4 border-l-red-500 border-t border-r border-b border-gray-200';
                  }
                  if (rdv.statut === 'confirme') {
                    return 'border-l-4 border-l-blue-500 border-t border-r border-b border-gray-200';
                  }
                  return 'border-l-4 border-l-yellow-500 border-t border-r border-b border-gray-200';
                };

                return (
                  <div
                    key={appointmentId}
                    className={`border rounded-xl p-5 hover:shadow-xl transition-all duration-200 bg-white ${getCardBorderStyle()}`}
                  >
                    {/* En-tête de la carte */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="font-bold text-base text-foreground mb-1 line-clamp-2 leading-tight">
                          {rdv.motif || 'Rendez-vous'}
                        </h3>
                        {rdv.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {rdv.description}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${getStatutColor(rdv.statut || 'en_attente')}`}>
                          {getStatutLabel(rdv.statut || 'en_attente')}
                        </span>
                        {isPast && !rdv.effectue && rdv.statut !== 'annule' && (
                          <span className="px-2 py-1 rounded-md text-xs font-semibold bg-red-100 text-red-800">
                            ⚠️ Dépassé
                          </span>
                        )}
                        {rdv.effectue ? (
                          <span className="px-2 py-1 rounded-md text-xs font-semibold bg-green-100 text-green-800">
                            ✅ Effectué
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-md text-xs font-semibold bg-gray-100 text-gray-800">
                            ⏳ À venir
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Informations du rendez-vous */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">📅</span>
                        <span className="font-medium text-foreground">
                          {formatDate(rdv.date)}
                        </span>
                      </div>

                      {rdv.heure && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">🕐</span>
                          <span className="font-medium text-foreground">
                            {formatTime(rdv.heure)}
                          </span>
                        </div>
                      )}

                      {(rdv.nom || rdv.prenom) && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">👤</span>
                          <span className="text-foreground">
                            {rdv.prenom} {rdv.nom}
                          </span>
                        </div>
                      )}

                      {rdv.email && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">✉️</span>
                          <span className="text-foreground truncate">{rdv.email}</span>
                        </div>
                      )}

                      {rdv.telephone && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">📞</span>
                          <span className="text-foreground">{rdv.telephone}</span>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {rdv.notes && (
                      <div className="mb-3 pt-2 border-t border-gray-100">
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          <span className="font-semibold">Notes:</span> {rdv.notes}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex items-center justify-end">
                        <div className="flex items-center gap-2">
                          {canMarkAsDone && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8 border-green-300 text-green-600 hover:bg-green-50 hover:border-green-400"
                              onClick={() => handleMarkAsDone(appointmentId, true)}
                              disabled={markingAsDone === appointmentId}
                            >
                              {markingAsDone === appointmentId ? 'Marquage...' : '✅ Marquer comme effectué'}
                            </Button>
                          )}
                          {canCancel && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-8"
                                onClick={() => handleEditAppointment(rdv)}
                                disabled={isUpdating}
                              >
                                ✏️ Modifier
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-8 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
                                onClick={() => setShowCancelConfirm(appointmentId)}
                                disabled={cancellingId === appointmentId}
                              >
                                {cancellingId === appointmentId ? 'Annulation...' : 'Annuler'}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {rendezVous.length > 0 && (
              <div className="mt-6 pt-4 border-t flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">{rendezVous.length}</span> rendez-vous{rendezVous.length > 1 ? '' : ''}
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal de réservation */}
      {isReservationWidgetOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setIsReservationWidgetOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="relative">
            <ReservationWidget 
              isOpen={isReservationWidgetOpen} 
              onClose={() => setIsReservationWidgetOpen(false)}
              onSuccess={() => {
                setIsReservationWidgetOpen(false);
                loadRendezVous(); // Recharger la liste des rendez-vous
              }}
            />
          </div>
        </div>
      )}

      {/* Modal de création de dossier depuis rendez-vous */}
      {showCreateDossierModal && appointmentForDossier && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold">Créer un dossier depuis le rendez-vous</h3>
              <button
                onClick={() => {
                  setShowCreateDossierModal(false);
                  setAppointmentForDossier(null);
                  setDossierFormData({
                    titre: '',
                    description: '',
                    categorie: 'autre',
                    type: '',
                    priorite: 'normale'
                  });
                }}
                className="text-2xl text-muted-foreground hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Rendez-vous:</strong> {appointmentForDossier.motif || 'Rendez-vous'} - {new Date(appointmentForDossier.date).toLocaleDateString('fr-FR')} à {appointmentForDossier.heure}
              </p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleCreateDossierFromAppointment(); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Titre du dossier *</label>
                <input
                  type="text"
                  value={dossierFormData.titre}
                  onChange={(e) => setDossierFormData({ ...dossierFormData, titre: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="Ex: Demande de titre de séjour"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Catégorie *</label>
                <select
                  value={dossierFormData.categorie}
                  onChange={(e) => setDossierFormData({ ...dossierFormData, categorie: e.target.value, type: '' })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                >
                  <option value="sejour_titres">Séjour et titres de séjour</option>
                  <option value="contentieux_administratif">Contentieux administratif</option>
                  <option value="asile">Asile</option>
                  <option value="regroupement_familial">Regroupement familial</option>
                  <option value="nationalite_francaise">Nationalité française</option>
                  <option value="eloignement_urgence">Éloignement et urgence</option>
                  <option value="autre">Autre</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <input
                  type="text"
                  value={dossierFormData.type}
                  onChange={(e) => setDossierFormData({ ...dossierFormData, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="Type de dossier"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={dossierFormData.description}
                  onChange={(e) => setDossierFormData({ ...dossierFormData, description: e.target.value })}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="Description du dossier..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Priorité</label>
                <select
                  value={dossierFormData.priorite}
                  onChange={(e) => setDossierFormData({ ...dossierFormData, priorite: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                >
                  <option value="basse">Basse</option>
                  <option value="normale">Normale</option>
                  <option value="haute">Haute</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateDossierModal(false);
                    setAppointmentForDossier(null);
                    setDossierFormData({
                      titre: '',
                      description: '',
                      categorie: 'autre',
                      type: '',
                      priorite: 'normale'
                    });
                  }}
                  disabled={isCreatingDossier}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={isCreatingDossier}
                >
                  {isCreatingDossier ? 'Création...' : 'Créer le dossier'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmation d'annulation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Confirmer l'annulation</h3>
            <p className="text-muted-foreground mb-6">
              Êtes-vous sûr de vouloir annuler ce rendez-vous ? Cette action est irréversible.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowCancelConfirm(null)}
                disabled={cancellingId === showCancelConfirm}
              >
                Annuler
              </Button>
              <Button
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={() => handleCancelAppointment(showCancelConfirm)}
                disabled={cancellingId === showCancelConfirm}
              >
                {cancellingId === showCancelConfirm ? 'Annulation...' : 'Confirmer l\'annulation'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RendezVousPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    }>
      <RendezVousPageContent />
    </Suspense>
  );
}

