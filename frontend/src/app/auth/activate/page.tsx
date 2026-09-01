'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSession, signIn } from 'next-auth/react';
import { authAPI } from '@/lib/api';
import { FloatingField } from '@/components/ui/FloatingField';

function Button({
  children,
  variant = 'default',
  className = '',
  disabled = false,
  type = 'button',
  ...props
}: {
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  [key: string]: unknown;
}) {
  const baseClasses =
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return (
    <button type={type} disabled={disabled} className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = '', ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={`flex h-11 w-full rounded-md border-2 border-input bg-background px-4 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
});

function Label({ className = '', children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block ${className}`} {...props}>
      {children}
    </label>
  );
}

function ActivateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!searchParams.get('token')) {
      setError('Lien d’activation manquant ou incomplet.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Lien d’activation manquant ou incomplet.');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await authAPI.completeSignup({ token, password });

      if (!data.success || !data.token || !data.user?.email) {
        setError('Réponse inattendue du serveur.');
        return;
      }

      localStorage.setItem('token', data.token);

      const result = await signIn('credentials', {
        email: data.user.email,
        password,
        redirect: false,
      });

      if (result?.error) {
        router.push(`/auth/signin?email=${encodeURIComponent(data.user.email)}`);
        return;
      }

      if (result?.ok) {
        const sessionData = await getSession();
        const sessionUser: any = sessionData?.user || {};
        if (sessionUser?.accessToken) {
          localStorage.setItem('token', sessionUser.accessToken);
        }

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
      }

      window.location.href = '/client';
    } catch (err: any) {
      console.error('Erreur activation compte:', err);
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.response?.data?.errors) {
        const messages = err.response.data.errors.map((e: any) => e.msg || e.message).join(', ');
        setError(messages);
      } else {
        setError('Impossible d’activer le compte. Réessayez ou demandez un nouvel email d’inscription.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-12">
        <div className="w-full max-w-md rounded-xl border border-border bg-white p-8 shadow-xl text-center space-y-4">
          <p className="text-foreground font-medium">Lien d’activation invalide</p>
          <p className="text-sm text-muted-foreground">
            Ouvrez le lien reçu dans votre email d’inscription, ou créez un nouveau compte.
          </p>
          <Link href="/auth/signup">
            <Button className="w-full">Retour à l’inscription</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground">
          ← Retour à l’accueil
        </Link>
        <div className="bg-white rounded-xl shadow-xl border border-border overflow-hidden">
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-8 py-6 border-b border-border text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Activer votre compte</h1>
            <p className="text-muted-foreground text-sm">Choisissez un mot de passe sécurisé pour finaliser votre inscription.</p>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <FloatingField label="Mot de passe" required type="password" autoComplete="new-password"
                value={password} onChange={(v) => setPassword(v)} />
              <FloatingField label="Confirmer le mot de passe" required type="password" autoComplete="new-password"
                value={confirmPassword} onChange={(v) => setConfirmPassword(v)} />

              <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isLoading}>
                {isLoading ? 'Activation…' : 'Activer mon compte'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Déjà activé ?{' '}
              <Link href="/auth/signin" className="text-primary font-semibold hover:underline">
                Se connecter
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10">
          <p className="text-muted-foreground">Chargement…</p>
        </div>
      }
    >
      <ActivateForm />
    </Suspense>
  );
}
