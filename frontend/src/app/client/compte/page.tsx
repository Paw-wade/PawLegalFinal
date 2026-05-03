'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useRef } from 'react';
import Link from 'next/link';
import { userAPI, smsPreferencesAPI, pushAPI } from '@/lib/api';
import { ensurePushSubscription } from '@/lib/pushClient';
import { mergeProfileFormValuesFromDom } from '@/lib/profilePhoto';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';
import { Toast } from '@/components/ui/Toast';

function Button({ children, variant = 'default', className = '', disabled = false, ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} disabled={disabled} {...props}>{children}</button>;
}

function Input({ className = '', type, value, onChange, id, name, autoComplete, ...props }: any) {
  const resolvedName = name || id;
  const normalizedField = String(resolvedName || '').toLowerCase();
  const inferredAutoCompleteByField =
    normalizedField === 'firstname'
      ? 'given-name'
      : normalizedField === 'lastname'
        ? 'family-name'
        : normalizedField === 'email'
          ? 'email'
          : normalizedField === 'phone'
            ? 'tel'
            : normalizedField === 'adresspostale' || normalizedField === 'adressepostale'
              ? 'street-address'
              : normalizedField === 'ville'
                ? 'address-level2'
                : normalizedField === 'codepostal'
                  ? 'postal-code'
                  : normalizedField === 'pays'
                    ? 'country-name'
                    : normalizedField === 'datenaissance'
                      ? 'bday'
                      : (normalizedField === 'datedelivrance' || normalizedField === 'dateexpiration')
                        ? 'off'
                        : undefined;
  const resolvedAutoComplete =
    autoComplete ||
    inferredAutoCompleteByField ||
    (type === 'email'
      ? 'email'
      : type === 'tel'
        ? 'tel'
        : type === 'password'
          ? 'current-password'
          : type === 'date'
            ? 'off'
            : 'on');

  // Pour les champs de date, utiliser le composant DateInput qui garantit le format jour/mois/année
  if (type === 'date') {
    return (
      <DateInputComponent
        id={id}
        name={resolvedName}
        autoComplete={resolvedAutoComplete}
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
      id={id}
      name={resolvedName}
      autoComplete={resolvedAutoComplete}
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

export default function ComptePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const errorRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<'profil' | 'password' | 'sms'>('profil');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingPushTest, setIsSendingPushTest] = useState(false);
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Données du profil - Tous les champs seront automatiquement pré-remplis avec les données de la base
  // lors du chargement du profil via loadProfile()
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
  // L'utilisateur doit toujours saisir son mot de passe actuel pour le changer
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
    } else if (session && !(session.user as any).profilComplete) {
      router.push('/auth/complete-profile');
    } else if (session) {
      // Si admin, rediriger vers /admin
      if ((session.user as any)?.role === 'admin' || (session.user as any)?.role === 'superadmin') {
        router.push('/admin');
      }
    }
  }, [session, status, router]);

  useEffect(() => {
    // Charger le profil automatiquement lorsque l'utilisateur est authentifié
    // Le formulaire sera pré-rempli avec toutes les données existantes
    // Les préférences SMS sont chargées directement dans loadProfile() pour éviter un double appel API
    if (status === 'authenticated' && session) {
      loadProfile();
    }
  }, [status, session]);

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('🔄 Chargement du profil utilisateur...');
      const response = await userAPI.getProfile();
      
      if (response.data.success) {
        const user = response.data.user || response.data.data;
        console.log('✅ Profil chargé:', { 
          firstName: user.firstName, 
          lastName: user.lastName, 
          email: user.email,
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
        setIsEditingProfile(false);
        
        // Charger aussi les préférences SMS depuis les mêmes données
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
              otp: true, // Toujours activé pour sécurité
            }
          });
          console.log('✅ Préférences SMS chargées depuis le profil');
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

  const loadSmsPreferences = async () => {
    try {
      const response = await userAPI.getProfile();
      if (response.data.success) {
        const user = response.data.user || response.data.data;
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
              otp: true, // Toujours activé pour sécurité
            }
          });
          console.log('✅ Préférences SMS chargées:', user.smsPreferences);
        }
      }
    } catch (error: any) {
      console.error('❌ Erreur lors du chargement des préférences SMS:', error);
      // Ne pas afficher d'erreur, utiliser les valeurs par défaut
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const merged = mergeProfileFormValuesFromDom(profileData as Record<string, string>, {
      includeSejour: true,
      includeAccountFields: true,
    }) as typeof profileData;

    const payload = {
      firstName: merged.firstName ?? '',
      lastName: merged.lastName ?? '',
      phone: merged.phone ?? '',
      email: merged.email ?? '',
      dateNaissance: merged.dateNaissance || undefined,
      lieuNaissance: merged.lieuNaissance ?? '',
      nationalite: merged.nationalite ?? '',
      sexe: merged.sexe ?? '',
      numeroEtranger: merged.numeroEtranger ?? '',
      typeTitre: merged.typeTitre ?? '',
      dateDelivrance: merged.dateDelivrance || undefined,
      dateExpiration: merged.dateExpiration || undefined,
      adressePostale: merged.adressePostale ?? '',
      ville: merged.ville ?? '',
      codePostal: merged.codePostal ?? '',
      pays: merged.pays ?? 'France',
    };

    const doUpdate = () => userAPI.updateProfile(payload);
    let response: any;

    try {
      response = await doUpdate();
      const data = response?.data;
      if (data && data.success) {
        setSuccess('Profil mis à jour avec succès');
        setTimeout(() => setSuccess(null), 3000);
        await loadProfile();
      } else {
        setError((data && data.message) || 'Erreur lors de la mise à jour du profil');
      }
    } catch (error: any) {
      const status = error.response?.status;
      const data = error.response?.data;

      if (status === 401) {
        try {
          const { getSession } = await import('next-auth/react');
          const newSession = await getSession();
          const newToken = (newSession?.user as any)?.accessToken;
          if (newToken && typeof window !== 'undefined') {
            localStorage.setItem('token', newToken);
            response = await doUpdate();
            const resData = response?.data;
            if (resData && resData.success) {
              setSuccess('Profil mis à jour avec succès');
              setTimeout(() => setSuccess(null), 3000);
              await loadProfile();
            } else {
              setError((resData && resData.message) || 'Erreur lors de la mise à jour du profil');
            }
            return;
          }
        } catch (retryErr) {
          console.error('Retry après 401 échoué:', retryErr);
        }
        setError('Session expirée. Veuillez vous reconnecter, puis réessayer.');
      } else {
        const message = data?.message || error.message || 'Erreur lors de la mise à jour du profil';
        const details = data?.errors;
        const fullMessage = Array.isArray(details) && details.length > 0
          ? `${message} (${details.join(', ')})`
          : message;
        setError(fullMessage);
      }
      console.error('Erreur lors de la mise à jour du profil:', error);
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

  const handlePushTest = async () => {
    setError(null);
    setSuccess(null);
    setIsSendingPushTest(true);
    try {
      const response = await pushAPI.sendTest();
      const sent = Number(response?.data?.result?.sent || 0);
      if (sent > 0) {
        setSuccess(`Push test envoyé (${sent} appareil${sent > 1 ? 's' : ''}).`);
      } else {
        setSuccess('Test envoyé, mais aucun appareil abonné actif n’a été trouvé.');
      }
      setTimeout(() => setSuccess(null), 3500);
    } catch (error: any) {
      setError(error?.response?.data?.message || 'Impossible d’envoyer le push test.');
    } finally {
      setIsSendingPushTest(false);
    }
  };

  const handleEnablePush = async () => {
    setError(null);
    setSuccess(null);
    setIsEnablingPush(true);
    try {
      const result = await ensurePushSubscription({ requestPermission: true });
      if (result.ok) {
        setSuccess('Notifications push activées sur cet appareil.');
      } else if (result.reason === 'permission_required') {
        setError('Veuillez autoriser les notifications dans votre navigateur.');
      } else if (result.reason === 'denied') {
        setError('Notifications refusées dans le navigateur (paramètres à modifier).');
      } else if (result.reason === 'server_not_configured') {
        setError('Serveur push non configuré (clés VAPID manquantes).');
      } else {
        setError('Ce navigateur ne supporte pas les notifications push.');
      }
    } catch (error: any) {
      setError(error?.response?.data?.message || 'Impossible d’activer les notifications push.');
    } finally {
      setIsEnablingPush(false);
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

  if (!session) {
    return null;
  }

  const userRole = (session.user as any)?.role ?? 'client';
  const isClient = userRole === 'client';

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 overflow-x-hidden max-w-[100vw]">
      <Toast message={success || ''} visible={!!success} />
      <main className="w-full px-3 sm:px-4 py-5 sm:py-8">
        {/* En-tête amélioré */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-2xl">
                {session?.user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-4xl font-bold mb-1 sm:mb-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Mon compte
              </h1>
              <p className="text-muted-foreground text-sm sm:text-lg">Gérez vos informations personnelles et vos paramètres de sécurité</p>
            </div>
          </div>
        </div>

        {/* Onglets améliorés */}
        <div className="mb-6 sm:mb-8 bg-white rounded-xl shadow-md p-2 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('profil')}
            className={`px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 whitespace-nowrap ${
              activeTab === 'profil'
                ? 'bg-primary text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-sm sm:text-base">👤</span>
              <span>Informations personnelles</span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 whitespace-nowrap ${
              activeTab === 'password'
                ? 'bg-primary text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-sm sm:text-base">🔒</span>
              <span>Mot de passe</span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab('sms')}
            className={`px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 whitespace-nowrap ${
              activeTab === 'sms'
                ? 'bg-primary text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-sm sm:text-base">📱</span>
              <span>Notifications SMS</span>
            </span>
          </button>
        </div>

        {/* Messages d'erreur et de succès améliorés */}
        {error && (
          <div
            ref={errorRef}
            className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm animate-in slide-in-from-top-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-lg shadow-sm animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">✅</span>
              <p className="text-sm font-medium text-green-800">{success}</p>
            </div>
          </div>
        )}

        {/* Contenu des onglets */}
        {activeTab === 'profil' && (
          <div className="bg-white rounded-xl shadow-lg border border-border overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-4 sm:px-8 py-5 sm:py-6 border-b border-border">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2 sm:gap-3">
                <span className="text-2xl sm:text-3xl">👤</span>
                <span>Informations personnelles</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-2">Mettez à jour vos informations de profil</p>
            </div>
            <form onSubmit={handleProfileSubmit} className="p-4 sm:p-8 space-y-7 sm:space-y-8" autoComplete="on">
              <fieldset
                aria-disabled={!isEditingProfile}
                className={!isEditingProfile ? 'opacity-100 pointer-events-none' : ''}
              >
              {/* Informations de base */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl">📋</span>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Informations de base</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-sm font-semibold">Prénom</Label>
                    <Input
                      id="firstName"
                      type="text"
                      value={profileData.firstName}
                      onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                      className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                      placeholder="Votre prénom"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-sm font-semibold">Nom</Label>
                    <Input
                      id="lastName"
                      type="text"
                      value={profileData.lastName}
                      onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                      className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                      placeholder="Votre nom"
                    />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                      className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                      placeholder="votre@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-semibold">Téléphone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                      placeholder="+33 6 12 34 56 78"
                    />
                  </div>
                </div>
              </div>

              {/* Séparateur */}
              <div className="border-t border-border"></div>

              {/* Informations personnelles */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl">🆔</span>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Informations personnelles</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="dateNaissance" className="text-sm font-semibold">Date de naissance</Label>
                    <Input
                      id="dateNaissance"
                      type="date"
                      value={profileData.dateNaissance}
                      onChange={(e) => setProfileData({ ...profileData, dateNaissance: e.target.value })}
                      className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lieuNaissance" className="text-sm font-semibold">Lieu de naissance</Label>
                    <Input
                      id="lieuNaissance"
                      type="text"
                      value={profileData.lieuNaissance}
                      onChange={(e) => setProfileData({ ...profileData, lieuNaissance: e.target.value })}
                      className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                      placeholder="Ville, Pays"
                    />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="nationalite" className="text-sm font-semibold">Nationalité</Label>
                    <Input
                      id="nationalite"
                      type="text"
                      value={profileData.nationalite}
                      onChange={(e) => setProfileData({ ...profileData, nationalite: e.target.value })}
                      className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                      placeholder="Ex: Française, Algérienne..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sexe" className="text-sm font-semibold">Sexe</Label>
                    <select
                      id="sexe"
                      value={profileData.sexe}
                      onChange={(e) => setProfileData({ ...profileData, sexe: e.target.value })}
                      className="mt-1 flex h-11 w-full rounded-md border-2 border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:border-primary transition-colors"
                    >
                      <option value="">Sélectionner</option>
                      <option value="M">Masculin</option>
                      <option value="F">Féminin</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Séparateur */}
              <div className="border-t border-border"></div>

              {/* Informations de séjour — obligatoire pour les comptes client uniquement */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl">🛂</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Informations de séjour</h3>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numeroEtranger" className="text-sm font-semibold">Numéro d'étranger</Label>
                  <Input
                    id="numeroEtranger"
                    type="text"
                    value={profileData.numeroEtranger}
                    onChange={(e) => setProfileData({ ...profileData, numeroEtranger: e.target.value })}
                    className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                    placeholder="Ex: 12AB34567"
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="typeTitre" className="text-sm font-semibold">
                      Type de titre
                    </Label>
                    <Input
                      id="typeTitre"
                      type="text"
                      value={profileData.typeTitre}
                      onChange={(e) => setProfileData({ ...profileData, typeTitre: e.target.value })}
                      placeholder="Ex: Carte de séjour, Visa, etc."
                      className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                    />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="dateDelivrance" className="text-sm font-semibold">
                      Date de délivrance
                    </Label>
                    <Input
                      id="dateDelivrance"
                      type="date"
                      value={profileData.dateDelivrance}
                      onChange={(e) => setProfileData({ ...profileData, dateDelivrance: e.target.value })}
                      className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateExpiration" className="text-sm font-semibold">
                      Date d'expiration
                    </Label>
                    <Input
                      id="dateExpiration"
                      type="date"
                      value={profileData.dateExpiration}
                      onChange={(e) => setProfileData({ ...profileData, dateExpiration: e.target.value })}
                      className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Séparateur */}
              <div className="border-t border-border"></div>

              {/* Adresse */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl">📍</span>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Adresse</h3>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adressePostale" className="text-sm font-semibold">Adresse postale</Label>
                  <Input
                    id="adressePostale"
                    type="text"
                    value={profileData.adressePostale}
                    onChange={(e) => setProfileData({ ...profileData, adressePostale: e.target.value })}
                    className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                    placeholder="Numéro et nom de rue"
                  />
                </div>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="ville" className="text-sm font-semibold">Ville</Label>
                    <Input
                      id="ville"
                      type="text"
                      value={profileData.ville}
                      onChange={(e) => setProfileData({ ...profileData, ville: e.target.value })}
                      className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                      placeholder="Ville"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="codePostal" className="text-sm font-semibold">Code postal</Label>
                    <Input
                      id="codePostal"
                      type="text"
                      value={profileData.codePostal}
                      onChange={(e) => setProfileData({ ...profileData, codePostal: e.target.value })}
                      className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                      placeholder="75001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pays" className="text-sm font-semibold">Pays</Label>
                    <Input
                      id="pays"
                      type="text"
                      value={profileData.pays}
                      onChange={(e) => setProfileData({ ...profileData, pays: e.target.value })}
                      className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                      placeholder="France"
                    />
                  </div>
                </div>
              </div>
              </fieldset>

              {/* Boutons d'action améliorés */}
              <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 pt-6 border-t border-border">
                {!isEditingProfile ? (
                  <>
                    <Button
                      type="button"
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.preventDefault();
                        setIsEditingProfile(true);
                      }}
                      className="w-full sm:flex-1 h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
                    >
                      <span className="flex items-center gap-2">
                        <span>✏️</span>
                        <span>Modifier</span>
                      </span>
                    </Button>
                    <Link href="/client" className="w-full sm:w-auto">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full h-12 px-6 border-2 hover:bg-accent transition-colors"
                      >
                        Retour
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <Button
                      type="submit"
                      disabled={isSaving}
                      className="w-full sm:flex-1 h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
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
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto h-12 px-6 border-2 hover:bg-accent transition-colors"
                      onClick={async () => {
                        await loadProfile();
                        setIsEditingProfile(false);
                      }}
                    >
                      Annuler
                    </Button>
                  </>
                )}
              </div>
            </form>
          </div>
        )}

        {activeTab === 'password' && (
          <div className="bg-white rounded-xl shadow-lg border border-border overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-4 sm:px-8 py-5 sm:py-6 border-b border-border">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2 sm:gap-3">
                <span className="text-2xl sm:text-3xl">🔒</span>
                <span>Changer le mot de passe</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-2">Mettez à jour votre mot de passe pour sécuriser votre compte</p>
            </div>
            <div className="p-4 sm:p-8 space-y-8 sm:space-y-10">
              <form onSubmit={handlePasswordSubmit} className="space-y-6 max-w-2xl" autoComplete="on">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg mb-6">
                  <p className="text-sm text-blue-800">
                    <strong>Conseil de sécurité :</strong> Utilisez un mot de passe fort contenant au moins 8 caractères, avec des majuscules, minuscules, chiffres et symboles.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="currentPassword" className="text-sm font-semibold">Mot de passe actuel *</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    required
                    className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                    placeholder="Entrez votre mot de passe actuel"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-sm font-semibold">Nouveau mot de passe *</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    required
                    minLength={8}
                    className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                    placeholder="Minimum 8 caractères"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Le mot de passe doit contenir au moins 8 caractères
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-semibold">Confirmer le nouveau mot de passe *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    required
                    className="mt-1 h-11 border-2 focus:border-primary transition-colors"
                    placeholder="Confirmez votre nouveau mot de passe"
                  />
                  {passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
                    <p className="text-xs text-red-600 mt-1">⚠️ Les mots de passe ne correspondent pas</p>
                  )}
                  {passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword === passwordData.confirmPassword && (
                    <p className="text-xs text-green-600 mt-1">✅ Les mots de passe correspondent</p>
                  )}
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-6 border-t border-border">
                  <Button 
                    type="submit" 
                    disabled={isSaving || (passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword)} 
                    className="w-full sm:flex-1 h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
                  >
                    {isSaving ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin">⏳</span>
                        <span>Modification...</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span>🔐</span>
                        <span>Modifier le mot de passe</span>
                      </span>
                    )}
                  </Button>
                </div>
              </form>

              {/* Désactivation du compte */}
              <div className="border-t border-border pt-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6 max-w-2xl">
                <div>
                  <h3 className="text-base font-semibold text-red-600 flex items-center gap-2">
                    <span>🛑</span>
                    <span>Désactiver mon compte</span>
                  </h3>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto border-red-500 text-red-600 hover:bg-red-50"
                  disabled={isSaving}
                  onClick={async () => {
                    const confirmed = window.confirm(
                      "Êtes-vous sûr de vouloir désactiver votre compte ? Vous ne pourrez plus vous connecter sans passer par l'équipe Ada Papers."
                    );
                    if (!confirmed) return;
                    try {
                      setIsSaving(true);
                      setError(null);
                      const response = await userAPI.deactivateMyAccount();
                      if (response.data?.success) {
                        alert('Votre compte a été désactivé. Vous allez être déconnecté.');
                        await signOut({ callbackUrl: '/' });
                      } else {
                        setError(response.data?.message || 'Impossible de désactiver le compte');
                      }
                    } catch (e: any) {
                      setError(e?.response?.data?.message || 'Erreur lors de la désactivation du compte');
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                >
                  Désactiver mon compte
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sms' && (
          <div className="bg-white rounded-xl shadow-lg border border-border overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-4 sm:px-8 py-5 sm:py-6 border-b border-border">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2 sm:gap-3">
                <span className="text-2xl sm:text-3xl">📱</span>
                <span>Préférences SMS</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-2">Gérez les notifications SMS que vous souhaitez recevoir</p>
            </div>
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
              className="p-4 sm:p-8 space-y-6"
            >
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg mb-6">
                <p className="text-sm text-blue-800">
                  <strong>Note :</strong> Les SMS OTP (codes de vérification) sont toujours activés pour des raisons de sécurité et ne peuvent pas être désactivés.
                </p>
              </div>

              <div className="space-y-4">
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

              <div className="flex justify-end pt-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isEnablingPush}
                    onClick={handleEnablePush}
                    className="px-6 py-3 border-2"
                  >
                    {isEnablingPush ? 'Activation...' : 'Activer les notifications push'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSendingPushTest}
                    onClick={handlePushTest}
                    className="px-6 py-3 border-2"
                  >
                    {isSendingPushTest ? 'Envoi du push...' : 'Envoyer push test'}
                  </Button>
                  <Button type="submit" disabled={isSaving} className="px-8 py-3">
                    {isSaving ? 'Enregistrement...' : 'Enregistrer les préférences'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

