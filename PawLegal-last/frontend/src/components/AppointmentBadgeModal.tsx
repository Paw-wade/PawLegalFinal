'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { appointmentsAPI, dossiersAPI } from '@/lib/api';

interface AppointmentBadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: any;
  isAdmin?: boolean;
  onUpdate?: () => void;
}

export function AppointmentBadgeModal({
  isOpen,
  onClose,
  appointment,
  isAdmin = false,
  onUpdate
}: AppointmentBadgeModalProps) {
  const { data: session } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreateDossierModal, setShowCreateDossierModal] = useState(false);
  const [dossierFormData, setDossierFormData] = useState({
    titre: '',
    categorie: '',
    type: '',
    statut: 'recu',
    priorite: 'normale',
    description: ''
  });
  const [isCreatingDossier, setIsCreatingDossier] = useState(false);

  // État pour la modification du statut (admin uniquement)
  const [newStatus, setNewStatus] = useState<string>('');

  useEffect(() => {
    if (appointment) {
      setNewStatus(appointment.statut || 'en_attente');
    }
  }, [appointment]);

  if (!isOpen || !appointment) return null;

  const formatDate = (date: string | Date) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (time: string) => {
    if (!time) return 'N/A';
    return time.substring(0, 5);
  };

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case 'confirme':
        return 'bg-blue-100 text-blue-800';
      case 'termine':
        return 'bg-green-100 text-green-800';
      case 'annule':
        return 'bg-red-100 text-red-800';
      case 'en_attente':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatutLabel = (statut: string) => {
    const labels: { [key: string]: string } = {
      'en_attente': 'En attente',
      'confirme': 'Confirmé',
      'termine': 'Terminé',
      'annule': 'Annulé'
    };
    return labels[statut] || statut;
  };

  const handleCancel = async () => {
    if (!confirm('Êtes-vous sûr de vouloir annuler ce rendez-vous ?')) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await appointmentsAPI.cancelAppointment(appointment._id || appointment.id);
      if (response.data.success) {
        setSuccess('Rendez-vous annulé avec succès');
        setTimeout(() => {
          onUpdate?.();
          onClose();
        }, 1500);
      } else {
        setError(response.data.message || 'Erreur lors de l\'annulation');
      }
    } catch (err: any) {
      console.error('Erreur lors de l\'annulation:', err);
      setError(err.response?.data?.message || 'Erreur lors de l\'annulation du rendez-vous');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!newStatus || newStatus === appointment.statut) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await appointmentsAPI.updateAppointment(appointment._id || appointment.id, {
        statut: newStatus,
        effectue: newStatus === 'termine'
      });

      if (response.data.success) {
        setSuccess('Statut mis à jour avec succès');
        
        // Si le statut est "termine" et que l'admin n'a pas encore créé de dossier, proposer
        if (newStatus === 'termine' && !appointment.dossierId) {
          setTimeout(() => {
            setShowCreateDossierModal(true);
          }, 1000);
        } else {
          setTimeout(() => {
            onUpdate?.();
            onClose();
          }, 1500);
        }
      } else {
        setError(response.data.message || 'Erreur lors de la mise à jour');
      }
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour:', err);
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour du statut');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDossier = async () => {
    if (!dossierFormData.titre.trim()) {
      setError('Le titre du dossier est requis');
      return;
    }

    setIsCreatingDossier(true);
    setError(null);

    try {
      const userId = appointment.user?._id || appointment.user || (session?.user as any)?.id;
      
      const dossierData = {
        userId: userId,
        clientNom: appointment.nom || '',
        clientPrenom: appointment.prenom || '',
        clientEmail: appointment.email || '',
        clientTelephone: appointment.telephone || '',
        titre: dossierFormData.titre,
        categorie: dossierFormData.categorie || 'autre',
        type: dossierFormData.type || 'autre',
        statut: dossierFormData.statut,
        priorite: dossierFormData.priorite,
        description: dossierFormData.description || `Dossier créé à l'issue du rendez-vous du ${formatDate(appointment.date)} à ${formatTime(appointment.heure)}`,
        rendezVousId: appointment._id || appointment.id
      };

      const response = await dossiersAPI.createDossier(dossierData);

      if (response.data.success) {
        setSuccess('Dossier créé avec succès');
        setTimeout(() => {
          setShowCreateDossierModal(false);
          onUpdate?.();
          onClose();
        }, 1500);
      } else {
        setError(response.data.message || 'Erreur lors de la création du dossier');
      }
    } catch (err: any) {
      console.error('Erreur lors de la création du dossier:', err);
      setError(err.response?.data?.message || 'Erreur lors de la création du dossier');
    } finally {
      setIsCreatingDossier(false);
    }
  };

  const canCancel = appointment.statut !== 'annule' && appointment.statut !== 'termine';
  const appointmentDate = appointment.date ? new Date(appointment.date) : null;
  const isPast = appointmentDate ? appointmentDate < new Date() : false;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
          {/* En-tête */}
          <div className="bg-gradient-to-r from-primary to-primary/70 p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📅</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Détails du rendez-vous</h2>
                  <p className="text-primary-100 text-sm">
                    {appointment.nom && appointment.prenom 
                      ? `${appointment.prenom} ${appointment.nom}`
                      : 'Client'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <span className="text-xl">×</span>
              </button>
            </div>
          </div>

          {/* Contenu */}
          <div className="p-6 overflow-y-auto flex-1">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {success}
              </div>
            )}

            <div className="space-y-4">
              {/* Statut */}
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-2">Statut</label>
                {isAdmin ? (
                  <div className="flex items-center gap-3">
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-primary focus:border-primary"
                      disabled={isLoading}
                    >
                      <option value="en_attente">En attente</option>
                      <option value="confirme">Confirmé</option>
                      <option value="termine">Terminé</option>
                      <option value="annule">Annulé</option>
                    </select>
                    {newStatus !== appointment.statut && (
                      <button
                        onClick={handleUpdateStatus}
                        disabled={isLoading}
                        className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors text-sm font-semibold disabled:opacity-50"
                      >
                        {isLoading ? 'Mise à jour...' : 'Mettre à jour'}
                      </button>
                    )}
                  </div>
                ) : (
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getStatutColor(appointment.statut)}`}>
                    {getStatutLabel(appointment.statut)}
                  </span>
                )}
              </div>

              {/* Date et heure */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-2">Date</label>
                  <p className="text-foreground font-medium">{formatDate(appointment.date)}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-2">Heure</label>
                  <p className="text-foreground font-medium">⏰ {formatTime(appointment.heure)}</p>
                </div>
              </div>

              {/* Informations client */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-2">Nom</label>
                  <p className="text-foreground">{appointment.nom || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-2">Prénom</label>
                  <p className="text-foreground">{appointment.prenom || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-2">Email</label>
                  <p className="text-foreground">{appointment.email || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-2">Téléphone</label>
                  <p className="text-foreground">{appointment.telephone || 'N/A'}</p>
                </div>
              </div>

              {/* Motif */}
              {appointment.motif && (
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-2">Motif</label>
                  <p className="text-foreground">{appointment.motif}</p>
                </div>
              )}

              {/* Description */}
              {appointment.description && (
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-2">Description</label>
                  <p className="text-foreground whitespace-pre-wrap bg-gray-50 rounded-md p-3">{appointment.description}</p>
                </div>
              )}

              {/* Notes (admin uniquement) */}
              {isAdmin && appointment.notes && (
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-2">Notes internes</label>
                  <p className="text-foreground whitespace-pre-wrap bg-blue-50 rounded-md p-3 border border-blue-200">{appointment.notes}</p>
                </div>
              )}

              {/* Dossier lié */}
              {appointment.dossierId && (
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-2">Dossier lié</label>
                  <a
                    href={`/admin/dossiers/${appointment.dossierId}`}
                    className="text-primary hover:underline font-medium"
                  >
                    Voir le dossier →
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors text-sm font-semibold"
            >
              Fermer
            </button>
            <div className="flex gap-3">
              {canCancel && (
                <button
                  onClick={handleCancel}
                  disabled={isLoading}
                  className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm font-semibold disabled:opacity-50"
                >
                  {isLoading ? 'Annulation...' : 'Annuler le rendez-vous'}
                </button>
              )}
              {isAdmin && appointment.statut === 'termine' && !appointment.dossierId && (
                <button
                  onClick={() => setShowCreateDossierModal(true)}
                  className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors text-sm font-semibold"
                >
                  📁 Créer un dossier
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de création de dossier */}
      {showCreateDossierModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setShowCreateDossierModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold">Créer un dossier</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Créer un dossier à l'issue de ce rendez-vous
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Titre du dossier *</label>
                <input
                  type="text"
                  value={dossierFormData.titre}
                  onChange={(e) => setDossierFormData({ ...dossierFormData, titre: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="Ex: Demande de titre de séjour"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Catégorie</label>
                  <select
                    value={dossierFormData.categorie}
                    onChange={(e) => setDossierFormData({ ...dossierFormData, categorie: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="autre">Autre</option>
                    <option value="titre_sejour">Titre de séjour</option>
                    <option value="visa">Visa</option>
                    <option value="nationalite">Nationalité</option>
                    <option value="regroupement_familial">Regroupement familial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    value={dossierFormData.type}
                    onChange={(e) => setDossierFormData({ ...dossierFormData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="autre">Autre</option>
                    <option value="premiere_demande">Première demande</option>
                    <option value="renouvellement">Renouvellement</option>
                    <option value="changement_statut">Changement de statut</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={dossierFormData.description}
                  onChange={(e) => setDossierFormData({ ...dossierFormData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[80px]"
                  placeholder="Description du dossier..."
                />
              </div>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateDossierModal(false);
                  setDossierFormData({
                    titre: '',
                    categorie: '',
                    type: '',
                    statut: 'recu',
                    priorite: 'normale',
                    description: ''
                  });
                  setError(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors text-sm font-semibold"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateDossier}
                disabled={isCreatingDossier || !dossierFormData.titre.trim()}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors text-sm font-semibold disabled:opacity-50"
              >
                {isCreatingDossier ? 'Création...' : 'Créer le dossier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

