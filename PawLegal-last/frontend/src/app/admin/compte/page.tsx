'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { userAPI, smsPreferencesAPI } from '@/lib/api';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';

function Button({ children, variant = 'default', className = '', disabled = false, ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} disabled={disabled} {...props}>{children}</button>;
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
        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      />
    );
  }
  
  return (
    <input
      type={type}
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function Label({ className = '', children, ...props }: any) {
  return (
    <label className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`} {...props}>
      {children}
    </label>
  );
}

function Textarea({ className = '', ...props }: any) {
  return (
    <textarea
      className={`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export default function AdminComptePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<'profil' | 'password' | 'sms'>('profil');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Données du profil - Tous les champs seront automatiquement pré-remplis avec les données de la base
  // lors du chargement du profil via loadProfile()
  // L'administrateur peut modifier tous les champs de son propre profil
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateNaissance: '',
    lieuNaissance: '',
    nationalite: '',
    sexe: '',
    numeroEtranger: '',
    numeroTitre: '',
    typeTitre: '',
    dateDelivrance: '',
    dateExpiration: '',
    adressePostale: '',
    ville: '',
    codePostal: '',
    pays: '',
  });

  // Données pour le changement de mot de passe
  // IMPORTANT : Le mot de passe n'est JAMAIS pré-rempli pour des raisons de sécurité
  // L'administrateur doit toujours saisir son mot de passe actuel pour le changer
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Préférences SMS
  const [smsPreferences, setSmsPreferences] = useState({
    enabled: true,
    types: {
      appointment_confirmed: true,
      appointment_cancelled: true,
      appointment_updated: true,
      appointment_reminder: true,
      dossier_created: true,
      dossier_updated: true,
      dossier_status_changed: true,
      document_uploaded: true,
      message_received: true,
      task_assigned: true,
      task_reminder: true,
      account_security: true,
      otp: true, // Toujours activé pour sécurité
    }
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (session && (session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin') {
      router.push('/client');
    }
  }, [session, status, router]);

  useEffect(() => {
    // Charger le profil automatiquement lorsque l'administrateur est authentifié
    // Le formulaire sera pré-rempli avec toutes les données existantes
    if (status === 'authenticated' && session && ((session.user as any)?.role === 'admin' || (session.user as any)?.role === 'superadmin')) {
      loadProfile();
    }
  }, [status, session]);

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('🔄 Chargement du profil administrateur...');
      const response = await userAPI.getProfile();
      
      if (response.data.success) {
        const user = response.data.user || response.data.data;
        console.log('✅ Profil chargé:', { 
          firstName: user.firstName, 
          lastName: user.lastName, 
          email: user.email,
          role: user.role,
          hasPhone: !!user.phone,
          hasDateNaissance: !!user.dateNaissance,
          hasDateDelivrance: !!user.dateDelivrance,
          hasDateExpiration: !!user.dateExpiration
        });
        
        // Fonction helper pour formater les dates de manière sécurisée
        const formatDate = (dateValue: any): string => {
          if (!dateValue) return '';
          try {
            // Gérer les chaînes de caractères et les objets Date
            const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
            if (isNaN(date.getTime())) return '';
            return date.toISOString().split('T')[0];
          } catch {
            return '';
          }
        };

        // Pré-remplir TOUS les champs avec les données existantes
        // Si une valeur existe en base, elle est utilisée, sinon chaîne vide
        // Les champs ne doivent JAMAIS être undefined ou null
        // L'administrateur peut modifier tous les champs de son propre profil
        const preFilledData = {
          firstName: String(user.firstName || '').trim(),
          lastName: String(user.lastName || '').trim(),
          email: String(user.email || '').trim(),
          phone: String(user.phone || '').trim(),
          dateNaissance: formatDate(user.dateNaissance),
          lieuNaissance: String(user.lieuNaissance || '').trim(),
          nationalite: String(user.nationalite || '').trim(),
          sexe: String(user.sexe || '').trim(),
          numeroEtranger: String(user.numeroEtranger || '').trim(),
          numeroTitre: String(user.numeroTitre || '').trim(),
          typeTitre: String(user.typeTitre || '').trim(),
          dateDelivrance: formatDate(user.dateDelivrance),
          dateExpiration: formatDate(user.dateExpiration),
          adressePostale: String(user.adressePostale || '').trim(),
          ville: String(user.ville || '').trim(),
          codePostal: String(user.codePostal || '').trim(),
          pays: String(user.pays || 'France').trim(),
        };
        
        console.log('📝 Données pré-remplies:', preFilledData);
        setProfileData(preFilledData);
        
        // Charger les préférences SMS
        if (user.smsPreferences) {
          setSmsPreferences({
            enabled: user.smsPreferences.enabled !== false,
            types: {
              appointment_confirmed: user.smsPreferences.types?.appointment_confirmed !== false,
              appointment_cancelled: user.smsPreferences.types?.appointment_cancelled !== false,
              appointment_updated: user.smsPreferences.types?.appointment_updated !== false,
              appointment_reminder: user.smsPreferences.types?.appointment_reminder !== false,
              dossier_created: user.smsPreferences.types?.dossier_created !== false,
              dossier_updated: user.smsPreferences.types?.dossier_updated !== false,
              dossier_status_changed: user.smsPreferences.types?.dossier_status_changed !== false,
              document_uploaded: user.smsPreferences.types?.document_uploaded !== false,
              message_received: user.smsPreferences.types?.message_received !== false,
              task_assigned: user.smsPreferences.types?.task_assigned !== false,
              task_reminder: user.smsPreferences.types?.task_reminder !== false,
              account_security: user.smsPreferences.types?.account_security !== false,
              otp: true, // Toujours activé
            }
          });
        }
      } else {
        console.error('❌ Erreur: réponse non réussie', response.data);
        setError('Impossible de charger le profil');
      }
    } catch (error: any) {
      console.error('❌ Erreur lors du chargement du profil:', error);
      setError(error.response?.data?.message || 'Erreur lors du chargement du profil');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await userAPI.updateProfile(profileData);
      if (response.data.success) {
        setSuccess('Profil mis à jour avec succès');
        setTimeout(() => setSuccess(null), 3000);
        // Recharger le profil pour avoir les données à jour (au cas où le backend modifie certaines valeurs)
        await loadProfile();
      } else {
        setError(response.data.message || 'Erreur lors de la mise à jour du profil');
      }
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour du profil:', error);
      setError(error.response?.data?.message || 'Erreur lors de la mise à jour du profil');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      setIsSaving(false);
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères');
      setIsSaving(false);
      return;
    }

    try {
      const response = await userAPI.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      if (response.data.success) {
        setSuccess('Mot de passe modifié avec succès');
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        });
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Erreur lors du changement de mot de passe');
    } finally {
      setIsSaving(false);
    }
  };

  if (status === 'loading' || isLoading) {
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
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-background">
      <main className="w-full px-4 py-8">
        {/* En-tête amélioré */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/70 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-3xl">👤</span>
            </div>
            <div>
              <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                Mon Compte
              </h1>
              <p className="text-muted-foreground text-lg">Gérez vos informations personnelles et votre sécurité</p>
            </div>
          </div>
        </div>

        {/* Onglets améliorés */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-6">
          <div className="flex gap-1 border-b bg-gray-50/50 p-2">
            <button
              onClick={() => setActiveTab('profil')}
              className={`flex-1 px-6 py-3 font-semibold text-sm transition-all duration-200 rounded-lg ${
                activeTab === 'profil'
                  ? 'bg-white text-primary shadow-md border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/50'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-lg">👤</span>
                <span>Informations personnelles</span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`flex-1 px-6 py-3 font-semibold text-sm transition-all duration-200 rounded-lg ${
                activeTab === 'password'
                  ? 'bg-white text-primary shadow-md border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/50'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-lg">🔒</span>
                <span>Mot de passe</span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab('sms')}
              className={`flex-1 px-6 py-3 font-semibold text-sm transition-all duration-200 rounded-lg ${
                activeTab === 'sms'
                  ? 'bg-white text-primary shadow-md border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/50'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-lg">📱</span>
                <span>Notifications SMS</span>
              </span>
            </button>
          </div>

          <div className="p-8">

          {error && (
            <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-red-100/50 border-2 border-red-300 rounded-xl shadow-sm">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-green-100/50 border-2 border-green-300 rounded-xl shadow-sm">
              <div className="flex items-center gap-3">
                <span className="text-2xl">✅</span>
                <p className="text-sm font-medium text-green-800">{success}</p>
              </div>
            </div>
          )}

          {/* Formulaire de profil */}
          {activeTab === 'profil' && (
            <form onSubmit={handleProfileSubmit} className="space-y-8">
              <div className="grid lg:grid-cols-2 gap-8">
                {/* Informations de base */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1 h-8 bg-blue-500 rounded-full"></div>
                    <h3 className="text-xl font-bold text-foreground">Informations de base</h3>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50/50 to-white rounded-xl p-6 border border-blue-100 space-y-5">
                  
                    <div>
                      <Label htmlFor="firstName" className="flex items-center gap-2 mb-2">
                        <span>👤</span>
                        <span>Prénom</span>
                      </Label>
                      <Input
                        id="firstName"
                        value={profileData.firstName}
                        onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                        className="h-11 border-2 focus:border-primary transition-colors"
                      />
                    </div>

                    <div>
                      <Label htmlFor="lastName" className="flex items-center gap-2 mb-2">
                        <span>📝</span>
                        <span>Nom</span>
                      </Label>
                      <Input
                        id="lastName"
                        value={profileData.lastName}
                        onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                        className="h-11 border-2 focus:border-primary transition-colors"
                      />
                    </div>

                    <div>
                      <Label htmlFor="email" className="flex items-center gap-2 mb-2">
                        <span>📧</span>
                        <span>Email</span>
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={profileData.email}
                        onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                        className="h-11 border-2 focus:border-primary transition-colors"
                      />
                    </div>

                    <div>
                      <Label htmlFor="phone" className="flex items-center gap-2 mb-2">
                        <span>📞</span>
                        <span>Téléphone</span>
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={profileData.phone}
                        onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                        className="h-11 border-2 focus:border-primary transition-colors"
                        placeholder="+33 6 12 34 56 78"
                      />
                    </div>

                    <div>
                      <Label htmlFor="dateNaissance" className="flex items-center gap-2 mb-2">
                        <span>🎂</span>
                        <span>Date de naissance</span>
                      </Label>
                      <Input
                        id="dateNaissance"
                        type="date"
                        value={profileData.dateNaissance}
                        onChange={(e) => setProfileData({ ...profileData, dateNaissance: e.target.value })}
                        className="h-11 border-2 focus:border-primary transition-colors"
                      />
                    </div>

                    <div>
                      <Label htmlFor="lieuNaissance" className="flex items-center gap-2 mb-2">
                        <span>📍</span>
                        <span>Lieu de naissance</span>
                      </Label>
                      <Input
                        id="lieuNaissance"
                        value={profileData.lieuNaissance}
                        onChange={(e) => setProfileData({ ...profileData, lieuNaissance: e.target.value })}
                        className="h-11 border-2 focus:border-primary transition-colors"
                        placeholder="Ville, Pays"
                      />
                    </div>

                    <div>
                      <Label htmlFor="nationalite" className="flex items-center gap-2 mb-2">
                        <span>🌍</span>
                        <span>Nationalité</span>
                      </Label>
                      <Input
                        id="nationalite"
                        value={profileData.nationalite}
                        onChange={(e) => setProfileData({ ...profileData, nationalite: e.target.value })}
                        className="h-11 border-2 focus:border-primary transition-colors"
                        placeholder="Ex: Française"
                      />
                    </div>

                    <div>
                      <Label htmlFor="sexe" className="flex items-center gap-2 mb-2">
                        <span>⚧️</span>
                        <span>Sexe</span>
                      </Label>
                      <select
                        id="sexe"
                        value={profileData.sexe}
                        onChange={(e) => setProfileData({ ...profileData, sexe: e.target.value })}
                        className="flex h-11 w-full rounded-md border-2 border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors"
                      >
                        <option value="">Sélectionner</option>
                        <option value="M">Masculin</option>
                        <option value="F">Féminin</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Informations administratives */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1 h-8 bg-purple-500 rounded-full"></div>
                    <h3 className="text-xl font-bold text-foreground">Informations administratives</h3>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50/50 to-white rounded-xl p-6 border border-purple-100 space-y-5">

                    <div>
                      <Label htmlFor="numeroEtranger" className="flex items-center gap-2 mb-2">
                        <span>🆔</span>
                        <span>Numéro d'étranger</span>
                      </Label>
                      <Input
                        id="numeroEtranger"
                        value={profileData.numeroEtranger}
                        onChange={(e) => setProfileData({ ...profileData, numeroEtranger: e.target.value })}
                        className="h-11 border-2 focus:border-primary transition-colors"
                        placeholder="Ex: 1234567890123"
                      />
                    </div>

                    <div>
                      <Label htmlFor="numeroTitre" className="flex items-center gap-2 mb-2">
                        <span>📄</span>
                        <span>Numéro de titre de séjour</span>
                      </Label>
                      <Input
                        id="numeroTitre"
                        value={profileData.numeroTitre}
                        onChange={(e) => setProfileData({ ...profileData, numeroTitre: e.target.value })}
                        className="h-11 border-2 focus:border-primary transition-colors"
                        placeholder="Ex: 12AB34567"
                      />
                    </div>

                    <div>
                      <Label htmlFor="typeTitre" className="flex items-center gap-2 mb-2">
                        <span>📋</span>
                        <span>Type de titre</span>
                      </Label>
                      <select
                        id="typeTitre"
                        value={profileData.typeTitre}
                        onChange={(e) => setProfileData({ ...profileData, typeTitre: e.target.value })}
                        className="flex h-11 w-full rounded-md border-2 border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors"
                      >
                        <option value="">Sélectionner</option>
                        <option value="visiteur">Visiteur</option>
                        <option value="etudiant">Étudiant</option>
                        <option value="salarie">Salarié</option>
                        <option value="travailleur_temporaire">Travailleur temporaire</option>
                        <option value="scientifique">Scientifique</option>
                        <option value="artiste">Artiste</option>
                        <option value="commercant">Commerçant</option>
                        <option value="autre">Autre</option>
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="dateDelivrance" className="flex items-center gap-2 mb-2">
                        <span>📅</span>
                        <span>Date de délivrance</span>
                      </Label>
                      <Input
                        id="dateDelivrance"
                        type="date"
                        value={profileData.dateDelivrance}
                        onChange={(e) => setProfileData({ ...profileData, dateDelivrance: e.target.value })}
                        className="h-11 border-2 focus:border-primary transition-colors"
                      />
                    </div>

                    <div>
                      <Label htmlFor="dateExpiration" className="flex items-center gap-2 mb-2">
                        <span>⏰</span>
                        <span>Date d'expiration</span>
                      </Label>
                      <Input
                        id="dateExpiration"
                        type="date"
                        value={profileData.dateExpiration}
                        onChange={(e) => setProfileData({ ...profileData, dateExpiration: e.target.value })}
                        className="h-11 border-2 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-4 mt-6">
                    <div className="w-1 h-8 bg-green-500 rounded-full"></div>
                    <h3 className="text-xl font-bold text-foreground">Adresse</h3>
                  </div>
                  <div className="bg-gradient-to-br from-green-50/50 to-white rounded-xl p-6 border border-green-100 space-y-5">

                    <div>
                      <Label htmlFor="adressePostale" className="flex items-center gap-2 mb-2">
                        <span>🏠</span>
                        <span>Adresse postale</span>
                      </Label>
                      <Textarea
                        id="adressePostale"
                        value={profileData.adressePostale}
                        onChange={(e) => setProfileData({ ...profileData, adressePostale: e.target.value })}
                        className="border-2 focus:border-primary transition-colors min-h-[100px]"
                        placeholder="Numéro et nom de rue"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="codePostal" className="flex items-center gap-2 mb-2">
                          <span>📮</span>
                          <span>Code postal</span>
                        </Label>
                        <Input
                          id="codePostal"
                          value={profileData.codePostal}
                          onChange={(e) => setProfileData({ ...profileData, codePostal: e.target.value })}
                          className="h-11 border-2 focus:border-primary transition-colors"
                          placeholder="75001"
                        />
                      </div>

                      <div>
                        <Label htmlFor="ville" className="flex items-center gap-2 mb-2">
                          <span>🏙️</span>
                          <span>Ville</span>
                        </Label>
                        <Input
                          id="ville"
                          value={profileData.ville}
                          onChange={(e) => setProfileData({ ...profileData, ville: e.target.value })}
                          className="h-11 border-2 focus:border-primary transition-colors"
                          placeholder="Paris"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="pays" className="flex items-center gap-2 mb-2">
                        <span>🌎</span>
                        <span>Pays</span>
                      </Label>
                      <Input
                        id="pays"
                        value={profileData.pays}
                        onChange={(e) => setProfileData({ ...profileData, pays: e.target.value })}
                        className="h-11 border-2 focus:border-primary transition-colors"
                        placeholder="France"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-6 border-t border-gray-200 mt-8">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/admin')}
                  disabled={isSaving}
                  className="px-6 py-2.5 font-semibold border-2 hover:bg-gray-50"
                >
                  Annuler
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSaving}
                  className="px-6 py-2.5 font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all"
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⏳</span>
                      <span>Enregistrement...</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span>💾</span>
                      <span>Enregistrer les modifications</span>
                    </span>
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Formulaire de changement de mot de passe */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-6 max-w-2xl">
              <div className="bg-gradient-to-br from-orange-50/50 to-white rounded-xl p-6 border border-orange-100 space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-8 bg-orange-500 rounded-full"></div>
                  <h3 className="text-xl font-bold text-foreground">Sécurité du compte</h3>
                </div>

                <div>
                  <Label htmlFor="currentPassword" className="flex items-center gap-2 mb-2">
                    <span>🔑</span>
                    <span>Mot de passe actuel *</span>
                  </Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    required
                    className="h-11 border-2 focus:border-primary transition-colors"
                    placeholder="Entrez votre mot de passe actuel"
                  />
                </div>

                <div>
                  <Label htmlFor="newPassword" className="flex items-center gap-2 mb-2">
                    <span>🆕</span>
                    <span>Nouveau mot de passe *</span>
                  </Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    required
                    minLength={8}
                    className="h-11 border-2 focus:border-primary transition-colors"
                    placeholder="Au moins 8 caractères"
                  />
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-800 flex items-center gap-2">
                      <span>ℹ️</span>
                      <span>Le mot de passe doit contenir au moins 8 caractères</span>
                    </p>
                  </div>
                </div>

                <div>
                  <Label htmlFor="confirmPassword" className="flex items-center gap-2 mb-2">
                    <span>✅</span>
                    <span>Confirmer le nouveau mot de passe *</span>
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    required
                    minLength={8}
                    className="h-11 border-2 focus:border-primary transition-colors"
                    placeholder="Confirmez votre nouveau mot de passe"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/admin')}
                  disabled={isSaving}
                  className="px-6 py-2.5 font-semibold border-2 hover:bg-gray-50"
                >
                  Annuler
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSaving}
                  className="px-6 py-2.5 font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all"
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⏳</span>
                      <span>Modification...</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span>🔒</span>
                      <span>Modifier le mot de passe</span>
                    </span>
                  )}
                </Button>
              </div>
            </form>
          )}

          {activeTab === 'sms' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setIsSaving(true);
                setError(null);
                setSuccess(null);
                try {
                  await smsPreferencesAPI.updatePreferences(smsPreferences);
                  setSuccess('Préférences SMS mises à jour avec succès');
                  setTimeout(() => setSuccess(null), 3000);
                } catch (error: any) {
                  setError(error.response?.data?.message || 'Erreur lors de la mise à jour');
                } finally {
                  setIsSaving(false);
                }
              }}
              className="space-y-6 max-w-4xl"
            >
              <div className="bg-gradient-to-br from-orange-50/50 to-white rounded-xl p-6 border border-orange-100 space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-8 bg-orange-500 rounded-full"></div>
                  <h3 className="text-xl font-bold text-foreground">Préférences SMS</h3>
                </div>

                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg mb-6">
                  <p className="text-sm text-blue-800">
                    <strong>Note :</strong> Les SMS OTP (codes de vérification) sont toujours activés pour des raisons de sécurité et ne peuvent pas être désactivés.
                  </p>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <Label className="text-base font-semibold mb-1">Activer les notifications SMS</Label>
                    <p className="text-sm text-muted-foreground">Activez ou désactivez toutes les notifications SMS</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smsPreferences.enabled}
                      onChange={(e) => setSmsPreferences({ ...smsPreferences, enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                <div className="border-t border-border pt-6">
                  <h3 className="text-lg font-semibold mb-4">Types de notifications</h3>
                  <div className="space-y-3">
                    {[
                      { key: 'appointment_confirmed', label: 'Confirmation de rendez-vous', icon: '📅' },
                      { key: 'appointment_cancelled', label: 'Annulation de rendez-vous', icon: '❌' },
                      { key: 'appointment_updated', label: 'Modification de rendez-vous', icon: '✏️' },
                      { key: 'appointment_reminder', label: 'Rappel de rendez-vous', icon: '⏰' },
                      { key: 'dossier_created', label: 'Création de dossier', icon: '📁' },
                      { key: 'dossier_updated', label: 'Mise à jour de dossier', icon: '🔄' },
                      { key: 'dossier_status_changed', label: 'Changement de statut de dossier', icon: '📊' },
                      { key: 'document_uploaded', label: 'Document ajouté', icon: '📄' },
                      { key: 'message_received', label: 'Nouveau message', icon: '💬' },
                      { key: 'task_assigned', label: 'Tâche assignée', icon: '✅' },
                      { key: 'task_reminder', label: 'Rappel de tâche', icon: '⏳' },
                      { key: 'account_security', label: 'Sécurité du compte', icon: '🔒' },
                      { key: 'otp', label: 'Codes OTP (toujours activé)', icon: '🔐', disabled: true },
                    ].map((type) => (
                      <div
                        key={type.key}
                        className={`flex items-center justify-between p-4 rounded-lg border ${
                          smsPreferences.types[type.key as keyof typeof smsPreferences.types]
                            ? 'bg-green-50 border-green-200'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{type.icon}</span>
                          <div>
                            <Label className="text-sm font-semibold mb-0">{type.label}</Label>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={smsPreferences.types[type.key as keyof typeof smsPreferences.types] || false}
                            onChange={(e) =>
                              setSmsPreferences({
                                ...smsPreferences,
                                types: {
                                  ...smsPreferences.types,
                                  [type.key]: e.target.checked,
                                },
                              })
                            }
                            disabled={type.disabled || !smsPreferences.enabled}
                            className="sr-only peer"
                          />
                          <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary ${type.disabled || !smsPreferences.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/admin')}
                  disabled={isSaving}
                  className="px-6 py-2.5 font-semibold border-2 hover:bg-gray-50"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all"
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⏳</span>
                      <span>Enregistrement...</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span>📱</span>
                      <span>Enregistrer les préférences</span>
                    </span>
                  )}
                </Button>
              </div>
            </form>
          )}
          </div>
        </div>
      </main>
    </div>
  );
}

