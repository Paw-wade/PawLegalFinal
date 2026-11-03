'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { userAPI, smsPreferencesAPI, pushAPI } from '@/lib/api';
import { ensurePushSubscription } from '@/lib/pushClient';
import { mergeProfileFormValuesFromDom } from '@/lib/profilePhoto';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';
import { Toast } from '@/components/ui/Toast';

function Button({ children, variant = 'default', className = '', disabled = false, ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses: Record<string, string> = {
    default: 'bg-orange-500 text-white hover:bg-orange-600',
    outline: 'border border-gray-200 bg-white hover:bg-gray-50 text-gray-700',
    ghost: 'hover:bg-gray-100 text-gray-700',
    danger: 'border border-red-300 text-red-600 bg-white hover:bg-red-50',
  };
  return (
    <button
      className={`${baseClasses} ${variantClasses[variant] || variantClasses.default} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

function Input({ className = '', type, value, onChange, id, name, autoComplete, ...props }: any) {
  const resolvedName = name || id;
  const normalizedField = String(resolvedName || '').toLowerCase();
  const inferredAutoCompleteByField =
    normalizedField === 'firstname' ? 'given-name'
    : normalizedField === 'lastname' ? 'family-name'
    : normalizedField === 'email' ? 'email'
    : normalizedField === 'phone' ? 'tel'
    : (normalizedField === 'adresspostale' || normalizedField === 'adressepostale') ? 'street-address'
    : normalizedField === 'ville' ? 'address-level2'
    : normalizedField === 'codepostal' ? 'postal-code'
    : normalizedField === 'pays' ? 'country-name'
    : normalizedField === 'datenaissance' ? 'bday'
    : (normalizedField === 'datedelivrance' || normalizedField === 'dateexpiration') ? 'off'
    : undefined;
  const resolvedAutoComplete =
    autoComplete || inferredAutoCompleteByField ||
    (type === 'email' ? 'email' : type === 'tel' ? 'tel' : type === 'password' ? 'current-password' : type === 'date' ? 'off' : 'on');

  if (type === 'date') {
    return (
      <DateInputComponent
        id={id}
        name={resolvedName}
        autoComplete={resolvedAutoComplete}
        value={value || ''}
        onChange={(newValue) => {
          if (onChange) {
            const syntheticEvent = { target: { value: newValue }, currentTarget: { value: newValue } } as React.ChangeEvent<HTMLInputElement>;
            onChange(syntheticEvent);
          }
        }}
        className={`flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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
      className={`flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function Label({ className = '', children, ...props }: any) {
  return (
    <label className={`text-sm font-medium text-gray-700 ${className}`} {...props}>
      {children}
    </label>
  );
}

function Textarea({ className = '', id, name, autoComplete, ...props }: any) {
  const resolvedName = name || id;
  return (
    <textarea
      id={id}
      name={resolvedName}
      autoComplete={autoComplete || 'street-address'}
      className={`flex min-h-[80px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
        <div className="w-1 h-4 bg-orange-500 rounded-full" aria-hidden="true" />
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
      </div>
      <div className="px-5 divide-y divide-gray-50">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between items-start py-3 gap-4">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-medium text-right">
        {value || <span className="text-gray-400 font-normal italic">Non renseigne</span>}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-1 h-6 bg-orange-500 rounded-full" aria-hidden="true" />
      <h3 className="text-base font-medium text-gray-800">{children}</h3>
    </div>
  );
}

export default function AdminComptePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<'profil' | 'password' | 'sms'>('profil');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingPushTest, setIsSendingPushTest] = useState(false);
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [pushStatus, setPushStatus] = useState<
    'checking' | 'enabled' | 'denied' | 'default' | 'unsupported' | 'server_not_configured'
  >('checking');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

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
      otp: true,
    },
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (session) {
      const userRole = (session.user as any)?.role;
      const isAuthorized = userRole === 'admin' || userRole === 'superadmin';
      if (!isAuthorized) {
        router.push('/client');
      }
    }
  }, [session, status, router]);

  useEffect(() => {
    if (status === 'authenticated' && session && ((session.user as any)?.role === 'admin' || (session.user as any)?.role === 'superadmin')) {
      loadProfile();
    }
  }, [status, session]);

  useEffect(() => {
    const checkPushStatus = async () => {
      if (typeof window === 'undefined') return;
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushStatus('unsupported');
        return;
      }
      const permission = Notification.permission;
      if (permission === 'denied') { setPushStatus('denied'); return; }
      if (permission === 'default') { setPushStatus('default'); return; }
      try {
        const registration = await navigator.serviceWorker.getRegistration('/sw.js');
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) { setPushStatus('enabled'); return; }
      } catch {}
      try {
        await pushAPI.getPublicKey();
        setPushStatus('default');
      } catch {
        setPushStatus('server_not_configured');
      }
    };
    if (status === 'authenticated') checkPushStatus();
  }, [status]);

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await userAPI.getProfile();
      if (response.data.success) {
        const user = response.data.user || response.data.data;
        const formatDate = (dateValue: any): string => {
          if (!dateValue) return '';
          try {
            const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
            if (isNaN(date.getTime())) return '';
            return date.toISOString().split('T')[0];
          } catch { return ''; }
        };
        setProfileData({
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
        });
        setIsEditingProfile(false);
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
              otp: true,
            },
          });
        }
      } else {
        setError('Impossible de charger le profil');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement du profil');
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
        numeroTitre: merged.numeroTitre ?? '',
        typeTitre: merged.typeTitre ?? '',
        dateDelivrance: merged.dateDelivrance || undefined,
        dateExpiration: merged.dateExpiration || undefined,
        adressePostale: merged.adressePostale ?? '',
        ville: merged.ville ?? '',
        codePostal: merged.codePostal ?? '',
        pays: merged.pays ?? 'France',
      };
      const response = await userAPI.updateProfile(payload);
      const data = response?.data;
      if (data && data.success) {
        setSuccess('Profil mis a jour avec succes');
        setTimeout(() => setSuccess(null), 3000);
        await loadProfile();
      } else {
        setError((data && data.message) || 'Erreur lors de la mise a jour du profil');
      }
    } catch (err: any) {
      const st = err.response?.status;
      const message = err.response?.data?.message || err.message || 'Erreur lors de la mise a jour du profil';
      if (st === 401) {
        setError('Session expiree. Veuillez vous reconnecter, puis reessayer.');
      } else {
        setError(message);
      }
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
      setError('Le nouveau mot de passe doit contenir au moins 8 caracteres');
      setIsSaving(false);
      return;
    }
    try {
      const response = await userAPI.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      if (response.data.success) {
        setSuccess('Mot de passe modifie avec succes');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du changement de mot de passe');
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
        setSuccess(`Push test envoye (${sent} appareil${sent > 1 ? 's' : ''}).`);
      } else {
        setSuccess('Test envoye, mais aucun appareil abonne actif trouve.');
      }
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Impossible d\'envoyer le push test.');
    } finally {
      setIsSendingPushTest(false);
      if (typeof window !== 'undefined' && Notification.permission === 'granted') {
        setPushStatus('enabled');
      }
    }
  };

  const handleEnablePush = async () => {
    setError(null);
    setSuccess(null);
    setIsEnablingPush(true);
    try {
      const result = await ensurePushSubscription({ requestPermission: true });
      if (result.ok) {
        setPushStatus('enabled');
        setSuccess('Notifications push activees sur cet appareil.');
      } else if (result.reason === 'permission_required') {
        setPushStatus('default');
        setError('Veuillez autoriser les notifications dans votre navigateur.');
      } else if (result.reason === 'denied') {
        setPushStatus('denied');
        setError('Notifications refusees dans le navigateur (parametres a modifier).');
      } else if (result.reason === 'server_not_configured') {
        setPushStatus('server_not_configured');
        setError('Serveur push non configure (cles VAPID manquantes).');
      } else {
        setPushStatus('unsupported');
        setError('Ce navigateur ne supporte pas les notifications push.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Impossible d\'activer les notifications push.');
    } finally {
      setIsEnablingPush(false);
    }
  };

  const pushStatusLabel =
    pushStatus === 'enabled' ? 'Actif'
    : pushStatus === 'denied' ? 'Refuse'
    : pushStatus === 'default' ? 'A autoriser'
    : pushStatus === 'unsupported' ? 'Non supporte'
    : pushStatus === 'server_not_configured' ? 'Serveur non configure'
    : 'Verification...';

  const pushStatusClasses =
    pushStatus === 'enabled' ? 'bg-green-50 text-green-700 border-green-200'
    : (pushStatus === 'denied' || pushStatus === 'server_not_configured') ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!session || ((session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin')) {
    return null;
  }

  const firstInitial = (profileData.firstName || '').charAt(0).toUpperCase();
  const lastInitial = (profileData.lastName || '').charAt(0).toUpperCase();
  const initials = (firstInitial + lastInitial) || (session?.user?.name?.charAt(0)?.toUpperCase() ?? 'A');
  const fullName = [profileData.firstName, profileData.lastName].filter(Boolean).join(' ') || session?.user?.name || '';
  const userRole = (session.user as any)?.role ?? 'admin';
  const roleLabel = userRole === 'superadmin' ? 'Super administrateur' : 'Administrateur';

  const displayDate = (iso: string): string => {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const sexeLabel: Record<string, string> = { M: 'Masculin', F: 'Feminin', Autre: 'Autre' };
  const typeTitreLabel: Record<string, string> = {
    visiteur: 'Visiteur',
    etudiant: 'Etudiant',
    salarie: 'Salarie',
    travailleur_temporaire: 'Travailleur temporaire',
    scientifique: 'Scientifique',
    artiste: 'Artiste',
    commercant: 'Commercant',
    autre: 'Autre',
  };

  const tabs = [
    { key: 'profil', label: 'Profil' },
    { key: 'password', label: 'Securite' },
    { key: 'sms', label: 'Notifications SMS' },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50/40">
      <Toast message={success || ''} visible={!!success} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* Profile header */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col sm:flex-row gap-4 sm:items-center">
          <div
            className="w-16 h-16 rounded-full bg-orange-500 flex items-center justify-center text-white text-xl font-medium flex-shrink-0 select-none"
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-medium text-gray-900">{fullName || 'Mon profil'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{roleLabel}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                {roleLabel}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                Actif
              </span>
            </div>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-1 text-xs text-gray-500">
            {profileData.email && (
              <span>Email: <span className="text-gray-800 font-medium">{profileData.email}</span></span>
            )}
            {profileData.phone && (
              <span>Tel: <span className="text-gray-800 font-medium">{profileData.phone}</span></span>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-0 border-b border-gray-200 overflow-x-auto bg-white rounded-t-xl">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Messages */}
        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5">&#x26A0;</span>
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-3.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            {success}
          </div>
        )}

        {/* ---- Tab: Profil - vue ---- */}
        {activeTab === 'profil' && !isEditingProfile && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => setIsEditingProfile(true)}
                className="px-4 py-2 text-sm"
              >
                Modifier le profil
              </Button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <InfoCard title="Informations de base">
                <InfoRow label="Prenom" value={profileData.firstName} />
                <InfoRow label="Nom" value={profileData.lastName} />
                <InfoRow label="Email" value={profileData.email} />
                <InfoRow label="Telephone" value={profileData.phone} />
                <InfoRow label="Date de naissance" value={displayDate(profileData.dateNaissance)} />
                <InfoRow label="Lieu de naissance" value={profileData.lieuNaissance} />
                <InfoRow label="Nationalite" value={profileData.nationalite} />
                <InfoRow label="Sexe" value={sexeLabel[profileData.sexe] || profileData.sexe} />
              </InfoCard>
              <InfoCard title="Informations administratives">
                <InfoRow label="Numero d'etranger" value={profileData.numeroEtranger} />
                <InfoRow label="Numero de titre" value={profileData.numeroTitre} />
                <InfoRow label="Type de titre" value={typeTitreLabel[profileData.typeTitre] || profileData.typeTitre} />
                <InfoRow label="Date de delivrance" value={displayDate(profileData.dateDelivrance)} />
                <InfoRow label="Date d'expiration" value={displayDate(profileData.dateExpiration)} />
              </InfoCard>
              <InfoCard title="Adresse">
                <InfoRow label="Adresse" value={profileData.adressePostale} />
                <InfoRow label="Ville" value={profileData.ville} />
                <InfoRow label="Code postal" value={profileData.codePostal} />
                <InfoRow label="Pays" value={profileData.pays} />
              </InfoCard>
            </div>
          </div>
        )}

        {/* ---- Tab: Profil - edition ---- */}
        {activeTab === 'profil' && isEditingProfile && (
          <form onSubmit={handleProfileSubmit} className="bg-white rounded-xl border border-gray-100 p-6 space-y-8" autoComplete="on">
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Colonne gauche */}
              <div className="space-y-5">
                <SectionTitle>Informations de base</SectionTitle>
                <div>
                  <Label htmlFor="firstName" className="block mb-1.5">Prenom</Label>
                  <Input id="firstName" value={profileData.firstName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData({ ...profileData, firstName: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="lastName" className="block mb-1.5">Nom</Label>
                  <Input id="lastName" value={profileData.lastName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData({ ...profileData, lastName: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="email" className="block mb-1.5">Email</Label>
                  <Input id="email" type="email" value={profileData.email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData({ ...profileData, email: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="phone" className="block mb-1.5">Telephone</Label>
                  <Input id="phone" type="tel" value={profileData.phone} placeholder="+33 6 12 34 56 78"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData({ ...profileData, phone: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="dateNaissance" className="block mb-1.5">Date de naissance</Label>
                  <Input id="dateNaissance" type="date" value={profileData.dateNaissance}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData({ ...profileData, dateNaissance: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="lieuNaissance" className="block mb-1.5">Lieu de naissance</Label>
                  <Input id="lieuNaissance" value={profileData.lieuNaissance} placeholder="Ville, Pays"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData({ ...profileData, lieuNaissance: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="nationalite" className="block mb-1.5">Nationalite</Label>
                  <Input id="nationalite" value={profileData.nationalite} placeholder="Ex: Francaise"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData({ ...profileData, nationalite: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="sexe" className="block mb-1.5">Sexe</Label>
                  <select
                    id="sexe"
                    value={profileData.sexe}
                    onChange={(e) => setProfileData({ ...profileData, sexe: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                  >
                    <option value="">Selectionner</option>
                    <option value="M">Masculin</option>
                    <option value="F">Feminin</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>
              </div>

              {/* Colonne droite */}
              <div className="space-y-5">
                <SectionTitle>Informations administratives</SectionTitle>
                <div>
                  <Label htmlFor="numeroEtranger" className="block mb-1.5">Numero d'etranger</Label>
                  <Input id="numeroEtranger" value={profileData.numeroEtranger} readOnly
                    className="bg-gray-50 text-gray-600 cursor-not-allowed" placeholder="Ex: 1234567890123" />
                  <p className="mt-1 text-xs text-gray-400">Ce numero est fige pour garantir la tracabilite des dossiers.</p>
                </div>
                <div>
                  <Label htmlFor="numeroTitre" className="block mb-1.5">Numero de titre de sejour</Label>
                  <Input id="numeroTitre" value={profileData.numeroTitre} placeholder="Ex: 12AB34567"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData({ ...profileData, numeroTitre: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="typeTitre" className="block mb-1.5">Type de titre</Label>
                  <select
                    id="typeTitre"
                    value={profileData.typeTitre}
                    onChange={(e) => setProfileData({ ...profileData, typeTitre: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                  >
                    <option value="">Selectionner</option>
                    <option value="visiteur">Visiteur</option>
                    <option value="etudiant">Etudiant</option>
                    <option value="salarie">Salarie</option>
                    <option value="travailleur_temporaire">Travailleur temporaire</option>
                    <option value="scientifique">Scientifique</option>
                    <option value="artiste">Artiste</option>
                    <option value="commercant">Commercant</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="dateDelivrance" className="block mb-1.5">Date de delivrance</Label>
                  <Input id="dateDelivrance" type="date" value={profileData.dateDelivrance}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData({ ...profileData, dateDelivrance: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="dateExpiration" className="block mb-1.5">Date d'expiration</Label>
                  <Input id="dateExpiration" type="date" value={profileData.dateExpiration}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData({ ...profileData, dateExpiration: e.target.value })} />
                </div>

                <div className="pt-2">
                  <SectionTitle>Adresse</SectionTitle>
                </div>
                <div>
                  <Label htmlFor="adressePostale" className="block mb-1.5">Adresse postale</Label>
                  <Textarea id="adressePostale" value={profileData.adressePostale} placeholder="Numero et nom de rue"
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setProfileData({ ...profileData, adressePostale: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="codePostal" className="block mb-1.5">Code postal</Label>
                    <Input id="codePostal" value={profileData.codePostal} placeholder="75001"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData({ ...profileData, codePostal: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="ville" className="block mb-1.5">Ville</Label>
                    <Input id="ville" value={profileData.ville} placeholder="Paris"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData({ ...profileData, ville: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="pays" className="block mb-1.5">Pays</Label>
                  <Input id="pays" value={profileData.pays} placeholder="France"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData({ ...profileData, pays: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-gray-100">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={async () => { await loadProfile(); setIsEditingProfile(false); }}
                className="px-5 py-2.5"
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSaving} className="px-5 py-2.5">
                {isSaving ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        )}

        {/* ---- Tab: Securite ---- */}
        {activeTab === 'password' && (
          <div className="space-y-4">
            <form onSubmit={handlePasswordSubmit} autoComplete="on">
              <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
                <SectionTitle>Changer le mot de passe</SectionTitle>
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                  Le mot de passe doit contenir au moins 8 caracteres.
                </div>
                <div className="max-w-md space-y-4">
                  <div>
                    <Label htmlFor="currentPassword" className="block mb-1.5">Mot de passe actuel</Label>
                    <Input id="currentPassword" type="password" autoComplete="current-password"
                      value={passwordData.currentPassword} required
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordData({ ...passwordData, currentPassword: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="newPassword" className="block mb-1.5">Nouveau mot de passe</Label>
                    <Input id="newPassword" type="password" autoComplete="new-password"
                      value={passwordData.newPassword} required minLength={8}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordData({ ...passwordData, newPassword: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword" className="block mb-1.5">Confirmer le nouveau mot de passe</Label>
                    <Input id="confirmPassword" type="password" autoComplete="new-password"
                      value={passwordData.confirmPassword} required minLength={8}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })} />
                    {passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
                      <p className="mt-1 text-xs text-red-600">Les mots de passe ne correspondent pas</p>
                    )}
                    {passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword === passwordData.confirmPassword && (
                      <p className="mt-1 text-xs text-green-600">Les mots de passe correspondent</p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={isSaving} className="px-5 py-2.5">
                    {isSaving ? 'Modification...' : 'Modifier le mot de passe'}
                  </Button>
                </div>
              </div>
            </form>

            {/* Push notifications */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <SectionTitle>Notifications push</SectionTitle>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${pushStatusClasses}`}>
                  Push: {pushStatusLabel}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isEnablingPush}
                  onClick={handleEnablePush}
                  className="px-4 py-2 text-sm"
                >
                  {isEnablingPush ? 'Activation...' : 'Activer les notifications push'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSendingPushTest}
                  onClick={handlePushTest}
                  className="px-4 py-2 text-sm"
                >
                  {isSendingPushTest ? 'Envoi...' : 'Tester le push'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ---- Tab: Notifications SMS ---- */}
        {activeTab === 'sms' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setIsSaving(true);
              setError(null);
              setSuccess(null);
              try {
                await smsPreferencesAPI.updatePreferences(smsPreferences);
                setSuccess('Preferences SMS mises a jour avec succes');
                setTimeout(() => setSuccess(null), 3000);
              } catch (err: any) {
                setError(err.response?.data?.message || 'Erreur lors de la mise a jour');
              } finally {
                setIsSaving(false);
              }
            }}
          >
            <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
              <SectionTitle>Preferences SMS</SectionTitle>
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                Les SMS OTP (codes de verification) sont toujours actives pour des raisons de securite.
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-800">Activer les notifications SMS</p>
                  <p className="text-xs text-gray-500 mt-0.5">Activer ou desactiver toutes les notifications SMS</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={smsPreferences.enabled}
                    onChange={(e) => setSmsPreferences({ ...smsPreferences, enabled: e.target.checked })}
                    className="sr-only peer" />
                  <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500" />
                </label>
              </div>

              <div className="divide-y divide-gray-50">
                {[
                  { key: 'appointment_confirmed', label: 'Confirmation de rendez-vous' },
                  { key: 'appointment_cancelled', label: 'Annulation de rendez-vous' },
                  { key: 'appointment_updated', label: 'Modification de rendez-vous' },
                  { key: 'appointment_reminder', label: 'Rappel de rendez-vous' },
                  { key: 'dossier_created', label: 'Creation de dossier' },
                  { key: 'dossier_updated', label: 'Mise a jour de dossier' },
                  { key: 'dossier_status_changed', label: 'Changement de statut de dossier' },
                  { key: 'document_uploaded', label: 'Document ajoute' },
                  { key: 'message_received', label: 'Nouveau message' },
                  { key: 'task_assigned', label: 'Tache assignee' },
                  { key: 'task_reminder', label: 'Rappel de tache' },
                  { key: 'account_security', label: 'Securite du compte' },
                  { key: 'otp', label: 'Codes OTP (toujours actives)', disabled: true },
                ].map((type) => (
                  <div key={type.key} className="flex items-center justify-between py-3 gap-4">
                    <span className={`text-sm ${type.disabled ? 'text-gray-400' : 'text-gray-700'}`}>{type.label}</span>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={smsPreferences.types[type.key as keyof typeof smsPreferences.types] || false}
                        onChange={(e) =>
                          setSmsPreferences({
                            ...smsPreferences,
                            types: { ...smsPreferences.types, [type.key]: e.target.checked },
                          })
                        }
                        disabled={type.disabled || !smsPreferences.enabled}
                        className="sr-only peer"
                      />
                      <div className={`w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500 ${(type.disabled || !smsPreferences.enabled) ? 'opacity-40 cursor-not-allowed' : ''}`} />
                    </label>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={isSaving} className="px-5 py-2.5">
                  {isSaving ? 'Enregistrement...' : 'Enregistrer les preferences'}
                </Button>
              </div>
            </div>
          </form>
        )}

      </main>
    </div>
  );
}
