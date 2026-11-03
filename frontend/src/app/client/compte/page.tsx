'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useRef } from 'react';
import Link from 'next/link';
import { userAPI, smsPreferencesAPI, pushAPI } from '@/lib/api';
import { FloatingField } from '@/components/ui/FloatingField';
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
    } else if (session && !(session.user as any).profilComplete) {
      router.push('/auth/complete-profile');
    } else if (session) {
      if ((session.user as any)?.role === 'admin' || (session.user as any)?.role === 'superadmin') {
        router.push('/admin');
      }
    }
  }, [session, status, router]);

  useEffect(() => {
    if (status === 'authenticated' && session) {
      loadProfile();
    }
  }, [status, session]);

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
              otp: true,
            },
          });
        }
      }
    } catch {}
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
        setSuccess('Profil mis a jour avec succes');
        setTimeout(() => setSuccess(null), 3000);
        await loadProfile();
      } else {
        setError((data && data.message) || 'Erreur lors de la mise a jour du profil');
      }
    } catch (err: any) {
      const st = err.response?.status;
      const data = err.response?.data;
      if (st === 401) {
        try {
          const { getSession } = await import('next-auth/react');
          const newSession = await getSession();
          const newToken = (newSession?.user as any)?.accessToken;
          if (newToken && typeof window !== 'undefined') {
            localStorage.setItem('token', newToken);
            response = await doUpdate();
            const resData = response?.data;
            if (resData && resData.success) {
              setSuccess('Profil mis a jour avec succes');
              setTimeout(() => setSuccess(null), 3000);
              await loadProfile();
            } else {
              setError((resData && resData.message) || 'Erreur lors de la mise a jour du profil');
            }
            return;
          }
        } catch {}
        setError('Session expiree. Veuillez vous reconnecter, puis reessayer.');
      } else {
        const message = data?.message || err.message || 'Erreur lors de la mise a jour du profil';
        const details = data?.errors;
        const fullMessage = Array.isArray(details) && details.length > 0 ? `${message} (${details.join(', ')})` : message;
        setError(fullMessage);
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
    }
  };

  const handleEnablePush = async () => {
    setError(null);
    setSuccess(null);
    setIsEnablingPush(true);
    try {
      const result = await ensurePushSubscription({ requestPermission: true });
      if (result.ok) {
        setSuccess('Notifications push activees sur cet appareil.');
      } else if (result.reason === 'permission_required') {
        setError('Veuillez autoriser les notifications dans votre navigateur.');
      } else if (result.reason === 'denied') {
        setError('Notifications refusees dans le navigateur (parametres a modifier).');
      } else if (result.reason === 'server_not_configured') {
        setError('Serveur push non configure (cles VAPID manquantes).');
      } else {
        setError('Ce navigateur ne supporte pas les notifications push.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Impossible d\'activer les notifications push.');
    } finally {
      setIsEnablingPush(false);
    }
  };

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

  if (!session) return null;

  const firstInitial = (profileData.firstName || '').charAt(0).toUpperCase();
  const lastInitial = (profileData.lastName || '').charAt(0).toUpperCase();
  const initials = (firstInitial + lastInitial) || (session?.user?.name?.charAt(0)?.toUpperCase() ?? 'C');
  const fullName = [profileData.firstName, profileData.lastName].filter(Boolean).join(' ') || session?.user?.name || '';

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

  const titreExpirationLabel = profileData.dateExpiration
    ? `Expire le ${displayDate(profileData.dateExpiration)}`
    : null;

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
            className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl font-medium flex-shrink-0 select-none"
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-medium text-gray-900">{fullName || 'Mon profil'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Espace client</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {profileData.typeTitre && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  {typeTitreLabel[profileData.typeTitre] || profileData.typeTitre}
                  {titreExpirationLabel ? ` - ${titreExpirationLabel}` : ''}
                </span>
              )}
              {profileData.nationalite && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  {profileData.nationalite}
                </span>
              )}
            </div>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-1 text-xs text-gray-500">
            {profileData.email && (
              <span>Email: <span className="text-gray-800 font-medium">{profileData.email}</span></span>
            )}
            {profileData.phone && (
              <span>Tel: <span className="text-gray-800 font-medium">{profileData.phone}</span></span>
            )}
            {profileData.numeroEtranger && (
              <span>N etranger: <span className="text-gray-800 font-medium">{profileData.numeroEtranger}</span></span>
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
          <div
            ref={errorRef}
            className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2"
          >
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
              <InfoCard title="Informations personnelles">
                <InfoRow label="Prenom" value={profileData.firstName} />
                <InfoRow label="Nom" value={profileData.lastName} />
                <InfoRow label="Email" value={profileData.email} />
                <InfoRow label="Telephone" value={profileData.phone} />
                <InfoRow label="Date de naissance" value={displayDate(profileData.dateNaissance)} />
                <InfoRow label="Lieu de naissance" value={profileData.lieuNaissance} />
                <InfoRow label="Sexe" value={sexeLabel[profileData.sexe] || profileData.sexe} />
              </InfoCard>
              <InfoCard title="Situation administrative">
                <InfoRow label="Nationalite" value={profileData.nationalite} />
                <InfoRow label="Numero d'etranger" value={profileData.numeroEtranger} />
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
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-50">
              <h2 className="text-base font-medium text-gray-800">Modifier le profil</h2>
              <p className="text-sm text-gray-500 mt-0.5">Mettez a jour vos informations personnelles</p>
            </div>
            <form onSubmit={handleProfileSubmit} className="p-6 space-y-8" autoComplete="on">
              <div className="space-y-4">
                <SectionTitle>Informations de base</SectionTitle>
                <div className="grid md:grid-cols-2 gap-5">
                  <FloatingField label="Prenom" value={profileData.firstName}
                    onChange={(v) => setProfileData({ ...profileData, firstName: v })} />
                  <FloatingField label="Nom" value={profileData.lastName}
                    onChange={(v) => setProfileData({ ...profileData, lastName: v })} />
                </div>
                <div className="grid md:grid-cols-2 gap-5">
                  <FloatingField label="Email" type="email" value={profileData.email}
                    onChange={(v) => setProfileData({ ...profileData, email: v })} />
                  <FloatingField label="Telephone" type="tel" value={profileData.phone}
                    onChange={(v) => setProfileData({ ...profileData, phone: v })} />
                </div>
              </div>

              <div className="border-t border-gray-50" />

              <div className="space-y-4">
                <SectionTitle>Informations personnelles</SectionTitle>
                <div className="grid md:grid-cols-2 gap-5">
                  <FloatingField label="Date de naissance" type="date" value={profileData.dateNaissance}
                    onChange={(v) => setProfileData({ ...profileData, dateNaissance: v })} />
                  <FloatingField label="Lieu de naissance" value={profileData.lieuNaissance}
                    onChange={(v) => setProfileData({ ...profileData, lieuNaissance: v })} placeholder="Ville, Pays" />
                </div>
                <div className="grid md:grid-cols-2 gap-5">
                  <FloatingField label="Nationalite" value={profileData.nationalite}
                    onChange={(v) => setProfileData({ ...profileData, nationalite: v })} placeholder="Ex: Senegalaise" />
                  <FloatingField label="Sexe" type="select" value={profileData.sexe}
                    onChange={(v) => setProfileData({ ...profileData, sexe: v })}
                    options={[{ value: 'M', label: 'Masculin' }, { value: 'F', label: 'Feminin' }, { value: 'Autre', label: 'Autre' }]} />
                </div>
              </div>

              <div className="border-t border-gray-50" />

              <div className="space-y-4">
                <SectionTitle>Situation administrative</SectionTitle>
                <FloatingField label="Numero d'etranger" value={profileData.numeroEtranger}
                  onChange={(v) => setProfileData({ ...profileData, numeroEtranger: v })} placeholder="Ex: 12AB34567" />
                <div className="grid md:grid-cols-2 gap-5">
                  <FloatingField label="Type de titre" value={profileData.typeTitre}
                    onChange={(v) => setProfileData({ ...profileData, typeTitre: v })} placeholder="Ex: Carte de sejour, Visa..." />
                </div>
                <div className="grid md:grid-cols-2 gap-5">
                  <FloatingField label="Date de delivrance" type="date" value={profileData.dateDelivrance}
                    onChange={(v) => setProfileData({ ...profileData, dateDelivrance: v })} />
                  <FloatingField label="Date d'expiration" type="date" value={profileData.dateExpiration}
                    onChange={(v) => setProfileData({ ...profileData, dateExpiration: v })} />
                </div>
              </div>

              <div className="border-t border-gray-50" />

              <div className="space-y-4">
                <SectionTitle>Adresse</SectionTitle>
                <FloatingField label="Adresse postale" value={profileData.adressePostale}
                  onChange={(v) => setProfileData({ ...profileData, adressePostale: v })} placeholder="Numero et nom de rue" />
                <div className="grid md:grid-cols-3 gap-5">
                  <FloatingField label="Ville" value={profileData.ville}
                    onChange={(v) => setProfileData({ ...profileData, ville: v })} />
                  <FloatingField label="Code postal" value={profileData.codePostal}
                    onChange={(v) => setProfileData({ ...profileData, codePostal: v })} placeholder="75001" />
                  <FloatingField label="Pays" value={profileData.pays}
                    onChange={(v) => setProfileData({ ...profileData, pays: v })} placeholder="France" />
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-6 border-t border-gray-100">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="w-full sm:flex-1 h-11 text-base"
                >
                  {isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto h-11 px-6"
                  onClick={async () => {
                    await loadProfile();
                    setIsEditingProfile(false);
                  }}
                >
                  Annuler
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* ---- Tab: Securite ---- */}
        {activeTab === 'password' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-50">
                <h2 className="text-base font-medium text-gray-800">Changer le mot de passe</h2>
                <p className="text-sm text-gray-500 mt-0.5">Mettez a jour votre mot de passe pour securiser votre compte</p>
              </div>
              <form onSubmit={handlePasswordSubmit} className="p-6 space-y-5 max-w-lg" autoComplete="on">
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                  Conseil de securite : utilisez au moins 8 caracteres avec majuscules, chiffres et symboles.
                </div>
                <FloatingField label="Mot de passe actuel" required type="password" autoComplete="current-password"
                  value={passwordData.currentPassword}
                  onChange={(v) => setPasswordData({ ...passwordData, currentPassword: v })} />
                <FloatingField label="Nouveau mot de passe" required type="password" autoComplete="new-password"
                  value={passwordData.newPassword}
                  onChange={(v) => setPasswordData({ ...passwordData, newPassword: v })} />
                <div>
                  <FloatingField label="Confirmer le nouveau mot de passe" required type="password" autoComplete="new-password"
                    value={passwordData.confirmPassword}
                    onChange={(v) => setPasswordData({ ...passwordData, confirmPassword: v })} />
                  {passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
                    <p className="text-xs text-red-600 mt-1">Les mots de passe ne correspondent pas</p>
                  )}
                  {passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword === passwordData.confirmPassword && (
                    <p className="text-xs text-green-600 mt-1">Les mots de passe correspondent</p>
                  )}
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={isSaving || !!(passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword)}
                    className="px-5 py-2.5"
                  >
                    {isSaving ? 'Modification...' : 'Modifier le mot de passe'}
                  </Button>
                </div>
              </form>
            </div>

            {/* Push notifications */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <SectionTitle>Notifications push</SectionTitle>
              <div className="flex flex-wrap items-center gap-3">
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

            {/* Desactivation du compte */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <SectionTitle>Zone dangereuse</SectionTitle>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-red-600">Desactiver mon compte</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Vous ne pourrez plus vous connecter sans passer par l'equipe Ada Papers.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  disabled={isSaving}
                  className="px-4 py-2 text-sm"
                  onClick={async () => {
                    const confirmed = window.confirm(
                      "Etes-vous sur de vouloir desactiver votre compte ? Vous ne pourrez plus vous connecter sans passer par l'equipe Ada Papers."
                    );
                    if (!confirmed) return;
                    try {
                      setIsSaving(true);
                      setError(null);
                      const response = await userAPI.deactivateMyAccount();
                      if (response.data?.success) {
                        alert('Votre compte a ete desactive. Vous allez etre deconnecte.');
                        await signOut({ callbackUrl: '/' });
                      } else {
                        setError(response.data?.message || 'Impossible de desactiver le compte');
                      }
                    } catch (e: any) {
                      setError(e?.response?.data?.message || 'Erreur lors de la desactivation du compte');
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                >
                  Desactiver mon compte
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
