'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn, getSession, getProviders } from 'next-auth/react';

// Composants simplifiés
function Button({ children, variant = 'default', size = 'default', className = '', disabled = false, type = 'button', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  const sizeClasses = {
    default: 'h-10 py-2 px-4',
    sm: 'h-9 px-3',
    lg: 'h-11 px-8',
  };
  return (
    <button type={type} disabled={disabled} className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Input({ className = '', ...props }: any) {
  return (
    <input
      className={`flex h-11 w-full rounded-md border-2 border-input bg-background px-4 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function Label({ className = '', children, ...props }: any) {
  return (
    <label className={`text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block ${className}`} {...props}>
      {children}
    </label>
  );
}

export default function SignInPage() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isCheckingProviders, setIsCheckingProviders] = useState(true);
  const [isGoogleAvailable, setIsGoogleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const isRedirecting = useRef(false);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const providers = await getProviders();
        setIsGoogleAvailable(Boolean(providers?.google));
      } catch (e) {
        console.error('Erreur lors de la récupération des providers NextAuth:', e);
        setIsGoogleAvailable(false);
      } finally {
        setIsCheckingProviders(false);
      }
    };
    void loadProviders();
  }, []);

  useEffect(() => {
    const authError = searchParams.get('error');
    if (!authError) return;
    if (authError === 'AccessDenied') {
      setError('Connexion Google refusée. Vérifiez que votre email est déjà associé à un compte Ada Papers.');
      return;
    }
    setError('La connexion externe a échoué. Veuillez réessayer.');
  }, [searchParams]);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    
    if (isRedirecting.current) {
      return; // Empêcher les soumissions multiples
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error === 'CredentialsSignin' ? 'Email ou mot de passe incorrect' : result.error);
        setIsLoading(false);
      } else if (result?.ok) {
        try {
          // Une seule lecture de session pour limiter la latence de connexion ressentie.
          const sessionData = await getSession();
          const sessionUser: any = sessionData?.user || {};

          // Stocker le token pour les appels API Axios dès la connexion
          if (sessionUser?.accessToken) {
            try {
              localStorage.setItem('token', sessionUser.accessToken);
              console.log('🔑 Token stocké dans localStorage depuis signin');
            } catch (storageError) {
              console.error('Erreur lors du stockage du token:', storageError);
            }
          }

          isRedirecting.current = true;

          if (sessionUser?.needsPasswordSetup) {
            window.location.href = '/auth/setup-password';
            return;
          }

          const userRole = sessionUser?.role;
          if (userRole === 'admin' || userRole === 'superadmin') {
            window.location.href = '/admin';
            return;
          }

          if (userRole === 'partenaire') {
            window.location.href = '/partenaire';
            return;
          }

          if (sessionUser?.profilComplete === false) {
            window.location.href = '/auth/complete-profile';
            return;
          }

          window.location.href = '/client';
          return;
        } catch (err) {
          console.error('Erreur lors de la lecture de session:', err);
        }

        // Fallback ultra-simple si la session n'est pas encore prête
        isRedirecting.current = true;
        window.location.href = '/client';
      } else {
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error('Erreur lors de la connexion:', err);
      setError('Une erreur est survenue lors de la connexion');
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (isRedirecting.current) return;
    if (!isGoogleAvailable) {
      setError('Connexion Google indisponible. Vérifiez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET.');
      return;
    }
    setError(null);
    setIsGoogleLoading(true);
    try {
      // Evite de réutiliser un ancien token API d'un autre compte.
      localStorage.removeItem('token');
      await signIn('google', { callbackUrl: '/client' });
    } catch (err: any) {
      console.error('Erreur lors de la connexion Google:', err);
      setError('Impossible de se connecter avec Google pour le moment.');
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex bg-gradient-to-br from-primary/5 via-background to-primary/10 relative overflow-x-hidden max-w-[100vw] pt-[env(safe-area-inset-top,0)]">
      {/* Bouton retour — zone tactile 44px sur mobile */}
      <Link href="/" className="absolute top-4 left-3 sm:left-4 z-50 min-h-[44px] min-w-[44px] flex items-center">
        <Button variant="ghost" className="text-foreground hover:bg-primary/10 backdrop-blur-sm py-2.5 px-3 text-sm sm:text-base">
          ← Retour
        </Button>
      </Link>

      {/* Section gauche - Informations */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-primary/80 items-center justify-center p-12 text-white">
        <div className="max-w-md">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4">Bienvenue sur Ada Papers</h1>
            <p className="text-lg text-white/90 mb-6">
              Service d&apos;Accompagnement aux démarches administratives.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">✓</span>
              <div>
                <h3 className="font-semibold mb-1">Accompagnement personnalisé</h3>
                <p className="text-white/80 text-sm">On vous accompagne dans vos démarches de titre de séjour et de visa</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-2xl">✓</span>
              <div>
                <h3 className="font-semibold mb-1">Suivi en temps réel</h3>
                <p className="text-white/80 text-sm">Suivez l&apos;évolution de votre dossier en temps réel</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-2xl">✓</span>
              <div>
                <h3 className="font-semibold mb-1">Expertise reconnue</h3>
                <p className="text-white/80 text-sm">Des professionnels et avocats à votre disposition</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section droite - Formulaire de connexion */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-3 sm:px-4 py-6 sm:py-8 safe-bottom">
        <div className="w-full max-w-md min-w-0">
          {/* Logo */}
          <div className="text-center mb-4">
            <Link href="/" className="inline-block">
              <div className="flex flex-col items-center">
                <span className="text-3xl font-bold text-orange-500 hover:text-orange-600 transition-colors">
                  Ada Papers
                </span>
                <p className="text-[10px] text-muted-foreground font-medium mt-1">
                  Service d&apos;Accompagnement aux démarches administratives
                </p>
              </div>
            </Link>
          </div>
            
          <div className="bg-white rounded-xl shadow-xl border border-border overflow-hidden">
            {/* En-tête amélioré */}
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-4 sm:px-8 py-5 sm:py-6 border-b border-border">
              <div className="text-center">
                <h1 className="text-3xl font-bold text-foreground mb-2">Connexion</h1>
                <p className="text-muted-foreground">
                  Connectez-vous à votre compte Ada Papers
                </p>
              </div>
            </div>

          <div className="p-4 sm:p-6">
            {/* Message d'erreur amélioré */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚠️</span>
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 space-y-2">
                <p className="text-xs text-blue-900/80 text-center font-medium">
                  Connexion rapide avec Google
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 text-sm sm:text-base font-semibold bg-white"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading || isGoogleLoading || isCheckingProviders || isRedirecting.current || !isGoogleAvailable}
                >
                  {isCheckingProviders ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⏳</span>
                      <span>Vérification Google...</span>
                    </span>
                  ) : isGoogleLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⏳</span>
                      <span>Redirection vers Google...</span>
                    </span>
                  ) : !isGoogleAvailable ? (
                    <span className="flex items-center gap-2">
                      <span>⚠️</span>
                      <span>Google indisponible</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span>🔵</span>
                      <span>Continuer avec Google</span>
                    </span>
                  )}
                </Button>
              </div>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-muted-foreground">Ou avec votre email</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e: any) => setEmail(e.target.value)}
                    placeholder="votre@email.com"
                    required
                    disabled={isLoading || isGoogleLoading || isRedirecting.current}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e: any) => setPassword(e.target.value)}
                      placeholder="Votre mot de passe"
                      required
                      className="pr-12"
                      disabled={isLoading || isGoogleLoading || isRedirecting.current}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      disabled={isLoading || isGoogleLoading || isRedirecting.current}
                    >
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Link href="/auth/forgot-password" className="text-sm text-primary hover:underline font-medium">
                    Mot de passe oublié ?
                  </Link>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 sm:h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
                disabled={isLoading || isGoogleLoading || isRedirecting.current}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span>
                    <span>Connexion...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span>🚀</span>
                    <span>Se connecter</span>
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-border text-center">
              <p className="text-sm text-muted-foreground">
                Vous n'avez pas de compte ?{' '}
                <Link href="/auth/signup" className="text-primary hover:underline font-semibold">
                  Créer un compte
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
