import NextAuth, { type Account, type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { authApiPath } from '@/lib/publicApiUrl';

/**
 * NEXTAUTH_URL must be ONE origin (ex. https://www.adapapers.fr).
 * A comma-separated list (often copied from FRONTEND_URL) produces an invalid
 * Google redirect_uri → Error 400 invalid_request / OAuth policy block.
 */
(function sanitizeNextAuthUrl() {
  const raw = String(process.env.NEXTAUTH_URL || '').trim();
  if (!raw || !raw.includes(',')) return;
  const parts = raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .map((s) => s.replace(/^http\/\//i, 'http://')); // common typo: http//host
  const preferred =
    parts.find((p) => /^https:\/\/www\.adapapers\.fr$/i.test(p)) ||
    parts.find((p) => /^https:\/\/adapapers\.fr$/i.test(p)) ||
    parts.find((p) => p.startsWith('https://') && !/sslip\.io/i.test(p)) ||
    parts.find((p) => p.startsWith('https://')) ||
    parts[0];
  if (preferred) {
    console.warn(
      `[NextAuth] NEXTAUTH_URL was a list — using single URL: ${preferred} (fix Coolify env to this value only)`
    );
    process.env.NEXTAUTH_URL = preferred;
  }
})();

/** Corps pour POST `/api/auth/google-login` — selon la version NextAuth, les clés peuvent varier. */
function bodyForGoogleLogin(account: Account | null) {
  const a = account as Record<string, unknown> | null;
  const idTok =
    typeof a?.id_token === 'string'
      ? a.id_token.trim()
      : typeof a?.idToken === 'string'
        ? String(a.idToken).trim()
        : '';
  if (idTok) return { idToken: idTok } as const;
  const accTok =
    typeof a?.access_token === 'string'
      ? a.access_token.trim()
      : typeof a?.accessToken === 'string'
        ? String(a.accessToken).trim()
        : '';
  if (accTok) return { accessToken: accTok } as const;
  return null;
}

function signInErr(message: string) {
  return `/auth/signin?error=google&message=${encodeURIComponent(message)}`;
}

// Configuration NextAuth
const providers: NextAuthOptions['providers'] = [
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' }
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) {
        return null;
      }

      let response: Response;
      try {
        response = await fetch(authApiPath('/auth/login'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        });
      } catch (error) {
        console.error('[NextAuth] Backend login injoignable (vérifiez AUTH_BACKEND_ORIGIN ou le serveur API):', error);
        return null;
      }

      let data: Record<string, unknown>;
      try {
        data = (await response.json()) as Record<string, unknown>;
      } catch {
        console.warn('[NextAuth] Réponse login non-JSON, status=', response.status);
        return null;
      }

      const user = data.user as Record<string, unknown> | undefined;
      const token = data.token;

      if (response.ok && data.success === true && typeof token === 'string' && user && user.id != null) {
        const displayName =
          `${String(user.firstName ?? '').trim()} ${String(user.lastName ?? '').trim()}`.trim();
        const emailStr = String(user.email ?? credentials.email);
        return {
          id: String(user.id),
          email: emailStr,
          name: displayName || emailStr,
          role: String(user.role || 'client'),
          profilComplete: Boolean(user.profilComplete),
          needsPasswordSetup: Boolean(user.needsPasswordSetup),
          daysRemaining: typeof user.daysRemaining === 'number' ? user.daysRemaining : null,
          token,
        };
      }

      return null;
    }
  })
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const googleAuthParams = {
    prompt: 'select_account',
    access_type: 'online' as const,
    response_type: 'code' as const,
  };
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
      authorization: { params: googleAuthParams },
    }),
    GoogleProvider({
      id: 'google-signup',
      name: 'Google Signup',
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
      authorization: { params: googleAuthParams },
    })
  );
}

const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google' && account?.provider !== 'google-signup') {
        return true;
      }
      const googlePayload = bodyForGoogleLogin(account ?? null);
      const profileEmail =
        typeof (profile as { email?: unknown } | undefined)?.email === 'string'
          ? String((profile as { email: string }).email).trim()
          : '';
      const hasOAuthCreds =
        Boolean(googlePayload) ||
        Boolean(
          (account as Record<string, unknown> | undefined)?.id_token ||
            (account as Record<string, unknown> | undefined)?.access_token ||
            (account as Record<string, unknown> | undefined)?.idToken ||
            (account as Record<string, unknown> | undefined)?.accessToken
        ) ||
        Boolean(profileEmail);
      if (!hasOAuthCreds) {
        return signInErr(
          'Connexion Google interrompue (profil incomplet). Réessayez ou connectez-vous avec email et mot de passe.'
        );
      }

      // Inscription Google : laisser passer ; l’échange backend se fait dans `jwt`.
      if (account?.provider === 'google-signup') {
        return true;
      }

      if (!googlePayload) {
        return signInErr(
          'Jeton Google absent (id_token / access_token). Mettez à jour NextAuth ou réessayez ; sinon utilisez email/mot de passe.'
        );
      }
      try {
        const response = await fetch(authApiPath('/auth/google-login'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googlePayload),
        });
        const data = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          token?: string;
          user?: unknown;
          message?: string;
        };
        if (response.status === 404) {
          return '/auth/signup';
        }
        if (response.status === 401) {
          const msg =
            typeof data?.message === 'string' ? data.message : 'Connexion Google refusée';
          return signInErr(msg);
        }
        if (!response.ok) {
          const msg =
            typeof data?.message === 'string'
              ? data.message
              : `Erreur serveur (${response.status}). Vérifiez que le backend utilise le même GOOGLE_CLIENT_ID que cette app.`;
          return signInErr(msg);
        }
        const ok = Boolean(data?.success && data?.token && data?.user);
        if (!ok) {
          return signInErr('Réponse API invalide après Google — vérifiez les logs backend.');
        }
        return true;
      } catch (error) {
        console.error('Erreur validation Google signIn callback:', error);
        return signInErr(
          'API injoignable pour la connexion Google. En local : lancez le backend (port 3005) et définissez AUTH_BACKEND_ORIGIN=http://127.0.0.1:3005 si besoin.'
        );
      }
    },
    async jwt({ token, user, account, profile }) {
      const googlePayload =
        account && (account.provider === 'google' || account.provider === 'google-signup')
          ? bodyForGoogleLogin(account)
          : null;

      if ((account?.provider === 'google' || account?.provider === 'google-signup') && googlePayload) {
        try {
          const response = await fetch(authApiPath('/auth/google-login'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(googlePayload),
          });
          const data = await response.json();
          if (!response.ok || !data?.success || !data?.token || !data?.user) {
            throw new Error(data?.message || 'Connexion Google refusée');
          }

          token.id = data.user.id;
          token.email = data.user.email || undefined;
          token.role = data.user.role || 'client';
          token.profilComplete = data.user.profilComplete || false;
          token.needsPasswordSetup = !!data.user.needsPasswordSetup;
          token.daysRemaining = typeof data.user.daysRemaining === 'number' ? data.user.daysRemaining : null;
          token.accessToken = data.token;
          (token as any).googleSignupPending = false;
          (token as any).authError = undefined;
        } catch (error: any) {
          console.error('Erreur échange Google -> token API:', error);
          if (account.provider === 'google-signup') {
            // Cas normal en inscription : le compte n'existe pas encore côté backend.
            token.email = (profile as any)?.email || token.email;
            (token as any).googleFirstName = (profile as any)?.given_name || '';
            (token as any).googleLastName = (profile as any)?.family_name || '';
            token.accessToken = undefined;
            (token as any).googleSignupPending = true;
            (token as any).authError = undefined;
          } else {
            (token as any).authError = error?.message || 'Connexion Google impossible';
          }
        }
      } else if (user) {
        token.id = user.id;
        token.email = user.email || undefined; // Stocker l'email dans le token
        token.role = (user as any).role || 'client';
        token.profilComplete = (user as any).profilComplete || false;
        token.needsPasswordSetup = (user as any).needsPasswordSetup || false;
        token.daysRemaining = (user as any).daysRemaining ?? null;
        token.accessToken = (user as any).token;
        (token as any).googleSignupPending = false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        // S'assurer que l'email est dans la session (prioriser celui du token)
        if (token.email) {
          session.user.email = token.email as string;
        }
        (session.user as any).role = token.role as string;
        (session.user as any).profilComplete = token.profilComplete as boolean;
        (session.user as any).needsPasswordSetup = token.needsPasswordSetup as boolean;
        (session.user as any).daysRemaining = (token.daysRemaining as number | null) ?? null;
        (session.user as any).accessToken = token.accessToken as string;
        (session.user as any).googleFirstName = (token as any).googleFirstName || '';
        (session.user as any).googleLastName = (token as any).googleLastName || '';
        (session.user as any).googleSignupPending = Boolean((token as any).googleSignupPending);
        (session as any).authError = (token as any).authError || null;
        
        // Stocker le token dans localStorage côté client si disponible
        if (typeof window !== 'undefined' && token.accessToken) {
          try {
            const currentToken = localStorage.getItem('token');
            if (currentToken !== token.accessToken) {
              localStorage.setItem('token', token.accessToken as string);
              console.log('🔑 Token stocké dans localStorage depuis session callback');
            }
          } catch (e) {
            console.error('Erreur lors du stockage du token:', e);
          }
        }
      }
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin',
    /** Sans ceci, GET /api/auth/error?error=AccessDenied sert la page HTML NextAuth avec statut 403 (bruit console). */
    error: '/auth/signin',
  },
  session: {
    strategy: 'jwt',
    // Session longue (90 jours) pour éviter les déconnexions fréquentes.
    maxAge: 90 * 24 * 60 * 60,
    // Réécrit la session au fil de l'eau pour conserver une expérience continue.
    updateAge: 24 * 60 * 60,
  },
  // Coolify / reverse-proxy HTTPS : cookies Secure alignés sur NEXTAUTH_URL
  useSecureCookies: String(process.env.NEXTAUTH_URL || '').startsWith('https://'),
  secret: process.env.NEXTAUTH_SECRET || 'your-secret-key-change-this-in-production',
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };


