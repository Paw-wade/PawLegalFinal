'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { FloatingField } from '@/components/ui/FloatingField';
import { authAPI } from '@/lib/api';
import { useAutoFillDetection, getRealInputValues } from '@/hooks/useAutoFillDetection';

// Composants simplifiés intégrés
function Button({ 
  children, 
  variant = 'default', 
  size = 'default', 
  className = '',
  disabled = false,
  type = 'button',
  ...props 
}: {
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
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
  
  const sizeClasses = {
    default: 'h-10 py-2 px-4',
    sm: 'h-9 px-3',
    lg: 'h-11 px-8',
    icon: 'h-10 w-10',
  };
  
  return (
    <button
      type={type}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const Input = React.forwardRef<HTMLInputElement, any>(({ className = '', ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`flex h-11 w-full rounded-md border-2 border-input bg-background px-4 py-2.5 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
});
Input.displayName = 'Input';

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

export default function SetupPasswordPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // États pour les valeurs du formulaire
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  });

  // États pour les erreurs de validation
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Refs pour détecter l'auto-remplissage
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);

  // Vérifier si l'utilisateur est connecté
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth/signup');
    }
  }, [router]);

  // Détecter l'auto-remplissage du navigateur
  useAutoFillDetection({
    inputRefs: {
      password: passwordInputRef,
      confirmPassword: confirmPasswordInputRef,
    },
    formData,
    setFormData: (updater) => setFormData(updater as React.SetStateAction<typeof formData>),
  });

  const validateField = (name: string, value: string) => {
    const errors: Record<string, string> = { ...fieldErrors };
    
    switch (name) {
      case 'password':
        if (!value || value.length === 0) {
          errors.password = 'Le mot de passe est requis';
        } else if (value.length < 8) {
          errors.password = 'Le mot de passe doit contenir au moins 8 caractères';
        } else {
          delete errors.password;
        }
        // Vérifier aussi la confirmation si elle existe
        if (formData.confirmPassword && value !== formData.confirmPassword) {
          errors.confirmPassword = 'Les mots de passe ne correspondent pas';
        } else if (formData.confirmPassword) {
          delete errors.confirmPassword;
        }
        break;
      case 'confirmPassword':
        if (!value || value.length === 0) {
          errors.confirmPassword = 'Veuillez confirmer votre mot de passe';
        } else if (value !== formData.password) {
          errors.confirmPassword = 'Les mots de passe ne correspondent pas';
        } else {
          delete errors.confirmPassword;
        }
        break;
    }
    
    setFieldErrors(errors);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Valider le champ modifié
    validateField(name, value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Récupérer les valeurs réelles des inputs DOM pour détecter l'auto-remplissage
    const realValues = getRealInputValues({
      password: passwordInputRef,
      confirmPassword: confirmPasswordInputRef,
    }, formData);

    // Mettre à jour l'état avec les valeurs réelles
    setFormData(realValues);
    
    // Valider tous les champs avec les valeurs réelles
    validateField('password', realValues.password);
    validateField('confirmPassword', realValues.confirmPassword);

    // Vérifier s'il y a des erreurs
    if (fieldErrors.password || fieldErrors.confirmPassword) {
      setError('Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    // Vérifications finales avec les valeurs réelles
    if (!realValues.password || realValues.password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (realValues.password !== realValues.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setIsLoading(true);

    try {
      const setupData: { password: string } = {
        password: realValues.password,
      };

      const response = await authAPI.setupPassword(setupData);

      if (response.data.success) {
        // Connecter automatiquement l'utilisateur avec NextAuth
        const result = await signIn('credentials', {
          redirect: false,
        });

        if (result?.ok) {
          // Proposer de compléter le profil (nouveaux comptes)
          router.push('/auth/complete-profile');
        } else {
          // Si la connexion automatique échoue, proposer quand même la complétion du profil
          router.push('/auth/complete-profile');
        }
      }
    } catch (err: any) {
      console.error('Erreur lors de la définition du mot de passe:', err);
      
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.response?.data?.errors) {
        const errorMessages = err.response.data.errors.map((e: any) => e.msg || e.message).join(', ');
        setError(errorMessages);
      } else {
        setError('Une erreur est survenue lors de la définition du mot de passe. Veuillez réessayer.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-xl border border-border overflow-hidden">
          {/* En-tête amélioré */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-8 py-6 border-b border-border">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <span className="text-white font-bold text-2xl">🔐</span>
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Définir votre mot de passe</h1>
              <p className="text-muted-foreground">
                Créez un mot de passe sécurisé pour accéder à votre compte
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

            <form onSubmit={handleSubmit} className="space-y-5">
              <FloatingField label="Mot de passe" required type="password" name="password" autoComplete="new-password" inputRef={passwordInputRef}
                value={formData.password}
                onChange={(v) => handleChange({ target: { name: 'password', value: v } } as any)}
                onBlur={(v) => validateField('password', v)} error={fieldErrors.password} />

              <div className="space-y-1">
                <FloatingField label="Confirmer le mot de passe" required type="password" name="confirmPassword" autoComplete="new-password" inputRef={confirmPasswordInputRef}
                  value={formData.confirmPassword}
                  onChange={(v) => handleChange({ target: { name: 'confirmPassword', value: v } } as any)}
                  onBlur={(v) => validateField('confirmPassword', v)} error={fieldErrors.confirmPassword} />
                {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <span>⚠️</span>
                    <span>Les mots de passe ne correspondent pas</span>
                  </p>
                )}
                {formData.password && formData.confirmPassword && formData.password === formData.confirmPassword && formData.password.length >= 8 && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <span>✅</span>
                    <span>Les mots de passe correspondent</span>
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
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
                    <span>Finaliser mon compte</span>
                  </span>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

