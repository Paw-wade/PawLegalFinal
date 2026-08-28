'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getProviders, signIn, useSession } from 'next-auth/react';
import { authAPI } from '@/lib/api';

function Button({ 
  children, 
  variant = 'default', 
  className = '', 
  disabled = false,
  type = 'button',
  ...props 
}: {
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  [key: string]: any;
}) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
  };
  
  return (
    <button
      type={type}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const Input = React.forwardRef<HTMLInputElement, any>(
  function Input({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`flex h-10 sm:h-11 w-full rounded-md border-2 border-input bg-background px-3 sm:px-4 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      />
    );
  }
);

function Label({ className = '', children, ...props }: any) {
  return (
    <label
      className={`text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block ${className}`}
      {...props}
    >
      {children}
    </label>
  );
}

const REDIRECT_DELAY_MS = 2600;

export default function SignupPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGoogleAvailable, setIsGoogleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  /** true si le compte existe mais l’email d’activation n’a pas pu être envoyé (SMTP/Brevo). */
  const [activationEmailFailed, setActivationEmailFailed] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });
  const [phoneCountryCode, setPhoneCountryCode] = useState('+33');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const providers = await getProviders();
        setIsGoogleAvailable(Boolean(providers?.['google-signup']));
      } catch (e) {
        console.error('Erreur chargement providers NextAuth:', e);
        setIsGoogleAvailable(false);
      }
    };
    void loadProviders();
  }, []);

  // Pré-remplir l'email depuis le lien d'invitation (?email=) reçu après une demande publique.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email');
    if (emailParam) {
      setFormData((prev) => (prev.email ? prev : { ...prev, email: emailParam }));
    }
  }, []);

  useEffect(() => {
    const user: any = session?.user;
    if (!user) return;

    // Si l'utilisateur existe déjà et est connecté, on redirige vers son espace.
    if (user.accessToken) {
      const role = user.role;
      if (role === 'admin' || role === 'superadmin') {
        router.replace('/admin');
      } else if (role === 'partenaire') {
        router.replace('/partenaire');
      } else if (user.profilComplete === false) {
        router.replace('/auth/complete-profile');
      } else {
        router.replace('/client');
      }
      return;
    }

    // Préremplissage des champs depuis Google pour finaliser l'inscription.
    if (user.googleSignupPending) {
      setFormData((prev) => ({
        ...prev,
        firstName: prev.firstName || user.googleFirstName || '',
        lastName: prev.lastName || user.googleLastName || '',
        email: prev.email || user.email || '',
      }));
    }
  }, [session, router]);

  const validateField = (name: string, value: string) => {
    setFieldErrors(prev => {
      const errors = { ...prev };
      
      switch (name) {
        case 'firstName':
          if (!value || value.trim().length === 0) {
            errors.firstName = 'Le prénom est requis';
          } else if (value.trim().length < 2) {
            errors.firstName = 'Le prénom doit contenir au moins 2 caractères';
          } else {
            delete errors.firstName;
          }
          break;
        case 'lastName':
          if (!value || value.trim().length === 0) {
            errors.lastName = 'Le nom est requis';
          } else if (value.trim().length < 2) {
            errors.lastName = 'Le nom doit contenir au moins 2 caractères';
          } else {
            delete errors.lastName;
          }
          break;
        case 'phone':
          if (!value || value.trim().length === 0) {
            errors.phone = 'Le numéro de téléphone est requis';
          } else {
            const digitsOnly = value.replace(/\D/g, '');
            if (phoneCountryCode === '+33') {
              if (!/^(0?[1-9]\d{8})$/.test(digitsOnly)) {
                errors.phone = 'Numéro français invalide';
              } else {
                delete errors.phone;
              }
            } else if (!/^\d{6,15}$/.test(digitsOnly)) {
              errors.phone = 'Numéro international invalide';
            } else {
              delete errors.phone;
            }
          }
          break;
      }
      
      return errors;
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    validateField(name, value);
  };

  const normalizePhoneForApi = (countryCode: string, rawPhone: string) => {
    const digits = rawPhone.replace(/\D/g, '');
    if (!digits) return '';
    if (countryCode === '+33') {
      const frLocal = digits.startsWith('0') ? digits.slice(1) : digits;
      return `+33${frLocal}`;
    }
    return `${countryCode}${digits}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    const email = formData.email.trim().toLowerCase();
    const cleanedPhone = normalizePhoneForApi(phoneCountryCode, formData.phone);

    if (!firstName || !lastName || !email || !cleanedPhone) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (!acceptedTerms) {
      setError('Veuillez accepter les Conditions Générales d’Utilisation et la Politique de confidentialité.');
      return;
    }

    // Validation simple de l'email côté client
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Veuillez entrer une adresse email valide');
      return;
    }

    setIsLoading(true);

    try {
      const response = await authAPI.register({
        firstName,
        lastName,
        email,
        phone: cleanedPhone,
      });

      if (response.data.success) {
        setError(null);
        const emailSent = response.data.emailSent !== false;
        setActivationEmailFailed(!emailSent);

        if (emailSent) {
          setSuccess(
            'Un email avec un lien sécurisé pour choisir votre mot de passe vous a été envoyé. Redirection automatique vers l’accueil…'
          );
          if (redirectTimerRef.current) {
            clearTimeout(redirectTimerRef.current);
          }
          redirectTimerRef.current = setTimeout(() => {
            redirectTimerRef.current = null;
            router.push('/');
          }, REDIRECT_DELAY_MS);
        } else {
          setSuccess(
            response.data.message ||
              'Compte créé, mais l’email d’activation n’a pas pu être envoyé. Vous pouvez réessayer ci-dessous après avoir configuré Brevo ou SMTP sur le serveur.'
          );
          if (redirectTimerRef.current) {
            clearTimeout(redirectTimerRef.current);
            redirectTimerRef.current = null;
          }
        }
      }
    } catch (err: any) {
      console.error('Erreur lors de la création du compte:', err);
      
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.response?.data?.errors) {
        const errorMessages = err.response.data.errors.map((e: any) => e.msg || e.message).join(', ');
        setError(errorMessages);
      } else if (err.message) {
        setError(`Erreur: ${err.message}`);
      } else {
        setError('Erreur lors de la création du compte. Veuillez réessayer.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendActivation = async () => {
    const email = formData.email.trim().toLowerCase();
    if (!email) return;
    setResendLoading(true);
    setError(null);
    try {
      const { data } = await authAPI.resendActivation({ email });
      if (data?.emailSent === true) {
        setActivationEmailFailed(false);
      }
      setSuccess(
        'Si cette adresse correspond à un compte en attente d’activation, un nouvel email vient de vous être envoyé. Vérifiez aussi les courriers indésirables.'
      );
    } catch (err: any) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('Impossible de renvoyer l’email pour le moment.');
      }
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      await signIn('google-signup', { callbackUrl: '/auth/signup' });
    } catch (err) {
      console.error('Erreur lors de la pré-inscription Google:', err);
      setError('Impossible de continuer avec Google pour le moment.');
      setIsGoogleLoading(false);
    }
  };

  useEffect(() => {
    if (!isGoogleLoading) return;
    const t = setTimeout(() => setIsGoogleLoading(false), 5000);
    return () => clearTimeout(t);
  }, [isGoogleLoading]);

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-primary/5 via-background to-primary/10 relative">
      <Link href="/" className="absolute top-4 left-4 z-50">
        <Button variant="ghost" className="text-foreground hover:bg-primary/10 backdrop-blur-sm">
          ← Retour à l'accueil
        </Button>
      </Link>

      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-primary/80 items-center justify-center p-12 text-white">
        <div className="max-w-md">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4">Rejoignez Ada Papers</h1>
            <p className="text-lg text-white/90 mb-6">
              Service d'Accompagnement aux démarches administratives.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">✓</span>
              <div>
                <h3 className="font-semibold mb-1">Inscription rapide</h3>
                <p className="text-white/80 text-sm">Créez votre compte en quelques minutes</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-2xl">✓</span>
              <div>
                <h3 className="font-semibold mb-1">Sécurité garantie</h3>
                <p className="text-white/80 text-sm">Activation par lien personnel envoyé à votre adresse email</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-2xl">✓</span>
              <div>
                <h3 className="font-semibold mb-1">Outils et accompagnement</h3>
                <p className="text-white/80 text-sm">
                  Accès au calculateur de délais, à un avocat et au forum pour vos questions de titre de séjour.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center px-4 py-6 sm:py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-4 sm:mb-6">
            <Link href="/" className="inline-block">
              <div className="flex flex-col items-center">
                <span className="text-3xl font-bold text-orange-500 hover:text-orange-600 transition-colors">
                  Ada Papers
                </span>
                <p className="text-[10px] text-muted-foreground font-medium mt-1">
                  Service d'Accompagnement aux démarches administratives
                </p>
              </div>
            </Link>
          </div>
          
          <div className="bg-white rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-5 sm:px-8 py-4 sm:py-6 border-b border-border">
              <div className="text-center">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 sm:mb-2">
                  Création de compte
                </h1>
              </div>
            </div>

            <div className="p-5 sm:p-8">
              {error && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚠️</span>
                    <p className="text-sm font-medium text-red-800">{error}</p>
                  </div>
                </div>
              )}

              {success && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`mb-6 p-4 border rounded-lg shadow-sm animate-in fade-in duration-300 ${
                    activationEmailFailed
                      ? 'bg-amber-50 border-amber-200 border-l-4 border-l-amber-500'
                      : 'bg-emerald-50 border-emerald-200 border-l-4 border-l-emerald-500'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none" aria-hidden>
                      {activationEmailFailed ? '✉️' : '✓'}
                    </span>
                    <div className="flex-1 space-y-3">
                      <p
                        className={`text-sm font-semibold ${activationEmailFailed ? 'text-amber-900' : 'text-emerald-900'}`}
                      >
                        {activationEmailFailed ? 'Compte créé — email non envoyé' : 'Compte créé avec succès'}
                      </p>
                      <p
                        className={`text-sm mt-1 ${activationEmailFailed ? 'text-amber-900' : 'text-emerald-800'}`}
                      >
                        {success}
                      </p>
                      {activationEmailFailed && (
                        <Button
                          type="button"
                          variant="outline"
                          className="border-amber-300 text-amber-900 hover:bg-amber-100"
                          disabled={resendLoading || !formData.email.trim()}
                          onClick={() => void handleResendActivation()}
                        >
                          {resendLoading ? 'Envoi…' : 'Renvoyer l’email d’activation'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6" aria-busy={isLoading || !!success}>
                <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-2.5 sm:p-3 space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-10 sm:h-12 text-sm sm:text-base font-semibold bg-white"
                    onClick={handleGoogleSignup}
                    disabled={!isGoogleAvailable || isGoogleLoading || isLoading || !!success}
                  >
                    {isGoogleLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin">⏳</span>
                        <span>Redirection vers Google...</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span>🔵</span>
                        <span>S'inscrire avec Google</span>
                      </span>
                    )}
                  </Button>
                </div>

                <div className="relative py-0.5 sm:py-1">
                  <div className="absolute inset-0 flex items-center" aria-hidden>
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-muted-foreground">Ou inscrivez-vous manuellement</span>
                  </div>
                </div>

                <div className="space-y-4 sm:space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">Prénom *</Label>
                      <Input
                        id="firstName"
                        name="firstName"
                        type="text"
                        value={formData.firstName}
                        onChange={handleChange}
                        onBlur={(e) => validateField('firstName', e.target.value)}
                        placeholder="Votre prénom"
                        autoComplete="given-name"
                        disabled={!!success}
                        className={fieldErrors.firstName ? 'border-red-500 focus:border-red-500' : ''}
                      />
                      {fieldErrors.firstName && (
                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                          <span>⚠️</span>
                          <span>{fieldErrors.firstName}</span>
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lastName">Nom *</Label>
                      <Input
                        id="lastName"
                        name="lastName"
                        type="text"
                        value={formData.lastName}
                        onChange={handleChange}
                        onBlur={(e) => validateField('lastName', e.target.value)}
                        placeholder="Votre nom"
                        autoComplete="family-name"
                        disabled={!!success}
                        className={fieldErrors.lastName ? 'border-red-500 focus:border-red-500' : ''}
                      />
                      {fieldErrors.lastName && (
                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                          <span>⚠️</span>
                          <span>{fieldErrors.lastName}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="votre.email@exemple.com"
                      autoComplete="email"
                      required
                      disabled={!!success}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Numéro de téléphone *</Label>
                    <div className="flex gap-2">
                      <select
                        aria-label="Indicatif téléphonique"
                        value={phoneCountryCode}
                        onChange={(e) => {
                          const nextCode = e.target.value;
                          setPhoneCountryCode(nextCode);
                          validateField('phone', formData.phone);
                        }}
                        disabled={!!success}
                        className="h-10 sm:h-11 w-28 rounded-md border-2 border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary"
                      >
                        <option value="+33">+33 (FR)</option>
                        <option value="+32">+32 (BE)</option>
                        <option value="+41">+41 (CH)</option>
                        <option value="+1">+1 (US/CA)</option>
                        <option value="+212">+212 (MA)</option>
                        <option value="+216">+216 (TN)</option>
                        <option value="+221">+221 (SN)</option>
                        <option value="+225">+225 (CI)</option>
                        <option value="+228">+228 (TG)</option>
                        <option value="+229">+229 (BJ)</option>
                      </select>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={handleChange}
                        onBlur={(e) => validateField('phone', e.target.value)}
                        placeholder={phoneCountryCode === '+33' ? '07 68 03 33 58' : 'Numéro local'}
                        autoComplete="tel-national"
                        disabled={!!success}
                        className={fieldErrors.phone ? 'border-red-500 focus:border-red-500' : ''}
                      />
                    </div>
                    {fieldErrors.phone && (
                      <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <span>⚠️</span>
                        <span>{fieldErrors.phone}</span>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Les numéros en <strong>+33</strong> peuvent recevoir des SMS. Pour les autres indicatifs, la validation se fait par email uniquement.
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 sm:space-y-3 pt-1">
                  <label className="flex items-start gap-2.5 text-[11px] text-muted-foreground leading-snug">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 rounded border border-input accent-orange-500"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      disabled={isLoading || !!success}
                      required
                    />
                    <span>
                      J'accepte les{' '}
                      <Link href="/cgu" className="text-primary hover:underline font-semibold">
                        Conditions Générales d'Utilisation
                      </Link>{' '}
                      et la{' '}
                      <Link href="/politique-confidentialite" className="text-primary hover:underline font-semibold">
                        Politique de confidentialité
                      </Link>
                      .
                    </span>
                  </label>
                  <Button
                    type="submit"
                    className="w-full h-10 sm:h-12 text-sm sm:text-base font-semibold shadow-md hover:shadow-lg transition-all"
                    disabled={isLoading || !!success || !acceptedTerms}
                  >
                    {success ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-pulse">✓</span>
                        <span>Redirection vers l'accueil…</span>
                      </span>
                    ) : isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin">⏳</span>
                        <span>Envoi en cours...</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span>Créer mon compte</span>
                      </span>
                    )}
                  </Button>
                </div>
              </form>

              <div className="mt-6 pt-6 border-t border-border text-center">
                <p className="text-sm text-muted-foreground">
                  Vous avez déjà un compte ?{' '}
                  <Link href="/auth/signin" className="text-primary hover:underline font-semibold">
                    Se connecter
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

