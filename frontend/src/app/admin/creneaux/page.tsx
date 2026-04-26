'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { creneauxAPI } from '@/lib/api';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-red-500 text-white hover:bg-red-600',
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
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium leading-none mb-2 block ${className}`}>
      {children}
    </label>
  );
}

export default function AdminCreneauxPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [creneaux, setCreneaux] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedHeures, setSelectedHeures] = useState<string[]>([]);
  const [selectedDatesToClose, setSelectedDatesToClose] = useState<string[]>([]);
  const [motifFermeture, setMotifFermeture] = useState('');

  // Heures disponibles par défaut
  const heuresDisponibles = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'
  ];

  // Helper pour convertir une date en chaîne YYYY-MM-DD de manière sécurisée
  const formatDateToString = (date: string | Date): string | null => {
    if (!date) return null;
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return null;
      return dateObj.toISOString().split('T')[0];
    } catch {
      return null;
    }
  };

  const getWeekDates = (baseDate: string) => {
    const ref = new Date(baseDate);
    if (isNaN(ref.getTime())) return [];
    const day = ref.getDay(); // 0 = dimanche
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(ref);
    monday.setDate(ref.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, index) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + index);
      return d.toISOString().split('T')[0];
    });
  };

  const weekDates = getWeekDates(selectedDate);

  const formatDayLabel = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit'
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
        loadCreneaux();
      }
    }
  }, [session, status, router, selectedDate]);

  const loadCreneaux = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('🔄 Chargement des créneaux fermés pour:', selectedDate);
      
      // Valider la date avant de faire la requête
      if (!selectedDate) {
        setError('Veuillez sélectionner une date');
        setIsLoading(false);
        return;
      }
      
      // Charger UNIQUEMENT les créneaux fermés pour la date sélectionnée
      const response = await creneauxAPI.getAllCreneaux({ date: selectedDate, ferme: true });
      
      console.log('✅ Réponse chargement créneaux:', {
        success: response.data.success,
        count: response.data.count,
        creneauxLength: response.data.creneaux?.length || 0
      });
      
      if (response.data.success) {
        const creneauxRecus = response.data.creneaux || [];
        console.log('📋 Créneaux fermés reçus:', creneauxRecus.length);
        
        if (creneauxRecus.length > 0) {
          console.log('📋 Exemples de créneaux:', creneauxRecus.slice(0, 3).map((c: any) => ({
            id: c._id || c.id,
            date: c.date ? new Date(c.date).toISOString().split('T')[0] : 'N/A',
            heure: c.heure,
            ferme: c.ferme,
            motif: c.motifFermeture
          })));
        }
        
        // Filtrer pour s'assurer que la date correspond (double vérification)
        // Helper pour convertir une date en chaîne YYYY-MM-DD de manière sécurisée
        const formatDateToStringLocal = (date: string | Date): string | null => {
          if (!date) return null;
          try {
            const dateObj = typeof date === 'string' ? new Date(date) : date;
            if (isNaN(dateObj.getTime())) return null;
            return dateObj.toISOString().split('T')[0];
          } catch {
            return null;
          }
        };
        
        const creneauxFermes = creneauxRecus.filter((c: any) => {
          // Vérifier que la date correspond
          if (!c.date) {
            console.log('⚠️ Créneau sans date ignoré:', c);
            return false;
          }
          
          try {
            if (!selectedDate || isNaN(new Date(selectedDate).getTime())) {
              return false;
            }
            const creneauDate = formatDateToStringLocal(c.date);
            const selectedDateStr = formatDateToStringLocal(selectedDate);
            
            if (!creneauDate || !selectedDateStr) {
              console.log(`⚠️ Créneau ${c.heure} ignoré: date invalide (${creneauDate} vs ${selectedDateStr})`);
              return false;
            }
            
            if (creneauDate !== selectedDateStr) {
              console.log(`⚠️ Créneau ${c.heure} ignoré: date ne correspond pas (${creneauDate} vs ${selectedDateStr})`);
              return false;
            }
            
            // Vérifier que le créneau est bien fermé
            const isFerme = c.ferme === true || c.ferme === 'true' || String(c.ferme) === 'true';
            if (!isFerme) {
              console.log(`⚠️ Créneau ${c.heure} ignoré: n'est pas marqué comme fermé (ferme=${c.ferme})`);
              return false;
            }
            
            console.log('✅ Créneau fermé accepté:', {
              heure: c.heure,
              date: creneauDate,
              ferme: c.ferme,
              id: c._id || c.id
            });
            
            return true;
          } catch (err) {
            console.error('Erreur lors du filtrage:', err, c);
            return false;
          }
        });
        
        console.log('📋 Créneaux fermés filtrés:', creneauxFermes.length);
        if (creneauxFermes.length > 0) {
          console.log('📋 Détails des créneaux filtrés:', creneauxFermes.map((c: any) => ({
            id: c._id || c.id,
            heure: c.heure,
            date: formatDateToStringLocal(c.date),
            ferme: c.ferme
          })));
        }
        
        setCreneaux(creneauxFermes);
      } else {
        const errorMessage = response.data.message || 'Erreur lors du chargement des créneaux';
        console.error('❌ Réponse non réussie:', errorMessage);
        setError(errorMessage);
      }
    } catch (err: any) {
      console.error('❌ Erreur lors du chargement des créneaux:', err);
      console.error('Détails complets:', {
        message: err.message,
        name: err.name,
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText,
        config: err.config
      });
      
      // Gérer différents types d'erreurs
      let errorMessage = 'Erreur lors du chargement des créneaux';
      
      if (err.response) {
        // Erreur de réponse du serveur
        errorMessage = err.response.data?.message || 
                      err.response.data?.error || 
                      `Erreur ${err.response.status}: ${err.response.statusText}`;
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

  const handleCloseSlots = async () => {
    if (selectedDatesToClose.length === 0) {
      setError('Veuillez sélectionner au moins un jour de la semaine');
      return;
    }
    if (selectedHeures.length === 0) {
      setError('Veuillez sélectionner au moins un créneau à fermer');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      console.log('Fermeture des créneaux:', {
        dates: selectedDatesToClose,
        heures: selectedHeures,
        motifFermeture: motifFermeture.trim() || undefined
      });
      
      const response = await creneauxAPI.closeSlots({
        dates: selectedDatesToClose,
        heures: selectedHeures,
        motifFermeture: motifFermeture.trim() || undefined
      });
      
      console.log('Réponse de fermeture:', response.data);
      
      if (response.data.success) {
        // Afficher un message de succès temporaire
        const successMessage = response.data.message || `${selectedHeures.length * selectedDatesToClose.length} créneau(x) fermé(s) avec succès`;
        setError(null);
        
        // Fermer le modal et réinitialiser d'abord
        setShowCloseModal(false);
        setSelectedHeures([]);
        setSelectedDatesToClose([]);
        setMotifFermeture('');
        
        // Recharger les créneaux immédiatement
        await loadCreneaux();
        
        // Afficher un message de succès
        alert(successMessage);
      } else {
        setError(response.data.message || 'Erreur lors de la fermeture des créneaux');
      }
    } catch (err: any) {
      console.error('Erreur lors de la fermeture des créneaux:', err);
      console.error('Détails de l\'erreur:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });
      setError(
        err.response?.data?.message || 
        err.response?.data?.errors?.map((e: any) => e.msg).join(', ') ||
        err.message || 
        'Erreur lors de la fermeture des créneaux'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReopenSlot = async (creneauId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir rouvrir ce créneau ?')) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await creneauxAPI.reopenSlot(creneauId);
      if (response.data.success) {
        // Recharger les créneaux pour mettre à jour l'affichage
        await loadCreneaux();
        // Afficher un message de succès
        const successMessage = response.data.message || 'Créneau rouvert avec succès';
        alert(successMessage);
      } else {
        setError(response.data.message || 'Erreur lors de la réouverture du créneau');
      }
    } catch (err: any) {
      console.error('Erreur lors de la réouverture du créneau:', err);
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.error ||
                          'Erreur lors de la réouverture du créneau';
      setError(errorMessage);
      alert(`Erreur: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Les créneaux sont déjà filtrés pour être fermés dans loadCreneaux
  // Puisque loadCreneaux charge déjà uniquement les créneaux fermés pour la date sélectionnée,
  // on peut utiliser directement creneaux, mais on fait une vérification supplémentaire pour être sûr
  const creneauxFermesPourDate = creneaux.filter(c => {
    // Vérifier que le créneau a une date
    if (!c.date) {
      return false;
    }
    
    // Vérifier que le créneau est bien fermé
    const isFerme = c.ferme === true || c.ferme === 'true' || String(c.ferme) === 'true';
    if (!isFerme) {
      return false;
    }
    
    // Vérifier que la date correspond (double vérification)
    try {
      const creneauDateStr = formatDateToString(c.date);
      const selectedDateStr = formatDateToString(selectedDate);
      
      if (!creneauDateStr || !selectedDateStr) {
        return false;
      }
      
      const matchesDate = creneauDateStr === selectedDateStr;
      
      if (matchesDate) {
        console.log('✅ Créneau fermé affiché:', {
          heure: c.heure,
          date: creneauDateStr,
          ferme: c.ferme,
          id: c._id || c.id
        });
      }
      
      return matchesDate;
    } catch (err) {
      console.error('Erreur lors du filtrage du créneau:', err, c);
      return false;
    }
  });

  // Pour le modal de fermeture, on charge les créneaux de toute la semaine
  const [allCreneauxForWeek, setAllCreneauxForWeek] = useState<Record<string, any[]>>({});

  useEffect(() => {
    if (!showCloseModal || weekDates.length === 0) return;

    const loadWeekCreneaux = async () => {
      try {
        const results = await Promise.all(
          weekDates.map(async (date) => {
            const response = await creneauxAPI.getAllCreneaux({ date });
            return {
              date,
              creneaux: response.data.success ? (response.data.creneaux || []) : []
            };
          })
        );

        const mapped = results.reduce((acc, item) => {
          acc[item.date] = item.creneaux;
          return acc;
        }, {} as Record<string, any[]>);
        setAllCreneauxForWeek(mapped);
      } catch (err) {
        console.error('Erreur lors du chargement des créneaux hebdomadaires:', err);
      }
    };

    loadWeekCreneaux();
  }, [showCloseModal, selectedDate]);

  const getHeuresFermeesForDate = (date: string) => {
    const dayCreneaux = allCreneauxForWeek[date] || [];
    return dayCreneaux
      .filter((c) => {
        if (!c.date) return false;
        const creneauDate = formatDateToString(c.date);
        if (!creneauDate) return false;
        return creneauDate === date && (c.ferme === true || c.ferme === 'true');
      })
      .map((c) => c.heure);
  };
  
  console.log('📊 Créneaux fermés pour la date:', {
    selectedDate,
    totalCreneauxCharges: creneaux.length,
    creneauxFermes: creneauxFermesPourDate.length,
    heuresFermees: getHeuresFermeesForDate(selectedDate),
    creneauxFermesPourDate: creneauxFermesPourDate.map(c => ({ heure: c.heure, date: c.date, ferme: c.ferme })),
    creneauxDetails: creneaux.map(c => ({
      heure: c.heure,
      date: c.date,
      dateFormatted: formatDateToString(c.date),
      selectedDateFormatted: formatDateToString(selectedDate),
      ferme: c.ferme,
      id: c._id || c.id
    }))
  });

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
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Gestion des Créneaux
            </h1>
            <p className="text-muted-foreground text-lg">Fermez ou rouvrez des créneaux de rendez-vous</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={loadCreneaux}
              disabled={isLoading}
              className="shadow-sm"
            >
              <span className="mr-2">🔄</span>
              Actualiser
            </Button>
            <Button 
              onClick={() => setShowCloseModal(true)}
              className="bg-primary hover:bg-primary/90 shadow-md"
            >
              <span className="mr-2">🔒</span>
              Fermer des créneaux
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Sélection de date */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border-l-4 border-primary">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="date" className="text-base font-semibold mb-3 block">
                📅 Sélectionner une date
              </Label>
              <Input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-medium">
                {creneauxFermesPourDate.length} créneau{creneauxFermesPourDate.length > 1 ? 'x' : ''} fermé{creneauxFermesPourDate.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Liste des créneaux fermés */}
        <div className="bg-white rounded-xl shadow-md p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Créneaux fermés
              </h2>
              <p className="text-muted-foreground">
                {selectedDate && !isNaN(new Date(selectedDate).getTime()) 
                  ? new Date(selectedDate).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })
                  : 'Date invalide'}
              </p>
            </div>
            {creneauxFermesPourDate.length > 0 && (
              <Button
                variant="outline"
                onClick={async () => {
                  if (confirm(`Êtes-vous sûr de vouloir rouvrir tous les ${creneauxFermesPourDate.length} créneaux fermés pour cette date ?`)) {
                    setIsLoading(true);
                    setError(null);
                    try {
                      let successCount = 0;
                      let errorCount = 0;
                      for (const creneau of creneauxFermesPourDate) {
                        try {
                          await creneauxAPI.reopenSlot(creneau._id || creneau.id);
                          successCount++;
                        } catch (err) {
                          errorCount++;
                          console.error('Erreur lors de la réouverture:', err);
                        }
                      }
                      await loadCreneaux();
                      if (successCount > 0) {
                        alert(`${successCount} créneau${successCount > 1 ? 'x' : ''} rouvert${successCount > 1 ? 's' : ''} avec succès${errorCount > 0 ? ` (${errorCount} erreur${errorCount > 1 ? 's' : ''})` : ''}`);
                      }
                    } catch (err: any) {
                      setError(err.response?.data?.message || 'Erreur lors de la réouverture');
                    } finally {
                      setIsLoading(false);
                    }
                  }
                }}
                disabled={isLoading}
                className="bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
              >
                <span className="mr-2">🔄</span>
                Tout rouvrir
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Chargement des créneaux...</p>
            </div>
          ) : creneauxFermesPourDate.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">📅</span>
              </div>
              <p className="text-muted-foreground mb-2 font-medium">Aucun créneau fermé pour cette date</p>
              <p className="text-sm text-muted-foreground">
                Tous les créneaux sont disponibles pour le {selectedDate && !isNaN(new Date(selectedDate).getTime())
                  ? new Date(selectedDate).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })
                  : 'date invalide'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
              {creneauxFermesPourDate.map((creneau) => (
                <div
                  key={creneau._id || creneau.id}
                  className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300 rounded-xl p-5 text-center hover:shadow-lg transition-all hover:scale-105"
                >
                  <div className="mb-3">
                    <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                      <span className="text-white font-bold text-lg">{creneau.heure}</span>
                    </div>
                    {creneau.motifFermeture && (
                      <p className="text-xs text-red-700 font-medium mt-2 line-clamp-2" title={creneau.motifFermeture}>
                        {creneau.motifFermeture}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => handleReopenSlot(creneau._id || creneau.id)}
                    disabled={isLoading}
                    className="w-full text-sm bg-white hover:bg-green-50 hover:border-green-400 hover:text-green-700 transition-colors"
                  >
                    <span className="mr-2">🔓</span>
                    Rouvrir
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal de fermeture de créneaux */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-foreground">🔒 Fermer des créneaux</h3>
              <button
                onClick={() => {
                  setShowCloseModal(false);
                  setSelectedHeures([]);
                  setSelectedDatesToClose([]);
                  setMotifFermeture('');
                  setError(null);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-4">
              <Label htmlFor="modalDate">Date</Label>
              <Input
                id="modalDate"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="mt-2"
              />
            </div>

            <div className="mb-6">
              <Label className="text-base font-semibold mb-3 block">
                📆 Jours de la semaine à fermer
              </Label>
              <div className="flex flex-wrap gap-2 mb-3">
                <Button
                  type="button"
                  variant="outline"
                  className="text-xs px-3 py-1"
                  onClick={() => setSelectedDatesToClose(weekDates)}
                >
                  Toute la semaine
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-xs px-3 py-1"
                  onClick={() => setSelectedDatesToClose([selectedDate])}
                >
                  Jour sélectionné
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-xs px-3 py-1"
                  onClick={() => setSelectedDatesToClose([])}
                >
                  Réinitialiser
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {weekDates.map((date) => {
                  const isSelected = selectedDatesToClose.includes(date);
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedDatesToClose(selectedDatesToClose.filter((d) => d !== date));
                        } else {
                          setSelectedDatesToClose([...selectedDatesToClose, date]);
                        }
                      }}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        isSelected
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white border-gray-300 hover:border-primary'
                      }`}
                    >
                      {formatDayLabel(date)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-6">
              <Label className="text-base font-semibold mb-3 block">
                📊 Horaires de toute la semaine
              </Label>
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {weekDates.map((date) => {
                  const heuresFermeesDate = getHeuresFermeesForDate(date);
                  return (
                    <div key={`week-${date}`} className="border rounded-lg p-3">
                      <p className="text-sm font-semibold mb-2">{formatDayLabel(date)}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {heuresDisponibles.map((heure) => {
                          const isClosed = heuresFermeesDate.includes(heure);
                          return (
                            <span
                              key={`${date}-${heure}`}
                              className={`text-xs px-2 py-1 rounded ${
                                isClosed
                                  ? 'bg-red-100 text-red-700 border border-red-200'
                                  : 'bg-green-100 text-green-700 border border-green-200'
                              }`}
                            >
                              {heure}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mb-6">
              <Label className="text-base font-semibold mb-3 block">
                ⏰ Sélectionner les créneaux à fermer
              </Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {heuresDisponibles.map((heure) => {
                  const isSelected = selectedHeures.includes(heure);
                  
                  return (
                    <button
                      key={heure}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedHeures(selectedHeures.filter(h => h !== heure));
                        } else {
                          setSelectedHeures([...selectedHeures, heure]);
                        }
                      }}
                      className={`p-3 rounded-lg border-2 transition-all font-medium ${
                        isSelected
                          ? 'bg-primary text-white border-primary shadow-md scale-105'
                          : 'bg-white border-gray-300 hover:border-primary hover:shadow-md hover:scale-105'
                      }`}
                    >
                      {heure}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <Label htmlFor="motif">Motif de fermeture (optionnel)</Label>
              <Textarea
                id="motif"
                value={motifFermeture}
                onChange={(e) => setMotifFermeture(e.target.value)}
                placeholder="Ex: Congé, Formation, etc."
                rows={3}
                className="mt-2"
              />
            </div>

            {selectedHeures.length > 0 && selectedDatesToClose.length > 0 && (
              <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg">
                <p className="text-sm font-semibold text-blue-900 mb-1">
                  ✓ <strong>{selectedDatesToClose.length}</strong> jour{selectedDatesToClose.length > 1 ? 's' : ''} × <strong>{selectedHeures.length}</strong> créneau{selectedHeures.length > 1 ? 'x' : ''} = <strong>{selectedDatesToClose.length * selectedHeures.length}</strong> fermeture{selectedDatesToClose.length * selectedHeures.length > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-blue-700">
                  {selectedHeures.sort().join(', ')}
                </p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCloseModal(false);
                  setSelectedHeures([]);
                  setSelectedDatesToClose([]);
                  setMotifFermeture('');
                  setError(null);
                }} 
                disabled={isLoading}
                className="min-w-[100px]"
              >
                Annuler
              </Button>
              <Button 
                onClick={handleCloseSlots} 
                disabled={isLoading || selectedHeures.length === 0 || selectedDatesToClose.length === 0}
                className="min-w-[180px] bg-primary hover:bg-primary/90 shadow-md"
              >
                {isLoading ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Fermeture...
                  </>
                ) : (
                  <>
                    <span className="mr-2">🔒</span>
                    Fermer {selectedDatesToClose.length * selectedHeures.length} créneau{selectedDatesToClose.length * selectedHeures.length > 1 ? 'x' : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

