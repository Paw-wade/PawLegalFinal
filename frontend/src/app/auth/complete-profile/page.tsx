'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { userAPI } from '@/lib/api';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';
import { Toast } from '@/components/ui/Toast';
import { useAutoFillDetection, getRealInputValues } from '@/hooks/useAutoFillDetection';
import { getProfilePhotoAbsoluteUrl, mergeProfileFormValuesFromDom } from '@/lib/profilePhoto';

// Composants simplifiés
function Button({ children, variant = 'default', className = '', disabled = false, type = 'button', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent',
  };
  return (
    <button type={type} disabled={disabled} className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

const Input = React.forwardRef<HTMLInputElement, any>(({ className = '', type, value, onChange, name, ...props }, ref) => {
  // Pour les champs de date, utiliser le composant DateInput qui garantit le format jour/mois/année
  if (type === 'date') {
    return (
      <DateInputComponent
        value={value || ''}
        onChange={(newValue) => {
          if (onChange) {
            const syntheticEvent = {
              target: { value: newValue, name: name || '' },
              currentTarget: { value: newValue, name: name || '' }
            } as React.ChangeEvent<HTMLInputElement>;
            onChange(syntheticEvent);
          }
        }}
        className={`flex h-11 w-full rounded-md border-2 border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:border-primary transition-colors ${className}`}
        name={name}
        {...props}
      />
    );
  }
  
  return (
    <input
      ref={ref}
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      className={`flex h-11 w-full rounded-md border-2 border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:border-primary transition-colors ${className}`}
      {...props}
    />
  );
});
Input.displayName = 'Input';

function Label({ children, ...props }: any) {
  return (
    <label className="text-sm font-semibold leading-none mb-2 block" {...props}>
      {children}
    </label>
  );
}

export default function CompleteProfilePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('client');
  const isExpired = false; // désactivé — plus de blocage automatique
  const [formData, setFormData] = useState({
    // Champs communs
    numeroEtranger: '',
    dateNaissance: '',
    lieuNaissance: '',
    nationalite: '',
    sexe: '',
    adressePostale: '',
    ville: '',
    codePostal: '',
    pays: 'France',
    // Informations de séjour (clients)
    typeTitre: '',
    dateDelivrance: '',
    dateExpiration: '',
  });

  // Refs pour détecter l'auto-remplissage
  const numeroEtrangerInputRef = useRef<HTMLInputElement>(null);
  const lieuNaissanceInputRef = useRef<HTMLInputElement>(null);
  const nationaliteInputRef = useRef<HTMLInputElement>(null);
  const adressePostaleInputRef = useRef<HTMLInputElement>(null);
  const villeInputRef = useRef<HTMLInputElement>(null);
  const codePostalInputRef = useRef<HTMLInputElement>(null);
  const paysInputRef = useRef<HTMLInputElement>(null);
  const typeTitreInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  /** Ne pas écraser l’aperçu si l’utilisateur a déjà choisi un fichier local */
  const userPickedPhotoRef = useRef(false);

  // Détecter l'auto-remplissage du navigateur
  useAutoFillDetection({
    inputRefs: {
      numeroEtranger: numeroEtrangerInputRef,
      lieuNaissance: lieuNaissanceInputRef,
      nationalite: nationaliteInputRef,
      adressePostale: adressePostaleInputRef,
      ville: villeInputRef,
      codePostal: codePostalInputRef,
      pays: paysInputRef,
      typeTitre: typeTitreInputRef,
    },
    formData,
    setFormData: (updater) => setFormData(updater as React.SetStateAction<typeof formData>),
  });

  useEffect(() => {
    // Vérifier si l'utilisateur a un token
    const token = localStorage.getItem('token');
    
    if (status === 'loading') {
      return; // Attendre que NextAuth termine le chargement
    }

    if (!session && !token) {
      // Pas de session et pas de token, rediriger vers la connexion
      router.push('/auth/signin');
      return;
    }

    // Si on a un token mais pas de session, essayer de se connecter automatiquement
    if (!session && token) {
      // L'utilisateur vient de s'inscrire, on peut continuer avec le token
      // Charger les informations utilisateur pour déterminer le rôle
      userAPI.getProfile().then(res => {
        if (res.data.success && res.data.user) {
          const role = res.data.user.role || 'client';
          setUserRole(role);
          // Plus de délai bloquant de 7 jours : on laisse l'utilisateur compléter son profil sans blocage.
          // Charger les données existantes si le profil est partiellement complété
          if (res.data.user) {
            loadExistingProfile(res.data.user);
          }
        }
      }).catch(() => {})
      .finally(() => setIsChecking(false));
      return;
    }

    // Si on a une session, attendre GET /profile avant d’afficher le formulaire (données à jour + photo)
    if (session) {
      const roleFromSession = (session.user as any)?.role || 'client';
      setUserRole(roleFromSession);

      userAPI.getProfile()
        .then((res) => {
            if (res.data.success && res.data.user) {
              const apiUser = res.data.user;
              const r = apiUser.role || roleFromSession;
              setUserRole(r);
              loadExistingProfile(apiUser);
            }
        })
        .catch(() => {
          loadExistingProfile(session.user as any);
        })
        .finally(() => setIsChecking(false));

      // On ne tient plus compte du paramètre expired : plus de blocage automatique.
      return;
    }

    setIsChecking(false);
  }, [session, status, router]);

  // Fonction pour charger les données existantes du profil
  const loadExistingProfile = async (userData: any) => {
    const formatDate = (d: any) => (d ? new Date(d).toISOString().split('T')[0] : '');
    setFormData(prev => ({
      ...prev,
      numeroEtranger: userData.numeroEtranger || '',
      dateNaissance: formatDate(userData.dateNaissance),
      lieuNaissance: userData.lieuNaissance || '',
      nationalite: userData.nationalite || '',
      sexe: userData.sexe || '',
      adressePostale: userData.adressePostale || '',
      ville: userData.ville || '',
      codePostal: userData.codePostal || '',
      pays: userData.pays || 'France',
      typeTitre: userData.typeTitre || '',
      dateDelivrance: formatDate(userData.dateDelivrance),
      dateExpiration: formatDate(userData.dateExpiration),
    }));
    if (!userPickedPhotoRef.current) {
      const abs = getProfilePhotoAbsoluteUrl(userData?.profilePhoto);
      setPhotoPreview(abs);
    }
  };

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Vérifier la taille (max 5 Mo)
      if (file.size > 5 * 1024 * 1024) {
        setError('La photo ne doit pas dépasser 5 Mo');
        return;
      }
      // Vérifier le type
      if (!file.type.startsWith('image/')) {
        setError('Veuillez sélectionner une image');
        return;
      }
      userPickedPhotoRef.current = true;
      setProfilePhoto(file);
      // Créer un aperçu
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Récupérer les valeurs réelles des inputs DOM pour détecter l'auto-remplissage
    const inputRefs: any = {
      numeroEtranger: numeroEtrangerInputRef,
      lieuNaissance: lieuNaissanceInputRef,
      nationalite: nationaliteInputRef,
      adressePostale: adressePostaleInputRef,
      ville: villeInputRef,
      codePostal: codePostalInputRef,
      pays: paysInputRef,
    };
    
    const realValues = getRealInputValues(inputRefs, formData);
    let dataToSend = { ...formData, ...realValues };
    dataToSend = mergeProfileFormValuesFromDom(dataToSend, {
      includeSejour: userRole === 'client',
      includeAccountFields: false,
    });

    // Mettre à jour l'état pour le prochain rendu
    setFormData((prev) => ({ ...prev, ...dataToSend }));

    // Pour les clients, les informations de séjour sont obligatoires
    if (userRole === 'client') {
      const { typeTitre, dateDelivrance, dateExpiration } = dataToSend;
      if (!typeTitre?.trim() || !dateDelivrance?.trim() || !dateExpiration?.trim()) {
        setError(
          'Pour finaliser votre profil client, veuillez renseigner les informations de séjour : type de titre, date de délivrance et date d\'expiration.'
        );
        setIsLoading(false);
        // Scroll vers le message d'erreur au centre de la page
        setTimeout(() => {
          if (errorRef.current) {
            errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 0);
        return;
      }
    }

    // Préparer les données
    const profileData: any = {
      ...dataToSend,
      ...(userRole === 'client' ? {
        typeTitre: dataToSend.typeTitre?.trim() || '',
        dateDelivrance: dataToSend.dateDelivrance || undefined,
        dateExpiration: dataToSend.dateExpiration || undefined,
      } : {}),
      profilComplete: true,
    };

    try {
      // Si une photo est sélectionnée, utiliser FormData
      if (profilePhoto) {
        const formDataToSend = new FormData();
        formDataToSend.append('photo', profilePhoto);
        Object.keys(profileData).forEach((key) => {
          if (Array.isArray(profileData[key])) {
            profileData[key].forEach((item: any) => {
              formDataToSend.append(`${key}[]`, item);
            });
          } else {
            formDataToSend.append(key, profileData[key] || '');
          }
        });

        const response = await userAPI.updateProfile(formDataToSend);
        
        if (response.data.success) {
          setError(null);
          setSuccess(true);
          setIsLoading(false);
          setTimeout(() => {
            const redirectPath = (userRole === 'admin' || userRole === 'superadmin') ? '/admin' : '/client';
            window.location.href = redirectPath;
          }, 2000);
        } else {
          setError('Une erreur est survenue lors de la mise à jour du profil');
          setIsLoading(false);
        }
        return;
      }

      // Sinon, envoyer les données normalement
      const response = await userAPI.updateProfile(profileData);

      if (response.data.success) {
        setError(null);
        setSuccess(true);
        setIsLoading(false);
        
        setTimeout(() => {
          const redirectPath = (userRole === 'admin' || userRole === 'superadmin') ? '/admin' : '/client';
          window.location.href = redirectPath;
        }, 2000);
      } else {
        setError('Une erreur est survenue lors de la mise à jour du profil');
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour du profil:', err);
      setError(err.response?.data?.message || 'Une erreur est survenue lors de la mise à jour du profil');
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-12">
      <Toast message="Profil complété avec succès ! Redirection en cours..." visible={success} duration={2000} />
      <div className="w-full max-w-3xl">
        <div className="bg-white rounded-xl shadow-xl border border-border overflow-hidden">
          {/* En-tête amélioré */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-8 py-6 border-b border-border">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <span className="text-white font-bold text-2xl">📝</span>
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Compléter votre profil</h1>
              <p className="text-muted-foreground">
                Veuillez compléter les informations suivantes pour finaliser votre inscription
              </p>
              {userRole === 'client' && (
                <p className="text-xs text-muted-foreground/90 mt-2">
                  Sans profil complété, l'accès au calculateur de délais n'est pas possible.
                </p>
              )}
            </div>
          </div>

          <div className="p-8">
            {/* Messages améliorés */}
            {error && (
              <div
                ref={errorRef}
                className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚠️</span>
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">✅</span>
                  <p className="text-sm font-medium text-green-800">Profil complété avec succès ! Redirection en cours...</p>
                </div>
              </div>
            )}
            
            {/* Plus de blocage après 7 jours : pas de message de compte bloqué ici. */}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Section Photo de profil */}
              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl">📷</span>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Photo de profil</h3>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="relative">
                    {photoPreview ? (
                      <img 
                        src={photoPreview} 
                        alt="Aperçu" 
                        className="w-24 h-24 rounded-full object-cover border-4 border-primary/20 shadow-lg"
                      />
                    ) : (
                      <div className="w-24 h-24 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white font-bold text-2xl">
                          {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="photo">Choisir une photo</Label>
                    <input
                      id="photo"
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      className="mt-1 block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90 file:cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Format accepté : JPG, PNG (max 5 Mo)</p>
                  </div>
                </div>
              </div>

              {/* Section Informations personnelles - uniquement pour les clients */}
              {userRole === 'client' && (
                <>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-xl">🆔</span>
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">Informations personnelles</h3>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="numeroEtranger">Numéro d'étranger</Label>
                        <Input
                          ref={numeroEtrangerInputRef}
                          id="numeroEtranger"
                          name="numeroEtranger"
                          value={formData.numeroEtranger}
                          onChange={handleChange}
                          placeholder="Ex: 12AB34567"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="dateNaissance">Date de naissance</Label>
                        <Input
                          id="dateNaissance"
                          name="dateNaissance"
                          type="date"
                          value={formData.dateNaissance}
                          onChange={handleChange}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="lieuNaissance">Lieu de naissance</Label>
                        <Input
                          ref={lieuNaissanceInputRef}
                          id="lieuNaissance"
                          name="lieuNaissance"
                          value={formData.lieuNaissance}
                          onChange={handleChange}
                          placeholder="Ville, Pays"
                          autoComplete="bday-place"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="nationalite">Nationalité</Label>
                        <Input
                          ref={nationaliteInputRef}
                          id="nationalite"
                          name="nationalite"
                          value={formData.nationalite}
                          onChange={handleChange}
                          placeholder="Ex: Française, Algérienne..."
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sexe">Sexe</Label>
                      <select
                        id="sexe"
                        name="sexe"
                        value={formData.sexe}
                        onChange={handleChange}
                        className="flex h-11 w-full rounded-md border-2 border-input bg-background px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:border-primary transition-colors"
                      >
                        <option value="">Sélectionner</option>
                        <option value="M">Homme</option>
                        <option value="F">Femme</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>
                  </div>

                  {/* Section Informations de séjour (clients) */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-xl">🛂</span>
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">Informations de séjour</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="typeTitre">Type de titre <span className="text-destructive">*</span></Label>
                        <Input
                          ref={typeTitreInputRef}
                          id="typeTitre"
                          name="typeTitre"
                          value={formData.typeTitre}
                          onChange={handleChange}
                          placeholder="Ex: Carte de séjour, Visa, etc."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dateDelivrance">Date de délivrance <span className="text-destructive">*</span></Label>
                        <Input
                          id="dateDelivrance"
                          name="dateDelivrance"
                          type="date"
                          value={formData.dateDelivrance}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="dateExpiration">Date d'expiration <span className="text-destructive">*</span></Label>
                        <Input
                          id="dateExpiration"
                          name="dateExpiration"
                          type="date"
                          value={formData.dateExpiration}
                          onChange={handleChange}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Séparateur */}
                  <div className="border-t border-border"></div>
                </>
              )}

              {/* Section Adresse */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl">📍</span>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Adresse</h3>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adressePostale">Adresse postale</Label>
                  <Input
                    ref={adressePostaleInputRef}
                    id="adressePostale"
                    name="adressePostale"
                    value={formData.adressePostale}
                    onChange={handleChange}
                    placeholder="Numéro et nom de rue"
                    autoComplete="street-address"
                  />
                </div>

                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="ville">Ville</Label>
                    <Input
                      ref={villeInputRef}
                      id="ville"
                      name="ville"
                      value={formData.ville}
                      onChange={handleChange}
                      placeholder="Ville"
                      autoComplete="address-level2"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="codePostal">Code postal</Label>
                    <Input
                      ref={codePostalInputRef}
                      id="codePostal"
                      name="codePostal"
                      value={formData.codePostal}
                      onChange={handleChange}
                      placeholder="75001"
                      autoComplete="postal-code"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pays">Pays</Label>
                    <Input
                      ref={paysInputRef}
                      id="pays"
                      name="pays"
                      value={formData.pays}
                      onChange={handleChange}
                      placeholder="France"
                      autoComplete="country"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                {/* Bouton pour quitter (sauf pour les admins et si le délai n'est pas dépassé) */}
                {userRole !== 'admin' && userRole !== 'superadmin' && !isExpired && (
                  <Button 
                    type="button"
                    variant="outline"
                    className="flex-1 h-12 text-base font-semibold"
                    onClick={() => {
                      // Rediriger vers le dashboard approprié
                      if (userRole === 'admin' || userRole === 'superadmin') {
                        router.push('/admin');
                      } else {
                        router.push('/client');
                      }
                    }}
                  >
                    Quitter pour l'instant
                  </Button>
                )}
                <Button 
                  type="submit" 
                  className={`${userRole !== 'admin' && userRole !== 'superadmin' ? 'flex-1' : 'w-full'} h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all`}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⏳</span>
                      <span>Enregistrement...</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span>✅</span>
                      <span>{session && (session.user as any)?.profilComplete ? 'Mettre à jour mon profil' : 'Finaliser mon profil'}</span>
                    </span>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

