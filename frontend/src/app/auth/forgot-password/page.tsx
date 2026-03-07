'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authAPI } from '@/lib/api';

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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      await authAPI.forgotPassword({ email });
      setSuccessMessage(
        "Si cet email est associé à un compte, un lien de réinitialisation de mot de passe vient de vous être envoyé."
      );
    } catch (error: any) {
      console.error('Erreur lors de la demande de réinitialisation:', error);
      setErrorMessage("Une erreur est survenue. Veuillez réessayer dans quelques instants.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-primary/5 via-background to-primary/10 relative">
      <Link href="/" className="absolute top-4 left-4 z-50">
        <Button variant="ghost" className="text-foreground hover:bg-primary/10 backdrop-blur-sm">
          ← Retour à l&apos;accueil
        </Button>
      </Link>

      <div className="w-full flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <Link href="/" className="inline-block">
              <div className="flex flex-col items-center">
                <span className="text-3xl font-bold text-orange-500 hover:text-orange-600 transition-colors">
                  ADA Pappers
                </span>
                <p className="text-[10px] text-muted-foreground font-medium mt-1">
                  Service d&apos;Accompagnement aux démarches administratives
                </p>
              </div>
            </Link>
          </div>

          <div className="bg-white rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-8 py-6 border-b border-border">
              <div className="text-center">
                <h1 className="text-3xl font-bold text-foreground mb-2">Mot de passe oublié</h1>
                <p className="text-muted-foreground text-sm">
                  Indiquez l&apos;adresse email associée à votre compte pour recevoir un lien de réinitialisation.
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
                    disabled={isSubmitting}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
                </Button>
              </form>

              <div className="mt-6 pt-4 border-t border-border text-center">
                <p className="text-sm text-muted-foreground">
                  Vous vous souvenez de votre mot de passe ?{' '}
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

