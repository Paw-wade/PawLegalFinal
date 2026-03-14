'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const isRedirecting = useRef(false);

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
        // Essayer d'obtenir le message d'erreur exact du backend
        try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api';
          const loginResponse = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
          });
          
          const loginData = await loginResponse.json();
          setError(loginData.message || 'Email ou mot de passe incorrect');
        } catch (err) {
          // Si l'appel direct échoue, utiliser le message d'erreur de NextAuth
          setError(result.error === 'CredentialsSignin' ? 'Email ou mot de passe incorrect' : result.error);
        }
        setIsLoading(false);
      } else if (result?.ok) {
        // Récupérer le token et les infos utilisateur depuis le backend
        try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api';
          const loginResponse = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
          });
          const loginData = await loginResponse.json();
          if (loginData.success && loginData.token) {
            // Stocker le token immédiatement
            try {
              localStorage.setItem('token', loginData.token);
              console.log('🔑 Token stocké dans localStorage depuis signin');
            } catch (e) {
              console.error('Erreur lors du stockage du token:', e);
            }
            
            // Si l'utilisateur doit personnaliser son mot de passe, le rediriger vers la page dédiée
            if (loginData.user?.needsPasswordSetup) {
              isRedirecting.current = true;
              window.location.href = '/auth/setup-password';
              return;
            }

            // Utiliser les données de la réponse pour rediriger immédiatement selon le rôle
            const userRole = loginData.user?.role;
            isRedirecting.current = true;
            
            // Les rôles admin et superadmin accèdent au dashboard admin
            if (userRole === 'admin' || userRole === 'superadmin') {
              window.location.href = '/admin';
            } else if (userRole === 'partenaire') {
              window.location.href = '/partenaire';
            } else {
              // Ne pas forcer la complétion immédiate, mais vérifier le délai de 7 jours
              const daysRemaining = loginData.user?.daysRemaining;
              if (daysRemaining !== null && daysRemaining <= 0) {
                // Le délai est dépassé, rediriger vers la page de complétion avec un message
                window.location.href = '/auth/complete-profile?expired=true';
              } else {
                window.location.href = '/client';
              }
            }
            return; // Sortir immédiatement
          }
        } catch (err) {
          console.error('Erreur lors de la récupération du token:', err);
        }
        
        // Fallback : attendre un peu et récupérer la session
        setTimeout(async () => {
          if (isRedirecting.current) return;
          
          try {
            const sessionResponse = await fetch('/api/auth/session');
            const sessionData = await sessionResponse.json();
            const userRole = sessionData?.user?.role;
            
            isRedirecting.current = true;
            
            // Les rôles admin et superadmin accèdent au dashboard admin
            if (userRole === 'admin' || userRole === 'superadmin') {
              window.location.href = '/admin';
            } else if (userRole === 'partenaire') {
              window.location.href = '/partenaire';
            } else {
              const profilComplete = sessionData?.user?.profilComplete;
              if (!profilComplete) {
                window.location.href = '/auth/complete-profile';
              } else {
                window.location.href = '/client';
              }
            }
          } catch (err) {
            console.error('Erreur lors de la récupération de la session:', err);
            isRedirecting.current = true;
            window.location.href = '/client';
          }
        }, 300);
      } else {
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error('Erreur lors de la connexion:', err);
      setError('Une erreur est survenue lors de la connexion');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-primary/5 via-background to-primary/10 relative">
      {/* Bouton retour à l'accueil - Position fixe en haut à gauche */}
      <Link href="/" className="absolute top-4 left-4 z-50">
        <Button variant="ghost" className="text-foreground hover:bg-primary/10 backdrop-blur-sm">
          ← Retour à l'accueil
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
                <p className="text-white/80 text-sm">Un avocat dédié pour suivre votre dossier</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-2xl">✓</span>
              <div>
                <h3 className="font-semibold mb-1">Suivi en temps réel</h3>
                <p className="text-white/80 text-sm">Accès à vos documents 24/7</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-2xl">✓</span>
              <div>
                <h3 className="font-semibold mb-1">Expertise reconnue</h3>
                <p className="text-white/80 text-sm">Plus de 10 ans d'expérience</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section droite - Formulaire de connexion */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-6">
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
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-8 py-6 border-b border-border">
              <div className="text-center">
                <h1 className="text-3xl font-bold text-foreground mb-2">Connexion</h1>
                <p className="text-muted-foreground">
                  Connectez-vous à votre compte Ada Papers
                </p>
              </div>
            </div>

          <div className="p-8">
            {/* Message d'erreur amélioré */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚠️</span>
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
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
                  disabled={isLoading || isRedirecting.current}
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
                    disabled={isLoading || isRedirecting.current}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    disabled={isLoading || isRedirecting.current}
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

              <Button 
                type="submit" 
                className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all" 
                disabled={isLoading || isRedirecting.current}
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
