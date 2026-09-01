'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import { FloatingField } from '@/components/ui/FloatingField';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses =
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses: Record<string, string> = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return (
    <button className={`${baseClasses} ${variantClasses[variant] || ''} ${className}`} {...props}>
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
    <label
      className={`text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block ${className}`}
      {...props}
    >
      {children}
    </label>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setErrorMessage('Lien de réinitialisation invalide. Veuillez refaire une demande de mot de passe oublié.');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (password !== confirmPassword) {
      setErrorMessage('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setIsSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await authAPI.resetPassword({ token, password });
      if (response.data?.success) {
        setSuccessMessage(
          'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.'
        );
        setTimeout(() => {
          router.push('/auth/signin');
        }, 2500);
      } else {
        setErrorMessage(response.data?.message || 'Une erreur est survenue lors de la réinitialisation du mot de passe.');
      }
    } catch (error: any) {
      console.error('Erreur lors de la réinitialisation du mot de passe:', error);
      const apiMessage = error?.response?.data?.message;
      setErrorMessage(apiMessage || 'Lien invalide ou expiré. Veuillez refaire une demande de mot de passe oublié.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-primary/5 via-background to-primary/10 relative">
      <Link href="/" className="absolute top-4 left-4 z-50">
        <Button variant="ghost" className="text-foreground hover:bg-primary/10 backdrop-blur-sm">
          ← Retour à l'accueil
        </Button>
      </Link>

      <div className="w-full flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
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
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-8 py-6 border-b border-border">
              <div className="text-center">
                <h1 className="text-3xl font-bold text-foreground mb-2">Définir un nouveau mot de passe</h1>
                <p className="text-muted-foreground text-sm">
                  Choisissez un nouveau mot de passe sécurisé pour votre compte.
                </p>
              </div>
            </div>

            <div className="p-8">
              {successMessage && (
                <div className="mb-4 p-4 bg-green-50 border-l-4 border-green-500 rounded-lg">
                  <p className="text-sm text-green-800">{successMessage}</p>
                </div>
              )}
              {errorMessage && (
                <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
                  <p className="text-sm text-red-800">{errorMessage}</p>
                </div>
              )}

              {!token ? (
                <div className="text-sm text-muted-foreground">
                  Le lien utilisé est invalide. Veuillez retourner sur la page{' '}
                  <Link href="/auth/forgot-password" className="text-primary hover:underline font-semibold">
                    Mot de passe oublié
                  </Link>{' '}
                  et refaire une demande.
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <FloatingField label="Nouveau mot de passe" required type="password" autoComplete="new-password" disabled={isSubmitting}
                    value={password} onChange={(v) => setPassword(v)} />
                  <FloatingField label="Confirmer le nouveau mot de passe" required type="password" autoComplete="new-password" disabled={isSubmitting}
                    value={confirmPassword} onChange={(v) => setConfirmPassword(v)} />

                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
                  </Button>
                </form>
              )}

              <div className="mt-6 pt-4 border-t border-border text-center">
                <p className="text-sm text-muted-foreground">
                  Retour à la{' '}
                  <Link href="/auth/signin" className="text-primary hover:underline font-semibold">
                    page de connexion
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Chargement...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
