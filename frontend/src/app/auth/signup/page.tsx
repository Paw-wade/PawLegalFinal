'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
        className={`flex h-11 w-full rounded-md border-2 border-input bg-background px-4 py-2.5 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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

export default function SignupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
          } else if (!/^(\+33|0)[1-9](\d{2}){4}$/.test(value.replace(/\s/g, ''))) {
            errors.phone = 'Numéro de téléphone invalide';
          } else {
            delete errors.phone;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    const email = formData.email.trim().toLowerCase();
    const cleanedPhone = formData.phone.replace(/\s/g, '');

    if (!firstName || !lastName || !email || !cleanedPhone) {
      setError('Veuillez remplir tous les champs obligatoires');
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
        // Rediriger directement vers l'accueil après création du compte
        router.push('/');
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

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-primary/5 via-background to-primary/10 relative">
      <Link href="/" className="absolute top-4 left-4 z-50">
        <Button variant="ghost" className="text-foreground hover:bg-primary/10 backdrop-blur-sm">
          &larr; Retour à l&apos;accueil
        </Button>
      </Link>

      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-primary/80 items-center justify-center p-12 text-white">
        <div className="max-w-md">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4">Rejoignez Ada Papers</h1>
            <p className="text-lg text-white/90 mb-6">
              Service d&apos;Accompagnement aux démarches administratives.
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
                <p className="text-white/80 text-sm">Vérification par SMS pour votre sécurité</p>
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

      <div className="w-full lg:w-1/2 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
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
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-8 py-6 border-b border-border">
              <div className="text-center">
                <h1 className="text-3xl font-bold text-foreground mb-2">
                  Création de compte
                </h1>
                <p className="text-muted-foreground">
                  Créez votre compte Ada Papers
                </p>
              </div>
            </div>

            <div className="p-8">
              {error && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚠️</span>
                    <p className="text-sm font-medium text-red-800">{error}</p>
                  </div>
                </div>
              )}

              {/* Message de succès supprimé : on redirige directement vers l'accueil */}

              <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
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
                      {/* Email désormais requis pour la création de compte */}
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="votre.email@exemple.com"
                        autoComplete="email"
                        required
                      />
                    </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">Numéro de téléphone *</Label>
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={handleChange}
                          onBlur={(e) => validateField('phone', e.target.value)}
                          placeholder="07 68 03 33 58"
                          autoComplete="tel"
                          className={fieldErrors.phone ? 'border-red-500 focus:border-red-500' : ''}
                        />
                        {fieldErrors.phone && (
                          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <span>⚠️</span>
                            <span>{fieldErrors.phone}</span>
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Un mot de passe temporaire vous sera envoyé par SMS
                        </p>
                      </div>

                      <Button
                        type="submit"
                        className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <span className="flex items-center gap-2">
                            <span className="animate-spin">⏳</span>
                            <span>Envoi en cours...</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span>📱</span>
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

