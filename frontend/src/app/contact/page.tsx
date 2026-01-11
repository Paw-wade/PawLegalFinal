'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { contactAPI } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useAutoFillDetection, getRealInputValues } from '@/hooks/useAutoFillDetection';

function Button({ children, variant = 'default', className = '', disabled = false, type = 'button', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border-2 border-primary text-primary hover:bg-primary hover:text-white',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return <button type={type} disabled={disabled} className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

const Input = React.forwardRef<HTMLInputElement, any>(({ className = '', ...props }, ref) => {
  return (
    <input 
      ref={ref}
      className={`flex h-11 w-full rounded-lg border-2 border-input bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all ${className}`} 
      {...props} 
    />
  );
});
Input.displayName = 'Input';

function Label({ children, required, ...props }: any) {
  return (
    <label className="text-sm font-semibold leading-none mb-2 block text-foreground" {...props}>
      {children}
      {required && <span className="text-primary ml-1">*</span>}
    </label>
  );
}

const Textarea = React.forwardRef<HTMLTextAreaElement, any>(({ className = '', ...props }, ref) => {
  return (
    <textarea 
      ref={ref}
      className={`flex min-h-[120px] w-full rounded-lg border-2 border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all resize-y ${className}`} 
      {...props} 
    />
  );
});
Textarea.displayName = 'Textarea';

export default function ContactPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Refs pour détecter l'auto-remplissage
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // Détecter l'auto-remplissage du navigateur
  useAutoFillDetection({
    inputRefs: {
      name: nameInputRef,
      email: emailInputRef,
      phone: phoneInputRef,
      subject: subjectInputRef,
      message: messageInputRef,
    },
    formData,
    setFormData: (updater) => setFormData(updater),
  });

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo en bytes
  const MAX_FILES = 5;

  const handleChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const errors: string[] = [];
    const validFiles: File[] = [];

    // Vérifier le nombre de fichiers
    if (files.length + selectedFiles.length > MAX_FILES) {
      errors.push(`Vous ne pouvez pas télécharger plus de ${MAX_FILES} fichiers`);
      setFileErrors(errors);
      return;
    }

    selectedFiles.forEach((file) => {
      // Vérifier la taille
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name} dépasse la taille maximale de 5 Mo`);
      } else {
        validFiles.push(file);
      }
    });

    if (errors.length > 0) {
      setFileErrors(errors);
    } else {
      setFileErrors([]);
      setFiles([...files, ...validFiles]);
    }

    // Réinitialiser l'input pour permettre de sélectionner le même fichier
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
    setFileErrors([]);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(2) + ' Mo';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(false);
    setFileErrors([]);

    // Récupérer les valeurs réelles des inputs DOM pour détecter l'auto-remplissage
    const realValues = getRealInputValues({
      name: nameInputRef,
      email: emailInputRef,
      phone: phoneInputRef,
      subject: subjectInputRef,
      message: messageInputRef,
    }, formData);

    // Mettre à jour l'état avec les valeurs réelles
    setFormData(realValues);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', realValues.name);
      formDataToSend.append('email', realValues.email);
      formDataToSend.append('phone', realValues.phone || '');
      formDataToSend.append('subject', realValues.subject);
      formDataToSend.append('message', realValues.message);

      // Ajouter les fichiers
      files.forEach((file) => {
        formDataToSend.append('documents', file);
      });

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api'}/contact`, {
        method: 'POST',
        body: formDataToSend,
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
        setFiles([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        // Rediriger vers la page de création de compte après 1.5 secondes
        setTimeout(() => {
          router.push('/auth/signup');
        }, 1500);
      } else {
        setError(data.message || 'Une erreur est survenue');
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors de l\'envoi du message');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/10">
      <Header variant="home" />

      {/* Hero Section */}
      <section className="relative py-16 bg-gradient-to-br from-primary/10 via-primary/5 to-background overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-block mb-4 px-4 py-2 bg-primary/10 rounded-full border border-primary/20">
              <span className="text-sm font-medium text-primary">Contactez-nous</span>
            </div>
            <h1 className="text-5xl font-bold mb-6 text-foreground leading-tight">
              Nous sommes à votre <span className="text-primary">écoute</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Une question ? Un projet ? Contactez notre équipe d'experts juridiques pour un accompagnement personnalisé
            </p>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Formulaire - 2 colonnes */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-3xl shadow-xl p-8 lg:p-10 border-2 border-primary/10">
                <h2 className="text-3xl font-bold mb-6 text-foreground">Envoyez-nous un message</h2>

                {success && (
                  <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-800">✓ Votre message a été envoyé avec succès ! Nous vous répondrons dans les plus brefs délais.</p>
                  </div>
                )}

                {error && (
                  <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
                    <p className="text-sm font-medium text-red-800">{error}</p>
                  </div>
                )}

                {fileErrors.length > 0 && (
                  <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
                    {fileErrors.map((err, i) => (
                      <p key={i} className="text-sm font-medium text-red-800">⚠ {err}</p>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="name" required>Nom complet</Label>
                      <Input 
                        ref={nameInputRef}
                        id="name" 
                        name="name" 
                        value={formData.name} 
                        onChange={handleChange} 
                        placeholder="Votre nom complet"
                        autoComplete="name"
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="email" required>Email</Label>
                      <Input 
                        ref={emailInputRef}
                        id="email" 
                        name="email" 
                        type="email" 
                        value={formData.email} 
                        onChange={handleChange} 
                        placeholder="votre@email.com"
                        autoComplete="email"
                        required 
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="phone">Téléphone</Label>
                      <Input 
                        ref={phoneInputRef}
                        id="phone" 
                        name="phone" 
                        type="tel" 
                        value={formData.phone} 
                        onChange={handleChange} 
                        placeholder="06 12 34 56 78"
                        autoComplete="tel"
                      />
                    </div>
                    <div>
                      <Label htmlFor="subject" required>Sujet</Label>
                      <Input 
                        ref={subjectInputRef}
                        id="subject" 
                        name="subject" 
                        value={formData.subject} 
                        onChange={handleChange} 
                        placeholder="Objet de votre message"
                        required 
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="message" required>Message</Label>
                    <Textarea 
                      ref={messageInputRef}
                      id="message" 
                      name="message" 
                      value={formData.message} 
                      onChange={handleChange} 
                      placeholder="Décrivez votre demande ou votre question..."
                      required 
                    />
                  </div>

                  {/* Upload de documents */}
                  <div>
                    <Label htmlFor="documents">Documents joints (optionnel)</Label>
                    <div className="mt-2">
                      <div className="flex items-center gap-4">
                        <input
                          ref={fileInputRef}
                          type="file"
                          id="documents"
                          multiple
                          onChange={handleFileChange}
                          className="hidden"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        />
                        <label
                          htmlFor="documents"
                          className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-primary/30 rounded-lg cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
                        >
                          <span className="text-2xl">📎</span>
                          <span className="text-sm font-medium text-foreground">
                            {files.length === 0 ? 'Ajouter des documents' : `Ajouter d'autres documents`}
                          </span>
                        </label>
                        {files.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {files.length} fichier{files.length > 1 ? 's' : ''} sélectionné{files.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Maximum {MAX_FILES} fichiers, 5 Mo par fichier. Formats acceptés : PDF, DOC, DOCX, JPG, PNG
                      </p>

                      {/* Liste des fichiers */}
                      {files.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {files.map((file, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <span className="text-xl">📄</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFile(index)}
                                className="ml-3 text-red-500 hover:text-red-700 transition-colors"
                                aria-label="Supprimer le fichier"
                              >
                                <span className="text-lg">×</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isLoading}>
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin">⏳</span>
                        Envoi en cours...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span>📧</span>
                        Envoyer le message
                      </span>
                    )}
                  </Button>
                </form>
              </div>
            </div>

            {/* Informations de contact - 1 colonne */}
            <div className="lg:col-span-1">
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl shadow-xl p-8 border-2 border-primary/20 sticky top-24">
                <h2 className="text-2xl font-bold mb-6 text-foreground">Informations de contact</h2>
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl">📧</span>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground mb-1">Email</p>
                      <a href="mailto:contact@pawlegal.fr" className="text-primary hover:underline text-sm">
                        contact@pawlegal.fr
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl">📞</span>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground mb-1">Téléphone</p>
                      <a href="tel:0768033358" className="text-primary hover:underline text-sm">
                        07 68 03 33 58
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl">🕐</span>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground mb-1">Horaires</p>
                      <p className="text-muted-foreground text-sm">
                        Lundi - Vendredi<br />
                        9h - 18h
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-border">
                    <p className="text-sm text-muted-foreground mb-4">
                      Réponse sous 24h pour toutes vos demandes
                    </p>
                    <Link href="/faq">
                      <Button variant="outline" className="w-full">
                        Consulter la FAQ
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
