'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getProviders, signIn, useSession } from 'next-auth/react';
import { authAPI, otpAPI } from '@/lib/api';
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
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  [key: string]: any;
}) {
  const base = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variants = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
  };
  return (
    <button type={type} disabled={disabled} className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

function redirectAfterLogin(role: string, profilComplete: boolean, needsPasswordSetup: boolean) {
  if (needsPasswordSetup) { window.location.href = '/auth/setup-password'; return; }
  if (role === 'admin' || role === 'superadmin') { window.location.href = '/admin'; return; }
  if (role === 'partenaire') { window.location.href = '/partenaire'; return; }
  if (!profilComplete) { window.location.href = '/auth/complete-profile'; return; }
  let redirect = '/client';
  try {
    const saved = localStorage.getItem('ada_signup_redirect');
    if (saved) { localStorage.removeItem('ada_signup_redirect'); redirect = saved; }
  } catch { /* rien */ }
  window.location.href = redirect;
}

// ─── Etape 2 : ecran de verification WhatsApp ───────────────────────────────

function WhatsappVerifScreen({
  phone,
  waLink,
  waPhone,
  expiresAt,
  onBack,
}: {
  phone: string;
  waLink: string;
  waPhone: string;
  expiresAt: string;
  onBack: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(180);
  const [smsSent, setSmsSent] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsCode, setSmsCode] = useState('');
  const [smsVerifyLoading, setSmsVerifyLoading] = useState(false);
  const [smsVerifyError, setSmsVerifyError] = useState<string | null>(null);
  const [status, setStatus] = useState<'waiting' | 'connected' | 'expired'>('waiting');

  useEffect(() => {
    if (secondsLeft <= 0) { setStatus('expired'); return; }
    const t = setInterval(() => setSecondsLeft((s) => { if (s <= 1) { clearInterval(t); setStatus('expired'); return 0; } return s - 1; }), 1000);
    return () => clearInterval(t);
  }, []);

  // Polling wa-status toutes les 2.5s
  useEffect(() => {
    if (status !== 'waiting') return;
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const { data } = await otpAPI.waStatus(phone);
        if (data?.verified && data?.token) {
          if (!active) return;
          setStatus('connected');
          localStorage.setItem('token', data.token);
          const result = await signIn('token-login', { token: data.token, redirect: false });
          const role = (result as any)?.user?.role || 'client';
          const profilComplete = (result as any)?.user?.profilComplete ?? false;
          const needsPasswordSetup = (result as any)?.user?.needsPasswordSetup ?? true;
          redirectAfterLogin(role, profilComplete, needsPasswordSetup);
        }
      } catch { /* ignore */ }
      if (active && status === 'waiting') {
        setTimeout(poll, 2500);
      }
    };
    const t = setTimeout(poll, 2500);
    return () => { active = false; clearTimeout(t); };
  }, [status, phone]);

  const handleSendSms = async () => {
    setSmsLoading(true);
    setSmsError(null);
    try {
      await otpAPI.sendSms({ phone });
      setSmsSent(true);
    } catch (err: any) {
      setSmsError(err?.response?.data?.message || 'Impossible d\'envoyer le SMS.');
    } finally {
      setSmsLoading(false);
    }
  };

  const handleVerifySmsCode = async () => {
    if (!smsCode || smsCode.length !== 6) {
      setSmsVerifyError('Entrez les 6 chiffres du code SMS.');
      return;
    }
    setSmsVerifyLoading(true);
    setSmsVerifyError(null);
    try {
      const { data } = await otpAPI.verify({ phone, code: smsCode });
      if (data?.token) {
        localStorage.setItem('token', data.token);
        const result = await signIn('token-login', { token: data.token, redirect: false });
        const role = (result as any)?.user?.role || 'client';
        const profilComplete = (result as any)?.user?.profilComplete ?? false;
        const needsPasswordSetup = (result as any)?.user?.needsPasswordSetup ?? true;
        redirectAfterLogin(role, profilComplete, needsPasswordSetup);
      } else {
        setSmsVerifyError('Code incorrect ou expire.');
      }
    } catch (err: any) {
      setSmsVerifyError(err?.response?.data?.message || 'Code incorrect ou expire.');
    } finally {
      setSmsVerifyLoading(false);
    }
  };

  if (status === 'connected') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="text-5xl">✅</div>
        <p className="text-lg font-bold text-emerald-700">Compte verifie ! Connexion en cours...</p>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="text-5xl">⏳</div>
        <p className="text-base font-semibold text-red-700">Le code a expire.</p>
        <Button variant="outline" onClick={onBack}>Recommencer</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-1">
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#25D366] text-white font-semibold text-sm hover:bg-[#1ebe5d] transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Ouvrir WhatsApp
        </a>
        <p className="text-xs text-muted-foreground">Code pre-rempli, appuyez juste sur Envoyer.</p>
        <p className="text-xs text-muted-foreground">
          Expire dans{' '}
          <span className={`font-mono font-semibold ${secondsLeft <= 30 ? 'text-red-500' : ''}`}>
            {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
          </span>
        </p>
      </div>

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-muted-foreground">Pas de WhatsApp ?</span>
        </div>
      </div>

      {!smsSent ? (
        <div className="flex flex-col items-center gap-2">
          {smsError && <p className="text-xs text-red-600 text-center">{smsError}</p>}
          <Button
            variant="outline"
            className="h-10 text-sm px-6"
            disabled={smsLoading}
            onClick={handleSendSms}
          >
            {smsLoading ? 'Envoi...' : 'Recevoir le code par SMS'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-center text-muted-foreground">Code SMS envoye au {phone}. Saisissez-le :</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={smsCode}
            onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ''))}
            className="flex h-11 w-full rounded-md border-2 border-input bg-background px-4 py-2 text-center text-xl font-bold tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors"
          />
          {smsVerifyError && <p className="text-xs text-red-600 text-center">{smsVerifyError}</p>}
          <Button
            className="w-full h-10"
            disabled={smsVerifyLoading || smsCode.length !== 6}
            onClick={handleVerifySmsCode}
          >
            {smsVerifyLoading ? 'Verification...' : 'Valider le code SMS'}
          </Button>
        </div>
      )}

      <button
        type="button"
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-foreground underline w-full text-center"
      >
        Recommencer l'inscription
      </button>
    </div>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────

const REDIRECT_DELAY_MS = 2600;

export default function SignupPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGoogleAvailable, setIsGoogleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [phoneCountryCode, setPhoneCountryCode] = useState('+33');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Etape WhatsApp
  const [waStep, setWaStep] = useState<null | {
    phone: string;
    waLink: string;
    waPhone: string;
    expiresAt: string;
  }>(null);

  useEffect(() => {
    return () => { if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current); };
  }, []);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const providers = await getProviders();
        setIsGoogleAvailable(Boolean(providers?.['google-signup']));
      } catch { setIsGoogleAvailable(false); }
    };
    void loadProviders();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email');
    if (emailParam) setFormData((p) => (p.email ? p : { ...p, email: emailParam }));
    const redirectParam = params.get('redirect');
    if (redirectParam) { try { localStorage.setItem('ada_signup_redirect', redirectParam); } catch { /* rien */ } }
  }, []);

  useEffect(() => {
    const user: any = session?.user;
    if (!user) return;
    if (user.accessToken) {
      const role = user.role;
      if (role === 'admin' || role === 'superadmin') router.replace('/admin');
      else if (role === 'partenaire') router.replace('/partenaire');
      else if (user.profilComplete === false) router.replace('/auth/complete-profile');
      else router.replace('/client');
      return;
    }
    if (user.googleSignupPending) {
      setFormData((p) => ({
        ...p,
        firstName: p.firstName || user.googleFirstName || '',
        lastName: p.lastName || user.googleLastName || '',
        email: p.email || user.email || '',
      }));
    }
  }, [session, router]);

  const validateField = (name: string, value: string) => {
    setFieldErrors((prev) => {
      const e = { ...prev };
      if (name === 'firstName') {
        if (!value.trim() || value.trim().length < 2) e.firstName = 'Prenom invalide (2 caracteres min)';
        else delete e.firstName;
      }
      if (name === 'lastName') {
        if (!value.trim() || value.trim().length < 2) e.lastName = 'Nom invalide (2 caracteres min)';
        else delete e.lastName;
      }
      if (name === 'phone') {
        const digits = value.replace(/\D/g, '');
        if (!digits) { e.phone = 'Numero requis'; }
        else if (phoneCountryCode === '+33' && !/^(0?[1-9]\d{8})$/.test(digits)) { e.phone = 'Numero francais invalide'; }
        else if (!/^\d{6,15}$/.test(digits)) { e.phone = 'Numero international invalide'; }
        else delete e.phone;
      }
      return e;
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    validateField(name, value);
  };

  const normalizePhone = (cc: string, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    if (cc === '+33') { const fr = digits.startsWith('0') ? digits.slice(1) : digits; return `+33${fr}`; }
    return `${cc}${digits}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    const email = formData.email.trim().toLowerCase();
    const phone = normalizePhone(phoneCountryCode, formData.phone);

    if (!firstName || !lastName || !email || !phone) { setError('Veuillez remplir tous les champs.'); return; }
    if (!acceptedTerms) { setError('Veuillez accepter les CGU et la Politique de confidentialite.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Adresse email invalide.'); return; }

    setIsLoading(true);
    try {
      const { data } = await otpAPI.send({ firstName, lastName, email, phone });
      if (data?.channel === 'whatsapp' && data?.waLink) {
        setWaStep({ phone, waLink: data.waLink, waPhone: data.waPhone, expiresAt: data.expiresAt });
      } else {
        setError('Configuration WhatsApp manquante. Contactez le support.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Erreur. Veuillez reessayer.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      await signIn('google-signup', { callbackUrl: '/auth/signup' });
    } catch {
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
          Retour a l'accueil
        </Button>
      </Link>

      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-primary/80 items-center justify-center p-12 text-white">
        <div className="max-w-md">
          <h1 className="text-4xl font-bold mb-4">Rejoignez Ada Papers</h1>
          <p className="text-lg text-white/90 mb-6">Service d'Accompagnement aux demarches administratives.</p>
          <div className="space-y-4">
            {[
              ['✓', 'Inscription rapide', 'Creez votre compte en quelques minutes'],
              ['✓', 'Verification par WhatsApp', 'Securisee, instantanee, sans SMS payant'],
              ['✓', 'Outils et accompagnement', 'Calculateur de delais, forum, conseiller juridique'],
            ].map(([icon, title, desc]) => (
              <div key={title} className="flex items-start gap-3">
                <span className="text-2xl">{icon}</span>
                <div>
                  <h3 className="font-semibold mb-1">{title}</h3>
                  <p className="text-white/80 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center px-4 py-6 sm:py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-4 sm:mb-6">
            <Link href="/" className="inline-block">
              <div className="flex flex-col items-center">
                <span className="text-3xl font-bold text-orange-500 hover:text-orange-600 transition-colors">Ada Papers</span>
                <p className="text-[10px] text-muted-foreground font-medium mt-1">Service d'Accompagnement aux demarches administratives</p>
              </div>
            </Link>
          </div>

          <div className="bg-white rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-5 sm:px-8 py-4 sm:py-6 border-b border-border">
              <div className="text-center">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 sm:mb-2">
                  {waStep ? 'Verification WhatsApp' : 'Creation de compte'}
                </h1>
                {waStep && (
                  <p className="text-sm text-muted-foreground">Envoyez le code au bot pour confirmer votre numero</p>
                )}
              </div>
            </div>

            <div className="p-5 sm:p-8">
              {waStep ? (
                <WhatsappVerifScreen
                  phone={waStep.phone}
                  waLink={waStep.waLink}
                  waPhone={waStep.waPhone}
                  expiresAt={waStep.expiresAt}
                  onBack={() => setWaStep(null)}
                />
              ) : (
                <>
                  {error && (
                    <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">⚠️</span>
                        <p className="text-sm font-medium text-red-800">{error}</p>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                    <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-2.5 sm:p-3 space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full h-10 sm:h-12 text-sm sm:text-base font-semibold bg-white"
                        onClick={handleGoogleSignup}
                        disabled={!isGoogleAvailable || isGoogleLoading || isLoading}
                      >
                        {isGoogleLoading ? (
                          <span className="flex items-center gap-2"><span className="animate-spin">⏳</span><span>Redirection vers Google...</span></span>
                        ) : (
                          <span className="flex items-center gap-2"><span>🔵</span><span>S'inscrire avec Google</span></span>
                        )}
                      </Button>
                    </div>

                    <div className="relative py-0.5 sm:py-1">
                      <div className="absolute inset-0 flex items-center" aria-hidden><span className="w-full border-t border-border" /></div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-muted-foreground">Ou inscrivez-vous manuellement</span>
                      </div>
                    </div>

                    <div className="space-y-4 sm:space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <FloatingField label="Prenom" required name="firstName" autoComplete="given-name"
                          value={formData.firstName}
                          onChange={(v) => handleChange({ target: { name: 'firstName', value: v } } as any)}
                          onBlur={(v) => validateField('firstName', v)} error={fieldErrors.firstName} />
                        <FloatingField label="Nom" required name="lastName" autoComplete="family-name"
                          value={formData.lastName}
                          onChange={(v) => handleChange({ target: { name: 'lastName', value: v } } as any)}
                          onBlur={(v) => validateField('lastName', v)} error={fieldErrors.lastName} />
                      </div>

                      <FloatingField label="Email" required type="email" name="email" autoComplete="email"
                        value={formData.email}
                        onChange={(v) => handleChange({ target: { name: 'email', value: v } } as any)} />

                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <select
                            aria-label="Indicatif telephonique"
                            value={phoneCountryCode}
                            onChange={(e) => { setPhoneCountryCode(e.target.value); validateField('phone', formData.phone); }}
                            className="h-11 w-28 shrink-0 rounded-md border border-gray-300 bg-white px-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                          <div className="flex-1">
                            <FloatingField label="Numero de telephone" required type="tel" name="phone" autoComplete="tel-national"
                              value={formData.phone}
                              onChange={(v) => handleChange({ target: { name: 'phone', value: v } } as any)}
                              onBlur={(v) => validateField('phone', v)} error={fieldErrors.phone}
                              placeholder={phoneCountryCode === '+33' ? '07 68 03 33 58' : 'Numero local'} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2.5 sm:space-y-3 pt-1">
                      <label className="flex items-start gap-2.5 text-[11px] text-muted-foreground leading-snug">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 rounded border border-input accent-orange-500"
                          checked={acceptedTerms}
                          onChange={(e) => setAcceptedTerms(e.target.checked)}
                          disabled={isLoading}
                          required
                        />
                        <span>
                          J'accepte les{' '}
                          <Link href="/cgu" className="text-primary hover:underline font-semibold">Conditions Generales d'Utilisation</Link>{' '}
                          et la{' '}
                          <Link href="/politique-confidentialite" className="text-primary hover:underline font-semibold">Politique de confidentialite</Link>.
                        </span>
                      </label>
                      <Button
                        type="submit"
                        className="w-full h-10 sm:h-12 text-sm sm:text-base font-semibold shadow-md hover:shadow-lg transition-all"
                        disabled={isLoading || !acceptedTerms}
                      >
                        {isLoading ? (
                          <span className="flex items-center gap-2"><span className="animate-spin">⏳</span><span>Creation en cours...</span></span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden>
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            <span>Creer mon compte</span>
                          </span>
                        )}
                      </Button>
                    </div>
                  </form>

                  <div className="mt-6 pt-6 border-t border-border text-center">
                    <p className="text-sm text-muted-foreground">
                      Vous avez deja un compte ?{' '}
                      <Link href="/auth/signin" className="text-primary hover:underline font-semibold">Se connecter</Link>
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
