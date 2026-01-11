'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { appointmentsAPI, creneauxAPI, userAPI } from '@/lib/api';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';

const Input = React.forwardRef<HTMLInputElement, any>(({ className = '', type, value, onChange, onInput, onBlur, ...props }, ref) => {
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
        className={`flex h-7 w-full rounded border border-input bg-background px-2 py-0.5 text-[11px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      />
    );
  }
  
  return (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={onChange}
      onInput={onInput}
      onBlur={onBlur}
      className={`flex h-7 w-full rounded border border-input bg-background px-2 py-0.5 text-[11px] ring-offset-background file:border-0 file:bg-transparent file:text-[11px] file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
});
Input.displayName = 'Input';

function Label({ className = '', children, ...props }: any) {
  return (
    <label className={`text-[10px] font-medium leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`} {...props}>
      {children}
    </label>
  );
}

function Button({ children, variant = 'default', className = '', disabled = false, ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} disabled={disabled} {...props}>{children}</button>;
}

interface ReservationWidgetProps {
  isOpen?: boolean;
  onClose?: () => void;
  defaultOpen?: boolean;
  onSuccess?: () => void; // Callback appelé après une réservation réussie
}

export function ReservationWidget({ isOpen: controlledIsOpen, onClose, defaultOpen = true, onSuccess }: ReservationWidgetProps) {
  const { data: session } = useSession();
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
  
  // Utiliser l'état contrôlé si fourni, sinon utiliser l'état interne
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  // Charger l'état depuis localStorage au montage
  useEffect(() => {
    const savedState = localStorage.getItem('reservationWidgetOpen');
    if (savedState !== null && controlledIsOpen === undefined) {
      setInternalIsOpen(savedState === 'true');
    }
  }, [controlledIsOpen]);

  // Sauvegarder l'état dans localStorage
  const handleClose = () => {
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(false);
      localStorage.setItem('reservationWidgetOpen', 'false');
    } else {
      onClose?.();
    }
  };

  const handleOpen = () => {
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(true);
      localStorage.setItem('reservationWidgetOpen', 'true');
    }
  };
  // Date du jour au format YYYY-MM-DD
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  // Liste des motifs basée sur les types de demandes de dossier
  const motifsOptions = [
    { value: 'Consultation', label: 'Consultation' },
    { value: 'premiere_demande_titre', label: 'Je fais une première demande de titre de séjour' },
    { value: 'renouvellement_titre', label: 'Je demande le renouvellement de mon titre de séjour' },
    { value: 'changement_statut', label: 'Je demande un changement de statut' },
    { value: 'regroupement_familial', label: 'Je demande un regroupement familial' },
    { value: 'nationalite_francaise', label: 'Je demande la nationalité française' },
    { value: 'demande_visa', label: 'Je demande un visa' },
    { value: 'demande_carte_resident', label: 'Je demande une carte de résident' },
    { value: 'autre_demande', label: 'Autre Demande' },
    { value: 'pas_reponse_titre', label: 'Je n\'ai pas eu de réponse à ma demande de titre de séjour' },
    { value: 'pas_reponse_visa', label: 'Je n\'ai pas eu de réponse à ma demande de visa' },
    { value: 'conteste_refus_titre', label: 'Je conteste un refus de titre de séjour' },
    { value: 'conteste_oqtf', label: 'J\'ai reçu une OQTF (obligation de quitter le territoire)' },
    { value: 'conteste_refus_asile_cnda', label: 'Je conteste un refus d\'asile auprès de la CNDA' },
    { value: 'conteste_refus_visa', label: 'Je conteste un refus de visa' },
    { value: 'Dossier administratif', label: 'Dossier administratif' },
    { value: 'Suivi de dossier', label: 'Suivi de dossier' },
    { value: 'Autre', label: 'Autre' },
  ];

  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    date: getTodayDate(),
    heure: '',
    motif: 'Consultation',
    description: '',
  });
  const [userProfileLoaded, setUserProfileLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Refs pour détecter l'auto-remplissage du navigateur
  const nomInputRef = useRef<HTMLInputElement>(null);
  const prenomInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const telephoneInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Réinitialiser userProfileLoaded quand le widget s'ouvre
  useEffect(() => {
    if (isOpen) {
      setUserProfileLoaded(false);
    }
  }, [isOpen]);

  // Heures disponibles par défaut
  const heuresDisponiblesParDefaut = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'
  ];

  const [heuresDisponibles, setHeuresDisponibles] = useState<string[]>(heuresDisponiblesParDefaut);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Date minimale (aujourd'hui) - format YYYY-MM-DD
  const today = getTodayDate();

  // S'assurer que la date sélectionnée n'est pas passée
  useEffect(() => {
    const todayStr = getTodayDate();
    if (formData.date && formData.date < todayStr) {
      setFormData(prev => ({ ...prev, date: todayStr, heure: '' }));
    }
  }, [formData.date]);

  // Charger les créneaux disponibles quand la date change
  useEffect(() => {
    if (formData.date) {
      loadAvailableSlots(formData.date);
    } else {
      setHeuresDisponibles(heuresDisponiblesParDefaut);
    }
  }, [formData.date]);

  // Pré-remplir les informations de l'utilisateur connecté
  useEffect(() => {
    const loadUserProfile = async () => {
      // Ne charger que si le widget est ouvert, que l'utilisateur est connecté et que le profil n'a pas encore été chargé
      if (!isOpen || userProfileLoaded) {
        return;
      }

      try {
        // D'abord, essayer de charger depuis l'API pour avoir toutes les informations (y compris le téléphone)
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (token || session?.user) {
          try {
            const response = await userAPI.getProfile();
            if (response.data.success) {
              const user = response.data.user || response.data.data;
              setFormData(prev => ({
                ...prev,
                prenom: user.firstName || prev.prenom || '',
                nom: user.lastName || prev.nom || '',
                email: user.email || prev.email || '',
                telephone: user.phone || user.telephone || prev.telephone || '',
              }));
              setUserProfileLoaded(true);
              return;
            }
          } catch (apiError) {
            console.log('Impossible de charger depuis l\'API, utilisation de la session:', apiError);
          }
        }

        // Si l'API échoue, utiliser les données de la session NextAuth
          if (session?.user) {
            const nameParts = (session.user.name || '').split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            
            setFormData(prev => ({
              ...prev,
              prenom: prev.prenom || firstName,
              nom: prev.nom || lastName,
              email: prev.email || session.user.email || '',
            }));
            setUserProfileLoaded(true);
          }
        } catch (error) {
          console.error('Erreur lors du chargement du profil utilisateur:', error);
        setUserProfileLoaded(true); // Marquer comme chargé pour éviter les boucles infinies
      }
    };

    loadUserProfile();
  }, [isOpen, session, userProfileLoaded]);

  // Détecter l'auto-remplissage du navigateur
  useEffect(() => {
    if (!isOpen) return;

    const checkAutoFill = () => {
      // Vérifier chaque input pour détecter les valeurs auto-remplies
      if (nomInputRef.current && nomInputRef.current.value !== formData.nom) {
        setFormData(prev => ({ ...prev, nom: nomInputRef.current?.value || '' }));
      }
      if (prenomInputRef.current && prenomInputRef.current.value !== formData.prenom) {
        setFormData(prev => ({ ...prev, prenom: prenomInputRef.current?.value || '' }));
      }
      if (emailInputRef.current && emailInputRef.current.value !== formData.email) {
        setFormData(prev => ({ ...prev, email: emailInputRef.current?.value || '' }));
      }
      if (telephoneInputRef.current && telephoneInputRef.current.value !== formData.telephone) {
        setFormData(prev => ({ ...prev, telephone: telephoneInputRef.current?.value || '' }));
      }
      // Pour la date, chercher l'input date natif dans le composant DateInput via le DOM
      const dateInputNative = document.querySelector('#date[type="date"]') as HTMLInputElement;
      if (dateInputNative && dateInputNative.value !== formData.date) {
        setFormData(prev => ({ ...prev, date: dateInputNative.value }));
      }
    };

    // Vérifier immédiatement
    checkAutoFill();

    // Vérifier périodiquement (l'auto-remplissage peut se produire avec un délai)
    const interval = setInterval(checkAutoFill, 500);
    
    // Vérifier aussi après un délai plus long (certains navigateurs remplissent après plusieurs secondes)
    const timeout = setTimeout(checkAutoFill, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isOpen, formData.nom, formData.prenom, formData.email, formData.telephone, formData.date]);

  const loadAvailableSlots = async (date: string) => {
    setLoadingSlots(true);
    try {
      const response = await creneauxAPI.getAvailableSlots(date);
      if (response.data.success) {
        let heuresDisponibles = response.data.heuresDisponibles || [];
        
        // Si la date sélectionnée est aujourd'hui, filtrer les heures déjà passées
        const maintenant = new Date();
        const dateAujourdhui = maintenant.toISOString().split('T')[0];
        
        if (date === dateAujourdhui) {
          const heureActuelle = maintenant.getHours();
          const minuteActuelle = maintenant.getMinutes();
          const heureActuelleStr = `${heureActuelle.toString().padStart(2, '0')}:${minuteActuelle.toString().padStart(2, '0')}`;
          
          heuresDisponibles = heuresDisponibles.filter(heure => {
            // Comparer les heures au format HH:MM
            return heure > heureActuelleStr;
          });
        }
        
        setHeuresDisponibles(heuresDisponibles);
        // Si l'heure sélectionnée n'est plus disponible, la réinitialiser
        if (formData.heure && !heuresDisponibles.includes(formData.heure)) {
          setFormData({ ...formData, heure: '' });
        }
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des créneaux disponibles:', err);
      // En cas d'erreur, utiliser les heures par défaut mais filtrer si c'est aujourd'hui
      let heuresParDefaut = heuresDisponiblesParDefaut;
      const maintenant = new Date();
      const dateAujourdhui = maintenant.toISOString().split('T')[0];
      
      if (formData.date === dateAujourdhui) {
        const heureActuelle = maintenant.getHours();
        const minuteActuelle = maintenant.getMinutes();
        const heureActuelleStr = `${heureActuelle.toString().padStart(2, '0')}:${minuteActuelle.toString().padStart(2, '0')}`;
        
        heuresParDefaut = heuresParDefaut.filter(heure => heure > heureActuelleStr);
      }
      
      setHeuresDisponibles(heuresParDefaut);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    // Récupérer les valeurs réelles des inputs DOM pour détecter l'auto-remplissage
    const nomValue = nomInputRef.current?.value || formData.nom;
    const emailValue = emailInputRef.current?.value || formData.email;
    // Pour la date, chercher l'input date natif dans le composant DateInput via le DOM
    const dateInputNative = document.querySelector('#date[type="date"]') as HTMLInputElement;
    const dateValue = dateInputNative?.value || formData.date;
    const heureValue = formData.heure; // Le select n'a pas besoin de ref car il est toujours synchronisé

    // Mettre à jour formData avec les valeurs réelles des inputs DOM
    const updatedFormData = {
      ...formData,
      nom: nomValue.trim(),
      email: emailValue.trim(),
      date: dateValue,
    };

    // Validation : seuls nom, email, date et heure sont obligatoires pour ne pas bloquer les utilisateurs non connectés
    if (!updatedFormData.nom || !updatedFormData.email || !updatedFormData.date || !heureValue) {
      setError('Veuillez renseigner au minimum votre nom, votre email, la date et l\'heure du rendez-vous.');
      setIsSubmitting(false);
      return;
    }

    // Mettre à jour l'état avec les valeurs réelles
    setFormData(updatedFormData);

    try {
      console.log('Envoi de la demande de rendez-vous:', updatedFormData);
      const response = await appointmentsAPI.createAppointment(updatedFormData);
      console.log('Réponse du serveur:', response.data);
      if (response.data.success) {
        setSuccess(response.data.message);
        // Réinitialiser le formulaire
        setFormData({
          nom: '',
          prenom: '',
          email: '',
          telephone: '',
          date: '',
          heure: '',
          motif: 'Consultation',
          description: '',
        });
        setTimeout(() => setSuccess(null), 5000);
        // Appeler le callback de succès si fourni
        if (onSuccess) {
          setTimeout(() => {
            onSuccess();
          }, 1000);
        }
      }
    } catch (err: any) {
      console.error('Erreur lors de la réservation:', err);
      console.error('Détails de l\'erreur:', err.response?.data);
      
      // Afficher un message d'erreur plus détaillé
      let errorMessage = 'Une erreur est survenue lors de la réservation';
      
      if (err.response?.data) {
        // Si le serveur a renvoyé un message d'erreur spécifique
        errorMessage = err.response.data.message || errorMessage;
        
        // Si le serveur a renvoyé des erreurs de validation
        if (err.response.data.errors && Array.isArray(err.response.data.errors)) {
          const validationErrors = err.response.data.errors.map((e: any) => e.msg || e.message).join(', ');
          if (validationErrors) {
            errorMessage = `Erreurs de validation: ${validationErrors}`;
          }
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-xl p-3 border border-border max-w-sm relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleClose();
        }}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors z-10 bg-white/80 rounded-full w-6 h-6 flex items-center justify-center hover:bg-white hover:shadow-md cursor-pointer"
        aria-label="Fermer"
      >
        <span className="text-lg leading-none">×</span>
      </button>
      <div className="text-center mb-2 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg blur-sm -z-10"></div>
        <h3 className="text-sm font-bold text-foreground mb-0.5 relative z-10">Prendre un rendez-vous</h3>
        <p className="text-[10px] text-muted-foreground relative z-10">Réservez en quelques clics</p>
      </div>

      {error && (
        <div className="mb-1.5 p-1.5 bg-red-50 border border-red-200 rounded text-[10px]">
          <p className="text-[10px] text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-1.5 p-1.5 bg-green-50 border border-green-200 rounded text-[10px]">
          <p className="text-[10px] text-green-800">{success}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <Label htmlFor="nom">Nom *</Label>
            <Input
              ref={nomInputRef}
              id="nom"
              name="family-name"
              type="text"
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              onInput={(e) => {
                const target = e.target as HTMLInputElement;
                setFormData({ ...formData, nom: target.value });
              }}
              onBlur={(e) => {
                const target = e.target as HTMLInputElement;
                if (target.value !== formData.nom) {
                  setFormData({ ...formData, nom: target.value });
                }
              }}
              autoComplete="family-name"
              required
              className="mt-0.5"
              placeholder="Nom"
            />
          </div>
          <div>
            <Label htmlFor="prenom">Prénom *</Label>
            <Input
              ref={prenomInputRef}
              id="prenom"
              name="given-name"
              type="text"
              value={formData.prenom}
              onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
              onInput={(e) => {
                const target = e.target as HTMLInputElement;
                setFormData({ ...formData, prenom: target.value });
              }}
              onBlur={(e) => {
                const target = e.target as HTMLInputElement;
                if (target.value !== formData.prenom) {
                  setFormData({ ...formData, prenom: target.value });
                }
              }}
              autoComplete="given-name"
              required
              className="mt-0.5"
              placeholder="Prénom"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="email">Email *</Label>
          <Input
            ref={emailInputRef}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            onInput={(e) => {
              const target = e.target as HTMLInputElement;
              setFormData({ ...formData, email: target.value });
            }}
            onBlur={(e) => {
              const target = e.target as HTMLInputElement;
              if (target.value !== formData.email) {
                setFormData({ ...formData, email: target.value });
              }
            }}
            required
            className="mt-0.5"
            placeholder="email@exemple.com"
          />
        </div>

        <div>
          <Label htmlFor="telephone">Téléphone *</Label>
          <Input
            ref={telephoneInputRef}
            id="telephone"
            name="tel"
            type="tel"
            autoComplete="tel"
            value={formData.telephone}
            onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
            onInput={(e) => {
              const target = e.target as HTMLInputElement;
              setFormData({ ...formData, telephone: target.value });
            }}
            onBlur={(e) => {
              const target = e.target as HTMLInputElement;
              if (target.value !== formData.telephone) {
                setFormData({ ...formData, telephone: target.value });
              }
            }}
            required
            className="mt-0.5"
            placeholder="06 12 34 56 78"
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <Label htmlFor="date">Date *</Label>
            <Input
              ref={dateInputRef}
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              onInput={(e) => {
                const target = e.target as HTMLInputElement;
                if (target.value !== formData.date) {
                  setFormData({ ...formData, date: target.value });
                }
              }}
              onBlur={(e) => {
                const target = e.target as HTMLInputElement;
                if (target.value !== formData.date) {
                  setFormData({ ...formData, date: target.value });
                }
              }}
              required
              min={today}
              className="mt-0.5"
            />
          </div>
          <div>
            <Label htmlFor="heure">Heure *</Label>
            <select
              id="heure"
              value={formData.heure}
              onChange={(e) => setFormData({ ...formData, heure: e.target.value })}
              required
              disabled={loadingSlots || !formData.date || heuresDisponibles.length === 0}
              className="mt-0.5 flex h-7 w-full rounded border border-input bg-background px-2 py-0.5 text-[11px] ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {loadingSlots ? 'Chargement...' : !formData.date ? 'Sélectionnez d\'abord une date' : heuresDisponibles.length === 0 ? 'Aucun créneau disponible' : 'Heure'}
              </option>
              {heuresDisponibles.map((heure) => (
                <option key={heure} value={heure}>
                  {heure}
                </option>
              ))}
            </select>
            {formData.date && heuresDisponibles.length === 0 && !loadingSlots && (
              <p className="text-[9px] text-red-600 mt-0.5">Tous les créneaux sont occupés pour cette date</p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="motif">Motif *</Label>
          <select
            id="motif"
            value={formData.motif}
            onChange={(e) => setFormData({ ...formData, motif: e.target.value })}
            required
            className="mt-0.5 flex h-7 w-full rounded border border-input bg-background px-2 py-0.5 text-[11px] ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {motifsOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-7 text-[11px] mt-1"
        >
          {isSubmitting ? 'Envoi...' : 'Réserver'}
        </Button>

        <p className="text-[9px] text-center text-muted-foreground mt-1">
          Vous recevrez une confirmation sur votre espace personnel.
        </p>
      </form>
    </div>
  );
}

