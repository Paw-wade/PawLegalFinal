'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { authAPI, otpAPI } from '@/lib/api';
import { FloatingField } from '@/components/ui/FloatingField';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const base =
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variants: Record<string, string> = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return (
    <button className={`${base} ${variants[variant] || ''} ${className}`} {...props}>
      {children}
    </button>
  );
}

type Method = 'whatsapp' | 'email' | 'sms';
type WaStep = 'phone' | 'verify' | 'password';
type SmsStep = 'phone' | 'code';

// Ecran de verification WhatsApp (meme logique que signup)
function WhatsappResetScreen({
  phone,
  waLink,
  onVerified,
  onBack,
}: {
  phone: string;
  waLink: string;
  onVerified: (resetToken: string) => void;
  onBack: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(180);
  const [status, setStatus] = useState<'waiting' | 'expired'>('waiting');
  const [smsSent, setSmsSent] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsCode, setSmsCode] = useState('');
  const [smsVerifyLoading, setSmsVerifyLoading] = useState(false);
  const [smsVerifyError, setSmsVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) { setStatus('expired'); return; }
    const t = setInterval(() => setSecondsLeft((s) => {
      if (s <= 1) { clearInterval(t); setStatus('expired'); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (status !== 'waiting') return;
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const { data } = await otpAPI.waResetStatus(phone);
        if (data?.verified && data?.resetToken) {
          onVerified(data.resetToken);
          return;
        }
      } catch {}
      if (active && status === 'waiting') setTimeout(poll, 2500);
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
      setSmsError(err?.response?.data?.message || 'Echec de l\'envoi SMS.');
    } finally {
      setSmsLoading(false);
    }
  };

  const handleVerifySms = async () => {
    setSmsVerifyLoading(true);
    setSmsVerifyError(null);
    try {
      const { data } = await authAPI.forgotPasswordByPhone({ phone });
      if (data?.verified && data?.resetToken) {
        onVerified(data.resetToken);
      } else {
        setSmsVerifyError('Code incorrect ou expire.');
      }
    } catch (err: any) {
      setSmsVerifyError(err?.response?.data?.message || 'Code incorrect.');
    } finally {
      setSmsVerifyLoading(false);
    }
  };

  if (status === 'expired') {
    return (
      <div className="text-center space-y-4">
        <p className="text-sm text-red-600 font-medium">Le code a expire.</p>
        <Button variant="outline" className="h-10 px-6" onClick={onBack}>
          Recommencer
        </Button>
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
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
          <Button variant="outline" className="h-10 text-sm px-6" disabled={smsLoading} onClick={handleSendSms}>
            {smsLoading ? 'Envoi...' : 'Recevoir le code par SMS'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <FloatingField label="Code recu par SMS" required value={smsCode} onChange={setSmsCode} />
          {smsVerifyError && <p className="text-xs text-red-600">{smsVerifyError}</p>}
          <div className="flex justify-center">
            <Button className="h-10 px-6" disabled={smsVerifyLoading || !smsCode} onClick={handleVerifySms}>
              {smsVerifyLoading ? 'Verification...' : 'Verifier le code'}
            </Button>
          </div>
        </div>
      )}

      <div className="text-center">
        <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={onBack}>
          Recommencer l'inscription
        </button>
      </div>
    </div>
  );
}

// Formulaire nouveau mot de passe
function NewPasswordForm({
  resetToken,
  onSuccess,
}: {
  resetToken: string;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caracteres.'); return; }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    setError(null);
    try {
      await authAPI.resetPasswordWhatsapp({ resetToken, password });
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erreur. Recommencez la procedure.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-green-700 font-medium text-center">Identite confirmee. Choisissez votre nouveau mot de passe.</p>
      <FloatingField label="Nouveau mot de passe" required type="password" value={password} onChange={setPassword} />
      <FloatingField label="Confirmer le mot de passe" required type="password" value={confirm} onChange={setConfirm} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full h-11" disabled={loading}>
        {loading ? 'Enregistrement...' : 'Enregistrer le nouveau mot de passe'}
      </Button>
    </form>
  );
}

export default function ForgotPasswordPage() {
  const [method, setMethod] = useState<Method>('whatsapp');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [waStep, setWaStep] = useState<WaStep>('phone');
  const [waLink, setWaLink] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [smsStep, setSmsStep] = useState<SmsStep>('phone');
  const [smsCode, setSmsCode] = useState('');
  const [smsPassword, setSmsPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setWaStep('phone');
    setSmsStep('phone');
    setPhone('');
    setEmail('');
    setWaLink('');
    setResetToken('');
    setSmsCode('');
    setSmsPassword('');
    setSuccess(null);
    setError(null);
  };

  const handleWhatsappPhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await otpAPI.sendReset({ phone });
      setWaLink(data.waLink);
      setWaStep('verify');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erreur. Verifiez votre numero et reessayez.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await authAPI.forgotPassword({ email });
      setSuccess(data?.message || 'Si cet email est associe a un compte, un lien de reinitialisation a ete envoye.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erreur. Verifiez votre email et reessayez.');
    } finally {
      setLoading(false);
    }
  };

  const handleSmsPhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await authAPI.forgotPasswordByPhone({ phone });
      setSuccess(data?.message || 'Code envoye par SMS.');
      setSmsStep('code');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erreur. Verifiez votre numero et reessayez.');
    } finally {
      setLoading(false);
    }
  };

  const handleSmsReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authAPI.resetPasswordByPhone({ phone, code: smsCode, password: smsPassword });
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Code incorrect ou expire.');
    } finally {
      setLoading(false);
    }
  };

  const methodLabel = (m: Method) => {
    if (m === 'whatsapp') return 'WhatsApp';
    if (m === 'email') return 'Email';
    return 'SMS';
  };

  const subtitle = () => {
    if (method === 'whatsapp') return 'Verifiez votre identite via WhatsApp pour reinitialiser votre mot de passe.';
    if (method === 'email') return 'Recevez un lien de reinitialisation par email.';
    return 'Recevez un code de verification par SMS.';
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-primary/5 via-background to-primary/10 relative">
      <Link href="/" className="absolute top-4 left-4 z-50">
        <Button variant="ghost" className="text-foreground hover:bg-primary/10 backdrop-blur-sm">
          Retour a l'accueil
        </Button>
      </Link>

      <div className="w-full flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <Link href="/" className="inline-block">
              <div className="flex flex-col items-center">
                <span className="text-3xl font-bold text-orange-500 hover:text-orange-600 transition-colors">Ada Papers</span>
                <p className="text-[10px] text-muted-foreground font-medium mt-1">
                  Service d'Accompagnement aux demarches administratives
                </p>
              </div>
            </Link>
          </div>

          <div className="bg-white rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-8 py-6 border-b border-border">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-foreground mb-1">Mot de passe oublie</h1>
                <p className="text-muted-foreground text-sm">{subtitle()}</p>
              </div>
              {/* Selecteur de methode */}
              <div className="flex gap-2 mt-4">
                {(['whatsapp', 'email', 'sms'] as Method[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMethod(m); reset(); }}
                    style={{
                      flex: 1,
                      padding: '6px 4px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      border: method === m ? '1.5px solid #f97316' : '1.5px solid transparent',
                      background: method === m ? '#fff' : 'rgba(255,255,255,0.5)',
                      color: method === m ? '#f97316' : '#6b7280',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      boxShadow: method === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    {m === 'whatsapp' && (
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        WhatsApp
                      </span>
                    )}
                    {m === 'email' && 'Email'}
                    {m === 'sms' && 'SMS'}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Succes final */}
              {done && (
                <div className="text-center space-y-4">
                  <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded-lg">
                    <p className="text-sm text-green-800 font-medium">Mot de passe reinitialise avec succes !</p>
                  </div>
                  <Link href="/auth/signin">
                    <Button className="w-full h-11">Se connecter</Button>
                  </Link>
                </div>
              )}

              {/* WhatsApp - saisie du telephone */}
              {!done && method === 'whatsapp' && waStep === 'phone' && (
                <form onSubmit={handleWhatsappPhoneSubmit} className="space-y-4">
                  <div>
                    <FloatingField label="Numero de telephone du compte" required type="tel" value={phone} onChange={setPhone} />
                    <p className="mt-1 text-xs text-muted-foreground">Format international : +33612345678 ou +221771234567</p>
                  </div>
                  <Button type="submit" className="w-full h-11" disabled={loading || !phone}>
                    {loading ? 'Verification...' : 'Continuer avec WhatsApp'}
                  </Button>
                </form>
              )}

              {/* WhatsApp - verification */}
              {!done && method === 'whatsapp' && waStep === 'verify' && (
                <WhatsappResetScreen
                  phone={phone}
                  waLink={waLink}
                  onVerified={(token) => { setResetToken(token); setWaStep('password'); }}
                  onBack={() => { setWaStep('phone'); setError(null); }}
                />
              )}

              {/* WhatsApp - nouveau mot de passe */}
              {!done && method === 'whatsapp' && waStep === 'password' && (
                <NewPasswordForm resetToken={resetToken} onSuccess={() => setDone(true)} />
              )}

              {/* Email */}
              {!done && method === 'email' && !success && (
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <FloatingField label="Email associe au compte" required type="email" autoComplete="email" value={email} onChange={setEmail} />
                  <Button type="submit" className="w-full h-11" disabled={loading || !email}>
                    {loading ? 'Envoi...' : 'Envoyer le lien de recuperation'}
                  </Button>
                </form>
              )}
              {!done && method === 'email' && success && (
                <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded-lg">
                  <p className="text-sm text-green-800">{success}</p>
                </div>
              )}

              {/* SMS - saisie du telephone */}
              {!done && method === 'sms' && smsStep === 'phone' && (
                <form onSubmit={handleSmsPhoneSubmit} className="space-y-4">
                  <div>
                    <FloatingField label="Numero de telephone du compte" required type="tel" value={phone} onChange={setPhone} />
                    <p className="mt-1 text-xs text-muted-foreground">Format international : +33612345678 ou +221771234567</p>
                  </div>
                  <Button type="submit" className="w-full h-11" disabled={loading || !phone}>
                    {loading ? 'Envoi...' : 'Envoyer le code par SMS'}
                  </Button>
                </form>
              )}

              {/* SMS - saisie code + nouveau mdp */}
              {!done && method === 'sms' && smsStep === 'code' && (
                <form onSubmit={handleSmsReset} className="space-y-4">
                  {success && (
                    <div className="p-3 bg-green-50 border-l-4 border-green-500 rounded-lg">
                      <p className="text-xs text-green-800">{success}</p>
                    </div>
                  )}
                  <FloatingField label="Code recu par SMS" required value={smsCode} onChange={setSmsCode} placeholder="Code a 6 chiffres" />
                  <FloatingField label="Nouveau mot de passe" required type="password" value={smsPassword} onChange={setSmsPassword} />
                  <Button type="submit" className="w-full h-11" disabled={loading || !smsCode || !smsPassword}>
                    {loading ? 'Validation...' : 'Valider le nouveau mot de passe'}
                  </Button>
                </form>
              )}

              <div className="pt-2 border-t border-border text-center">
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
