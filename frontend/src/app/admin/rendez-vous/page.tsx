'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { appointmentsAPI, dossiersAPI } from '@/lib/api';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

function Input({ className = '', type, value, onChange, ...props }: any) {
  // Pour les champs de date, utiliser le composant DateInput qui garantit le format jour/mois/année
  if (type === 'date') {
    return (
      <DateInputComponent
        value={value || ''}
        onChange={(newValue) => {
          if (onChange) {
            const syntheticEvent = {
              target: { value: newValue },
              currentTarget: { value: newValue }
            } as React.ChangeEvent<HTMLInputElement>;
            onChange(syntheticEvent);
          }
        }}
        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ${className}`}
        {...props}
      />
    );
  }
  
  return <input type={type} className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ${className}`} {...props} />;
}

function Textarea({ className = '', ...props }: any) {
  return <textarea className={`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ${className}`} {...props} />;
}

function Label({ htmlFor, children, className = '' }: any) {
  return <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>{children}</label>;
}

const categories = {
  sejour_titres: {
    label: 'Séjour et titres de séjour',
    types: [
      { value: 'premier_titre_etudiant', label: 'Demande de premier titre de séjour (étudiant)' },
      { value: 'premier_titre_salarie', label: 'Demande de premier titre de séjour (salarié)' },
      { value: 'premier_titre_vie_privée', label: 'Demande de premier titre de séjour (vie privée et familiale)' },
      { value: 'premier_titre_malade', label: 'Demande de premier titre de séjour (étranger malade)' },
      { value: 'premier_titre_retraite', label: 'Demande de premier titre de séjour (retraité)' },
      { value: 'premier_titre_visiteur', label: 'Demande de premier titre de séjour (visiteur)' },
      { value: 'renouvellement_titre', label: 'Renouvellement d\'un titre de séjour' },
      { value: 'changement_statut', label: 'Changement de statut' },
      { value: 'carte_talent', label: 'Carte Talent' },
      { value: 'carte_resident', label: 'Demande de carte de résident ou de carte de 10 ans' },
      { value: 'regularisation_travail', label: 'Régularisation par le travail' },
      { value: 'regularisation_humanitaire', label: 'Régularisation pour motifs humanitaires' },
    ]
  },
  contentieux_administratif: {
    label: 'Contentieux administratif',
    types: [
      { value: 'recours_gracieux', label: 'Recours gracieux contre un refus de titre' },
      { value: 'recours_hierarchique', label: 'Recours hiérarchique contre un refus de titre' },
      { value: 'recours_absence_reponse', label: 'Recours contentieux - Absence de réponse à une demande de titre' },
      { value: 'recours_refus_sejour', label: 'Recours contentieux - Refus de séjour' },
      { value: 'recours_refus_enregistrement', label: 'Recours contentieux - Refus d\'enregistrement de la demande' },
    ]
  },
  asile: {
    label: 'Asile',
    types: [
      { value: 'demande_asile', label: 'Demande d\'asile' },
      { value: 'recours_cnda', label: 'Recours CNDA' },
    ]
  },
  regroupement_familial: {
    label: 'Regroupement familial',
    types: [
      { value: 'preparation_dossier_regroupement', label: 'Préparation du dossier de regroupement familial' },
    ]
  },
  nationalite_francaise: {
    label: 'Nationalité française',
    types: [
      { value: 'acquisition_nationalite', label: 'Acquisition de la nationalité française' },
    ]
  },
  eloignement_urgence: {
    label: 'Éloignement et urgence',
    types: [
      { value: 'contestation_oqtf', label: 'Contestation d\'une OQTF' },
    ]
  },
  autre: {
    label: 'Autre',
    types: [
      { value: 'autre', label: 'Autre demande' },
    ]
  }
};

const getCategorieLabel = (categorie: string) => {
  return categories[categorie as keyof typeof categories]?.label || categorie;
};

const getTypeLabel = (categorie: string, type: string) => {
  const categorieTypes = categories[categorie as keyof typeof categories]?.types || [];
  const typeObj = categorieTypes.find(t => t.value === type);
  return typeObj?.label || type;
};

export default function AdminRendezVousPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [rendezVous, setRendezVous] = useState<any[]>([]);
  const [filter, setFilter] = useState('all'); // all, today, week, month
  const [statusFilter, setStatusFilter] = useState<'all' | 'en_attente' | 'confirme' | 'annule' | 'termine'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingRdv, setEditingRdv] = useState<any | null>(null);
  // Fonction pour obtenir la date du jour au format YYYY-MM-DD
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const [editFormData, setEditFormData] = useState({
    statut: '',
    date: getTodayDate(),
    heure: '',
    motif: '',
    description: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateDossierModal, setShowCreateDossierModal] = useState(false);
  const [appointmentForDossier, setAppointmentForDossier] = useState<any | null>(null);
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
    } else if (session) {
      const userRole = (session.user as any)?.role;
      const isAuthorized = userRole === 'admin' || userRole === 'superadmin';
      if (!isAuthorized) {
        router.push('/client');
      } else if (status === 'authenticated') {
        loadAppointments();
      }
    }
  }, [session, status, router, filter, showArchived]);

  const loadAppointments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('🔄 Chargement des rendez-vous admin...');
      const response = await appointmentsAPI.getAllAppointments();
      console.log('✅ Réponse getAllAppointments:', response.data);
      
      if (response.data.success) {
        const appointments = response.data.data || response.data.appointments || [];
        
        // Filtrer selon le filtre sélectionné
        let filtered = appointments;
        const now = new Date();
        
        if (filter === 'today') {
          filtered = appointments.filter((apt: any) => {
            const aptDate = new Date(apt.date);
            return aptDate.toDateString() === now.toDateString();
          });
        } else if (filter === 'week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          filtered = appointments.filter((apt: any) => {
            const aptDate = new Date(apt.date);
            return aptDate >= weekAgo;
          });
        } else if (filter === 'month') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          filtered = appointments.filter((apt: any) => {
            const aptDate = new Date(apt.date);
            return aptDate >= monthAgo;
          });
        }
        
        setRendezVous(filtered);
      } else {
        const errorMessage = response.data.message || 'Erreur lors du chargement des rendez-vous';
        console.error('❌ Réponse non réussie:', errorMessage);
        setError(errorMessage);
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement des rendez-vous:', err);
      console.error('Détails complets:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText,
        config: err.config
      });
      
      // Gérer différents types d'erreurs
      let errorMessage = 'Erreur lors du chargement des rendez-vous';
      
      if (err.response) {
        // Erreur de réponse du serveur
        if (err.response.status === 404) {
          errorMessage = 'Route non trouvée. Vérifiez que le serveur backend est démarré et que la route /api/appointments/admin existe.';
        } else if (err.response.status === 403) {
          errorMessage = 'Accès refusé. Vous devez être administrateur pour accéder à cette page.';
        } else if (err.response.status === 401) {
          errorMessage = 'Non autorisé. Veuillez vous reconnecter.';
        } else {
          errorMessage = err.response.data?.message || `Erreur ${err.response.status}: ${err.response.statusText}`;
        }
      } else if (err.request) {
        // Erreur de connexion
        errorMessage = 'Impossible de contacter le serveur. Vérifiez que le serveur backend est démarré sur le port 3005.';
      } else {
        // Autre erreur
        errorMessage = err.message || errorMessage;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDossierFromAppointment = async (createDossier: boolean) => {
    if (!appointmentForDossier) return;

    setIsCreatingDossier(true);
    setError(null);
    setSuccess(null);
    
    try {
      // D'abord, marquer le rendez-vous comme effectué
      const updateResponse = await appointmentsAPI.updateAppointment(
        appointmentForDossier._id || appointmentForDossier.id,
        { effectue: true }
      );

      if (!updateResponse.data.success) {
        setError('Erreur lors de la mise à jour du rendez-vous');
        setIsCreatingDossier(false);
        return;
      }

      // Si on doit créer un dossier
      if (createDossier) {
        const dossierData: any = {
          titre: dossierFormData.titre || `Dossier suite au rendez-vous du ${new Date(appointmentForDossier.date).toLocaleDateString('fr-FR')}`,
          description: dossierFormData.description,
          categorie: dossierFormData.categorie,
          type: dossierFormData.type || '',
          statut: 'recu',
          priorite: dossierFormData.priorite,
          rendezVousId: appointmentForDossier._id || appointmentForDossier.id
        };

        // Si le rendez-vous a un utilisateur, utiliser son ID
        if (appointmentForDossier.user?._id || appointmentForDossier.user) {
          dossierData.userId = appointmentForDossier.user._id || appointmentForDossier.user;
        } else {
          // Sinon, utiliser les informations du rendez-vous
          dossierData.clientNom = appointmentForDossier.nom || '';
          dossierData.clientPrenom = appointmentForDossier.prenom || '';
          dossierData.clientEmail = appointmentForDossier.email || '';
          dossierData.clientTelephone = appointmentForDossier.telephone || '';
        }

        const dossierResponse = await dossiersAPI.createDossier(dossierData);
        
        if (dossierResponse.data.success) {
          setSuccess('Rendez-vous marqué comme effectué et dossier créé avec succès !');
          setTimeout(() => {
            setShowCreateDossierModal(false);
            setAppointmentForDossier(null);
            setDossierFormData({
              titre: '',
              description: '',
              categorie: 'autre',
              type: '',
              priorite: 'normale'
            });
            loadAppointments();
          }, 2000);
        } else {
          setError(dossierResponse.data.message || 'Erreur lors de la création du dossier');
        }
      } else {
        // Juste marquer comme effectué sans créer de dossier
        setSuccess('Rendez-vous marqué comme effectué avec succès !');
        setTimeout(() => {
          setShowCreateDossierModal(false);
          setAppointmentForDossier(null);
          setDossierFormData({
            titre: '',
            description: '',
            categorie: 'autre',
            type: '',
            priorite: 'normale'
          });
          loadAppointments();
        }, 2000);
      }
    } catch (err: any) {
      console.error('❌ Erreur:', err);
      setError(err.response?.data?.message || 'Erreur lors de l\'opération');
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

  if (!session || ((session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <main className="w-full px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Gestion des Rendez-vous
            </h1>
            <p className="text-muted-foreground text-lg">Gérez tous les rendez-vous de votre cabinet</p>
          </div>
          <Button>Nouveau rendez-vous</Button>
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-foreground">Filtrer :</span>
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === 'all' 
                  ? 'bg-primary text-white shadow-md' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📋 Tous
            </button>
            <button
              onClick={() => setFilter('today')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === 'today' 
                  ? 'bg-primary text-white shadow-md' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📅 Aujourd'hui
            </button>
            <button
              onClick={() => setFilter('week')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === 'week' 
                  ? 'bg-primary text-white shadow-md' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📆 Cette semaine
            </button>
            <button
              onClick={() => setFilter('month')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === 'month' 
                  ? 'bg-primary text-white shadow-md' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              🗓️ Ce mois
            </button>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                showArchived 
                  ? 'bg-gray-600 text-white shadow-md' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {showArchived ? '📦 Afficher les actifs' : '📦 Afficher les archivés'}
            </button>
            <Button onClick={loadAppointments} variant="outline" className="ml-auto">
              🔄 Actualiser
            </Button>
          </div>
        </div>

        {/* Statistiques rapides */}
        {!isLoading && rendezVous.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <button
              type="button"
              onClick={() => setStatusFilter('en_attente')}
              className={`text-left bg-gradient-to-br from-yellow-50 to-yellow-100 border-l-4 border-yellow-500 rounded-lg p-4 shadow-sm transition-all ${
                statusFilter === 'en_attente'
                  ? 'ring-2 ring-yellow-500/60 shadow-md'
                  : 'hover:shadow-md hover:-translate-y-0.5'
              }`}
            >
              <p className="text-xs text-yellow-700 font-semibold mb-1 uppercase tracking-wide">En attente</p>
              <p className="text-2xl font-bold text-yellow-900">
                {rendezVous.filter((r: any) => r.statut === 'en_attente').length}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('confirme')}
              className={`text-left bg-gradient-to-br from-blue-50 to-blue-100 border-l-4 border-blue-500 rounded-lg p-4 shadow-sm transition-all ${
                statusFilter === 'confirme'
                  ? 'ring-2 ring-blue-500/60 shadow-md'
                  : 'hover:shadow-md hover:-translate-y-0.5'
              }`}
            >
              <p className="text-xs text-blue-700 font-semibold mb-1 uppercase tracking-wide">Confirmés</p>
              <p className="text-2xl font-bold text-blue-900">
                {rendezVous.filter((r: any) => r.statut === 'confirme' || r.statut === 'confirmé').length}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('annule')}
              className={`text-left bg-gradient-to-br from-red-50 to-red-100 border-l-4 border-red-500 rounded-lg p-4 shadow-sm transition-all ${
                statusFilter === 'annule'
                  ? 'ring-2 ring-red-500/60 shadow-md'
                  : 'hover:shadow-md hover:-translate-y-0.5'
              }`}
            >
              <p className="text-xs text-red-700 font-semibold mb-1 uppercase tracking-wide">Annulés</p>
              <p className="text-2xl font-bold text-red-900">
                {rendezVous.filter((r: any) => r.statut === 'annule' || r.statut === 'annulé').length}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('termine')}
              className={`text-left bg-gradient-to-br from-green-50 to-green-100 border-l-4 border-green-500 rounded-lg p-4 shadow-sm transition-all ${
                statusFilter === 'termine'
                  ? 'ring-2 ring-green-500/60 shadow-md'
                  : 'hover:shadow-md hover:-translate-y-0.5'
              }`}
            >
              <p className="text-xs text-green-700 font-semibold mb-1 uppercase tracking-wide">Terminés</p>
              <p className="text-2xl font-bold text-green-900">
                {rendezVous.filter((r: any) => r.statut === 'termine' || r.statut === 'terminé').length}
              </p>
            </button>
          </div>
        )}

        {/* Indicateur de filtre de statut actif */}
        {!isLoading && rendezVous.length > 0 && (
          <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground">
            <div>
              {statusFilter === 'all' ? (
                <span>Tous les statuts de rendez-vous sont affichés.</span>
              ) : (
                <span>
                  Filtre statut :{' '}
                  <span className="font-semibold text-primary">
                    {statusFilter === 'en_attente' && 'En attente'}
                    {statusFilter === 'confirme' && 'Confirmés'}
                    {statusFilter === 'annule' && 'Annulés'}
                    {statusFilter === 'termine' && 'Terminés'}
                  </span>
                </span>
              )}
            </div>
            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="px-2 py-1 rounded-md border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Réinitialiser le filtre
              </button>
            )}
          </div>
        )}

        {/* Liste des rendez-vous */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Chargement des rendez-vous...</p>
            </div>
          ) : rendezVous.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">📅</span>
              </div>
              <p className="text-muted-foreground text-lg font-medium mb-2">
                {filter === 'all' ? 'Aucun rendez-vous programmé' : `Aucun rendez-vous pour cette période`}
              </p>
            </div>
          ) : (() => {
            const filteredByStatus = rendezVous.filter((rdv: any) => {
              const statut = rdv.statut || 'en_attente';
              if (statusFilter === 'all') return true;
              if (statusFilter === 'en_attente') return statut === 'en_attente';
              if (statusFilter === 'confirme') return statut === 'confirme' || statut === 'confirmé';
              if (statusFilter === 'annule') return statut === 'annule' || statut === 'annulé';
              if (statusFilter === 'termine') return statut === 'termine' || statut === 'terminé';
              return true;
            });

            if (filteredByStatus.length === 0) {
              return (
                <div className="text-center py-16">
                  <p className="text-muted-foreground text-sm mb-3">
                    Aucun rendez-vous ne correspond au filtre de statut sélectionné.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white hover:bg-primary/90"
                  >
                    Réinitialiser le filtre de statut
                  </button>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredByStatus.map((rdv) => {
                const clientName = `${rdv.prenom || ''} ${rdv.nom || ''}`.trim() || 'Client';
                const dateObj = rdv.date ? new Date(rdv.date) : null;
                const formattedDate = dateObj ? dateObj.toLocaleDateString('fr-FR', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                }) : rdv.date;
                const formattedTime = rdv.heure ? rdv.heure.substring(0, 5) : '-';
                
                // Calculer si le rendez-vous est passé en tenant compte de la date ET de l'heure
                let isPast = false;
                if (dateObj && rdv.heure) {
                  // Créer une date complète avec l'heure du rendez-vous
                  const appointmentDateTime = new Date(dateObj);
                  const [hours, minutes] = rdv.heure.split(':').map(Number);
                  appointmentDateTime.setHours(hours || 0, minutes || 0, 0, 0);
                  
                  // Comparer avec la date/heure actuelle
                  const now = new Date();
                  isPast = appointmentDateTime < now;
                } else if (dateObj) {
                  // Si pas d'heure, comparer seulement la date (fin de journée)
                  const appointmentDateEnd = new Date(dateObj);
                  appointmentDateEnd.setHours(23, 59, 59, 999);
                  isPast = appointmentDateEnd < new Date();
                }
                const statut = rdv.statut || 'en_attente';
                
                const getStatutColor = (statut: string) => {
                  if (statut === 'confirme' || statut === 'confirmé') return 'bg-green-100 text-green-800';
                  if (statut === 'annule' || statut === 'annulé') return 'bg-red-100 text-red-800';
                  if (statut === 'termine' || statut === 'terminé') return 'bg-gray-100 text-gray-800';
                  return 'bg-yellow-100 text-yellow-800';
                };

                const getStatutLabel = (statut: string) => {
                  if (statut === 'confirme' || statut === 'confirmé') return 'Confirmé';
                  if (statut === 'annule' || statut === 'annulé') return 'Annulé';
                  if (statut === 'termine' || statut === 'terminé') return 'Terminé';
                  return 'En attente';
                };
                
                // Déterminer le style de la bordure gauche selon le statut (comme pour les dossiers)
                const getCardBorderStyle = () => {
                  if (rdv.archived) {
                    return 'border-l-4 border-l-gray-500 border-t border-r border-b border-gray-200 opacity-75';
                  }
                  if (statut === 'annule' || statut === 'annulé') {
                    return 'border-l-4 border-l-red-500 border-t border-r border-b border-gray-200';
                  }
                  if (statut === 'termine' || statut === 'terminé' || rdv.effectue) {
                    return 'border-l-4 border-l-green-500 border-t border-r border-b border-gray-200';
                  }
                  if (isPast && !rdv.effectue && statut !== 'annule' && statut !== 'annulé') {
                    return 'border-l-4 border-l-red-500 border-t border-r border-b border-gray-200';
                  }
                  if (statut === 'confirme' || statut === 'confirmé') {
                    return 'border-l-4 border-l-blue-500 border-t border-r border-b border-gray-200';
                  }
                  return 'border-l-4 border-l-yellow-500 border-t border-r border-b border-gray-200';
                };
                
                return (
                  <div
                    key={rdv._id || rdv.id}
                    className={`border rounded-xl p-5 hover:shadow-xl transition-all duration-200 bg-white ${getCardBorderStyle()}`}
                  >
                    {/* En-tête de la carte */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="font-bold text-base text-foreground mb-1 line-clamp-2 leading-tight">
                          {rdv.motif || 'Rendez-vous'}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                          {clientName}
                        </p>
                        {rdv.email && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {rdv.email}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${getStatutColor(statut)}`}>
                          {getStatutLabel(statut)}
                        </span>
                        {rdv.archived && (
                          <span className="px-2 py-1 rounded-md text-xs font-semibold bg-gray-100 text-gray-800">
                            📦 Archivé
                          </span>
                        )}
                        {isPast && !rdv.effectue && statut !== 'annule' && statut !== 'annulé' && !rdv.archived && (
                          <span className="px-2 py-1 rounded-md text-xs font-semibold bg-red-100 text-red-800">
                            ⚠️ Dépassé
                          </span>
                        )}
                        {rdv.effectue ? (
                          <span className="px-2 py-1 rounded-md text-xs font-semibold bg-green-100 text-green-800">
                            ✅ Effectué
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Informations du rendez-vous */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">📅</span>
                        <span className="font-medium text-foreground">
                          {dateObj ? dateObj.toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          }) : formattedDate}
                        </span>
                      </div>

                      {rdv.heure && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">🕐</span>
                          <span className="font-medium text-foreground">
                            {formattedTime}
                          </span>
                        </div>
                      )}

                      {rdv.telephone && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">📞</span>
                          <span className="text-foreground">{rdv.telephone}</span>
                        </div>
                      )}

                      {rdv.description && (
                        <div className="flex items-start gap-2 text-xs">
                          <span className="text-muted-foreground">📝</span>
                          <p className="text-muted-foreground line-clamp-2">
                            {rdv.description}
                          </p>
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
                          {/* Case à cocher "Effectué" */}
                          {!rdv.effectue && statut !== 'annule' && statut !== 'annulé' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8 border-green-300 text-green-600 hover:bg-green-50 hover:border-green-400"
                              onClick={async () => {
                                // Si on coche "effectué", proposer d'ouvrir un dossier
                                setAppointmentForDossier(rdv);
                                setDossierFormData({
                                  titre: `Dossier suite au rendez-vous du ${new Date(rdv.date).toLocaleDateString('fr-FR')}`,
                                  description: `Dossier créé suite au rendez-vous du ${new Date(rdv.date).toLocaleDateString('fr-FR')} à ${rdv.heure}.\n\nMotif: ${rdv.motif || 'N/A'}\n${rdv.description ? `Description: ${rdv.description}` : ''}`,
                                  categorie: 'autre',
                                  type: '',
                                  priorite: 'normale'
                                });
                                setShowCreateDossierModal(true);
                              }}
                            >
                              ✅ Marquer effectué
                            </Button>
                          )}
                          {statut === 'en_attente' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-8 border-green-300 text-green-600 hover:bg-green-50 hover:border-green-400"
                                onClick={async () => {
                                  try {
                                    const response = await appointmentsAPI.updateAppointment(rdv._id || rdv.id, { statut: 'confirme' });
                                    if (response.data.success) {
                                      await loadAppointments();
                                    }
                                  } catch (err: any) {
                                    console.error('Erreur lors de l\'acceptation:', err);
                                    setError(err.response?.data?.message || 'Erreur lors de l\'acceptation');
                                  }
                                }}
                              >
                                ✓ Accepter
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-8 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
                                onClick={async () => {
                                  if (confirm('Êtes-vous sûr de vouloir refuser ce rendez-vous ?')) {
                                    try {
                                      const response = await appointmentsAPI.updateAppointment(rdv._id || rdv.id, { statut: 'annule' });
                                      if (response.data.success) {
                                        await loadAppointments();
                                      }
                                    } catch (err: any) {
                                      console.error('Erreur lors du refus:', err);
                                      setError(err.response?.data?.message || 'Erreur lors du refus');
                                    }
                                  }
                                }}
                              >
                                ✗ Refuser
                              </Button>
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-8"
                            onClick={() => {
                              const dateObj = rdv.date ? new Date(rdv.date) : new Date();
                              const formattedDate = dateObj.toISOString().split('T')[0];
                              
                              setEditFormData({
                                statut: rdv.statut || 'en_attente',
                                date: formattedDate,
                                heure: rdv.heure || '',
                                motif: rdv.motif || '',
                                description: rdv.description || '',
                                notes: rdv.notes || ''
                              });
                              setEditingRdv(rdv);
                            }}
                          >
                            ✏️ Modifier
                          </Button>
                          {!rdv.archived ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8 border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400"
                              onClick={async () => {
                                if (confirm('Êtes-vous sûr de vouloir archiver ce rendez-vous ?')) {
                                  try {
                                    const response = await appointmentsAPI.archiveAppointment(rdv._id || rdv.id, true);
                                    if (response.data.success) {
                                      await loadAppointments();
                                    }
                                  } catch (err: any) {
                                    console.error('Erreur lors de l\'archivage:', err);
                                    setError(err.response?.data?.message || 'Erreur lors de l\'archivage');
                                  }
                                }
                              }}
                            >
                              📦 Archiver
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8 border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400"
                              onClick={async () => {
                                try {
                                  const response = await appointmentsAPI.archiveAppointment(rdv._id || rdv.id, false);
                                  if (response.data.success) {
                                    await loadAppointments();
                                  }
                                } catch (err: any) {
                                  console.error('Erreur lors du désarchivage:', err);
                                  setError(err.response?.data?.message || 'Erreur lors du désarchivage');
                                }
                              }}
                            >
                              📂 Désarchiver
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            );
          })()}

          {!isLoading && rendezVous.length > 0 && (
            <div className="mt-6 pt-4 border-t flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{rendezVous.length}</span> rendez-vous{rendezVous.length > 1 ? '' : ''}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Modal de modification */}
      {editingRdv && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Modifier le rendez-vous</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Client: <strong>{editingRdv.prenom} {editingRdv.nom}</strong> ({editingRdv.email})
            </p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              setIsSubmitting(true);
              setError(null);
              
              try {
                const updateData: any = {};
                if (editFormData.statut) updateData.statut = editFormData.statut;
                if (editFormData.date) updateData.date = editFormData.date;
                if (editFormData.heure) updateData.heure = editFormData.heure;
                if (editFormData.motif) updateData.motif = editFormData.motif;
                if (editFormData.description !== undefined) updateData.description = editFormData.description;
                if (editFormData.notes !== undefined) updateData.notes = editFormData.notes;

                const response = await appointmentsAPI.updateAppointment(editingRdv._id || editingRdv.id, updateData);
                
                if (response.data.success) {
                  setEditingRdv(null);
                  await loadAppointments();
                } else {
                  setError(response.data.message || 'Erreur lors de la modification');
                }
              } catch (err: any) {
                console.error('Erreur lors de la modification:', err);
                setError(err.response?.data?.message || 'Erreur lors de la modification du rendez-vous');
              } finally {
                setIsSubmitting(false);
              }
            }} className="space-y-4">
              {/* Statut */}
              <div>
                <Label htmlFor="editStatut">Statut</Label>
                <select
                  id="editStatut"
                  value={editFormData.statut}
                  onChange={(e) => setEditFormData({ ...editFormData, statut: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                >
                  <option value="en_attente">En attente</option>
                  <option value="confirme">Confirmé</option>
                  <option value="annule">Annulé</option>
                  <option value="termine">Terminé</option>
                </select>
              </div>

              {/* Date et Heure */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editDate">Date</Label>
                  <Input
                    id="editDate"
                    type="date"
                    value={editFormData.date}
                    onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="editHeure">Heure</Label>
                  <Input
                    id="editHeure"
                    type="time"
                    value={editFormData.heure}
                    onChange={(e) => setEditFormData({ ...editFormData, heure: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Motif */}
              <div>
                <Label htmlFor="editMotif">Motif</Label>
                <select
                  id="editMotif"
                  value={editFormData.motif}
                  onChange={(e) => setEditFormData({ ...editFormData, motif: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                >
                  <option value="">Sélectionner un motif</option>
                  <option value="Consultation">Consultation</option>
                  <option value="Dossier administratif">Dossier administratif</option>
                  <option value="Suivi de dossier">Suivi de dossier</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="editDescription">Description</Label>
                <Textarea
                  id="editDescription"
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  placeholder="Description du rendez-vous (max 500 caractères)"
                  maxLength={500}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {editFormData.description.length}/500 caractères
                </p>
              </div>

              {/* Notes administratives */}
              <div>
                <Label htmlFor="editNotes">Notes administratives</Label>
                <Textarea
                  id="editNotes"
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  placeholder="Notes internes (non visibles par le client)"
                  className="mt-1"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingRdv(null);
                    setError(null);
                  }}
                  disabled={isSubmitting}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de création de dossier depuis un rendez-vous */}
      {showCreateDossierModal && appointmentForDossier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={() => {
          if (!isCreatingDossier) {
            setShowCreateDossierModal(false);
            setAppointmentForDossier(null);
          }
        }}>
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-4 p-6 animate-in fade-in zoom-in duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Rendez-vous effectué</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Souhaitez-vous ouvrir un dossier pour ce client ?
                </p>
              </div>
              <button
                onClick={() => {
                  if (!isCreatingDossier) {
                    setShowCreateDossierModal(false);
                    setAppointmentForDossier(null);
                  }
                }}
                disabled={isCreatingDossier}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-600">{success}</p>
              </div>
            )}

            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-sm mb-2">Informations du client :</h3>
              <div className="text-sm space-y-1">
                <p><strong>Nom :</strong> {appointmentForDossier.prenom || ''} {appointmentForDossier.nom || ''}</p>
                <p><strong>Email :</strong> {appointmentForDossier.email || 'Non renseigné'}</p>
                <p><strong>Téléphone :</strong> {appointmentForDossier.telephone || 'Non renseigné'}</p>
                <p><strong>Date du rendez-vous :</strong> {new Date(appointmentForDossier.date).toLocaleDateString('fr-FR')} à {appointmentForDossier.heure}</p>
                <p><strong>Motif :</strong> {appointmentForDossier.motif || 'Non renseigné'}</p>
              </div>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              handleCreateDossierFromAppointment(true);
            }} className="space-y-4">
              <div>
                <Label htmlFor="dossier-titre">Titre du dossier *</Label>
                <Input
                  id="dossier-titre"
                  type="text"
                  value={dossierFormData.titre}
                  onChange={(e) => setDossierFormData({ ...dossierFormData, titre: e.target.value })}
                  required
                  disabled={isCreatingDossier}
                />
              </div>

              <div>
                <Label htmlFor="dossier-description">Description</Label>
                <Textarea
                  id="dossier-description"
                  value={dossierFormData.description}
                  onChange={(e) => setDossierFormData({ ...dossierFormData, description: e.target.value })}
                  rows={4}
                  disabled={isCreatingDossier}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dossier-categorie">Catégorie *</Label>
                  <select
                    id="dossier-categorie"
                    value={dossierFormData.categorie}
                    onChange={(e) => {
                      setDossierFormData({ 
                        ...dossierFormData, 
                        categorie: e.target.value,
                        type: '' // Réinitialiser le type quand on change de catégorie
                      });
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                    disabled={isCreatingDossier}
                  >
                    {Object.entries(categories).map(([key, cat]) => (
                      <option key={key} value={key}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="dossier-type">Type *</Label>
                  <select
                    id="dossier-type"
                    value={dossierFormData.type}
                    onChange={(e) => setDossierFormData({ ...dossierFormData, type: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                    disabled={isCreatingDossier || !dossierFormData.categorie}
                  >
                    <option value="">Sélectionnez un type</option>
                    {categories[dossierFormData.categorie as keyof typeof categories]?.types.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="dossier-priorite">Priorité</Label>
                <select
                  id="dossier-priorite"
                  value={dossierFormData.priorite}
                  onChange={(e) => setDossierFormData({ ...dossierFormData, priorite: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={isCreatingDossier}
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
                  onClick={() => handleCreateDossierFromAppointment(false)}
                  disabled={isCreatingDossier}
                >
                  Marquer effectué sans dossier
                </Button>
                <Button
                  type="submit"
                  disabled={isCreatingDossier || !dossierFormData.titre || !dossierFormData.categorie || !dossierFormData.type}
                >
                  {isCreatingDossier ? 'Création...' : 'Créer le dossier'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


