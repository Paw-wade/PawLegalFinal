import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import type { Account } from 'next-auth/core/types';
import { headers } from 'next/headers';
import { authApiPath } from '@/lib/publicApiUrl';
import { tenantAuthHeaders, tenantSlugFromHost } from '@/lib/tenantSlug';

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

function createAuthOptions(tenantSlug?: string): NextAuthOptions {
  const apiHeaders = tenantAuthHeaders(tenantSlug);

  const providers: NextAuthOptions['providers'] = [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        let response: Response;
        try {
          response = await fetch(authApiPath('/auth/login'), {
            method: 'POST',
            headers: apiHeaders,
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });
        } catch (error) {
          console.error('[NextAuth] Backend login injoignable (vérifiez AUTH_BACKEND_ORIGIN):', error);
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
        const tenant = data.tenant as { slug?: string } | undefined;

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
            tenantSlug: tenant?.slug || tenantSlug || undefined,
          };
        }

        return null;
      },
    }),
  ];

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
      GoogleProvider({
        id: 'google-signup',
        name: 'Google Signup',
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    );
  }

  return {
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
            headers: apiHeaders,
            body: JSON.stringify(googlePayload),
          });
          const data = (await response.json().catch(() => ({}))) as {
            success?: boolean;
            token?: string;
            user?: unknown;
            tenant?: { slug?: string };
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
                : `Erreur serveur (${response.status}). Vérifiez GOOGLE_CLIENT_ID / backend.`;
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
            'API injoignable pour la connexion Google. Lancez le backend (3005) et AUTH_BACKEND_ORIGIN=http://127.0.0.1:3005.'
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
              headers: apiHeaders,
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
            token.daysRemaining =
              typeof data.user.daysRemaining === 'number' ? data.user.daysRemaining : null;
            token.accessToken = data.token;
            (token as { tenantSlug?: string }).tenantSlug =
              data.tenant?.slug || tenantSlug || undefined;
            (token as { googleSignupPending?: boolean }).googleSignupPending = false;
            (token as { authError?: string }).authError = undefined;
          } catch (error: unknown) {
            console.error('Erreur échange Google -> token API:', error);
            if (account.provider === 'google-signup') {
              token.email = (profile as { email?: string })?.email || token.email;
              (token as { googleFirstName?: string }).googleFirstName =
                (profile as { given_name?: string })?.given_name || '';
              (token as { googleLastName?: string }).googleLastName =
                (profile as { family_name?: string })?.family_name || '';
              token.accessToken = undefined;
              (token as { googleSignupPending?: boolean }).googleSignupPending = true;
              (token as { authError?: string }).authError = undefined;
            } else {
              (token as { authError?: string }).authError =
                error instanceof Error ? error.message : 'Connexion Google impossible';
            }
          }
        } else if (user) {
          token.id = user.id;
          token.email = user.email || undefined;
          token.role = (user as { role?: string }).role || 'client';
          token.profilComplete = (user as { profilComplete?: boolean }).profilComplete || false;
          token.needsPasswordSetup = (user as { needsPasswordSetup?: boolean }).needsPasswordSetup || false;
          token.daysRemaining = (user as { daysRemaining?: number | null }).daysRemaining ?? null;
          token.accessToken = (user as { token?: string }).token;
          (token as { tenantSlug?: string }).tenantSlug =
            (user as { tenantSlug?: string }).tenantSlug || tenantSlug || undefined;
          (token as { googleSignupPending?: boolean }).googleSignupPending = false;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          (session.user as { id?: string }).id = token.id as string;
          if (token.email) {
            session.user.email = token.email as string;
          }
          (session.user as { role?: string }).role = token.role as string;
          (session.user as { profilComplete?: boolean }).profilComplete =
            token.profilComplete as boolean;
          (session.user as { needsPasswordSetup?: boolean }).needsPasswordSetup =
            token.needsPasswordSetup as boolean;
          (session.user as { daysRemaining?: number | null }).daysRemaining =
            (token.daysRemaining as number | null) ?? null;
          (session.user as { accessToken?: string }).accessToken = token.accessToken as string;
          (session.user as { googleFirstName?: string }).googleFirstName =
            (token as { googleFirstName?: string }).googleFirstName || '';
          (session.user as { googleLastName?: string }).googleLastName =
            (token as { googleLastName?: string }).googleLastName || '';
          (session.user as { googleSignupPending?: boolean }).googleSignupPending = Boolean(
            (token as { googleSignupPending?: boolean }).googleSignupPending
          );
          const slug = (token as { tenantSlug?: string }).tenantSlug;
          (session as { tenantSlug?: string }).tenantSlug = slug;
          (session as { authError?: string | null }).authError =
            (token as { authError?: string }).authError || null;

          if (typeof window !== 'undefined' && token.accessToken) {
            try {
              const currentToken = localStorage.getItem('token');
              if (currentToken !== token.accessToken) {
                localStorage.setItem('token', token.accessToken as string);
              }
              if (slug) {
                localStorage.setItem('tenantSlug', slug);
              }
            } catch {
              /* ignore */
            }
          }
        }
        return session;
      },
    },
    pages: {
      signIn: '/auth/signin',
      error: '/auth/signin',
    },
    session: {
      strategy: 'jwt',
      maxAge: 90 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    secret: process.env.NEXTAUTH_SECRET || 'your-secret-key-change-this-in-production',
  };
}

async function getHandler() {
  const h = await headers();
  const tenantSlug = tenantSlugFromHost(h.get('host'));
  return NextAuth(createAuthOptions(tenantSlug));
}

export async function GET(
  req: Request,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  const handler = await getHandler();
  return handler(req, context);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  const handler = await getHandler();
  return handler(req, context);
}
