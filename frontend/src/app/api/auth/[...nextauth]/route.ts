import NextAuth, { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import type { Account } from 'next-auth/core/types';
import { cookies, headers } from 'next/headers';
import { authApiPath } from '@/lib/publicApiUrl';
import { GOOGLE_OAUTH_INTENT_COOKIE } from '@/lib/googleOAuthIntent';
import { tenantAuthHeaders, tenantSlugFromHost } from '@/lib/tenantSlug';

/** Une seule instance NextAuth — recréer le handler à chaque requête casse OAuth (OAuthCallback). */
let authHandler: ReturnType<typeof NextAuth> | null = null;

async function getRequestTenantSlug(): Promise<string | undefined> {
  const h = await headers();
  return tenantSlugFromHost(h.get('host'));
}

async function isGoogleSignupIntent(): Promise<boolean> {
  const c = (await cookies()).get(GOOGLE_OAUTH_INTENT_COOKIE);
  return c?.value === 'signup';
}

async function clearGoogleSignupIntentCookie(): Promise<void> {
  (await cookies()).set(GOOGLE_OAUTH_INTENT_COOKIE, '', {
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
  });
}

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

function applyGoogleSignupPending(
  token: Record<string, unknown>,
  profile: { email?: string; given_name?: string; family_name?: string } | undefined,
  tenantSlug?: string
) {
  token.accessToken = undefined;
  token.email = profile?.email || token.email;
  (token as { googleFirstName?: string }).googleFirstName = profile?.given_name || '';
  (token as { googleLastName?: string }).googleLastName = profile?.family_name || '';
  (token as { googleSignupPending?: boolean }).googleSignupPending = true;
  (token as { authError?: string }).authError = undefined;
  (token as { tenantSlug?: string }).tenantSlug = tenantSlug;
}

async function exchangeGoogleWithBackend(
  googlePayload: { idToken: string } | { accessToken: string },
  tenantSlug?: string
) {
  const apiHeaders = tenantAuthHeaders(tenantSlug);
  const response = await fetch(authApiPath('/auth/google-login'), {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify(googlePayload),
  });
  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    token?: string;
    user?: {
      id: string;
      email?: string;
      role?: string;
      profilComplete?: boolean;
      needsPasswordSetup?: boolean;
      daysRemaining?: number | null;
    };
    tenant?: { slug?: string };
    message?: string;
  };
  return { response, data };
}

const authOptions: NextAuthOptions = {
  providers: [
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

        const tenantSlug = await getRequestTenantSlug();
        const apiHeaders = tenantAuthHeaders(tenantSlug);

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
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                prompt: 'select_account',
                access_type: 'online',
                response_type: 'code',
              },
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    /**
     * Google : uniquement true/false ici.
     * Ne jamais retourner une URL depuis signIn (sinon NextAuth → error OAuthCallback).
     * La validation API est faite dans le callback jwt.
     */
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') {
        return true;
      }
      const googlePayload = bodyForGoogleLogin(account ?? null);
      const profileEmail =
        typeof (profile as { email?: unknown } | undefined)?.email === 'string'
          ? String((profile as { email: string }).email).trim()
          : '';
      if (!googlePayload && !profileEmail) {
        console.warn('[NextAuth] Google OAuth sans email ni jeton');
        return false;
      }
      return true;
    },
    async jwt({ token, user, account, profile }) {
      const tenantSlug = await getRequestTenantSlug();
      const isGoogle = account?.provider === 'google';
      const googlePayload = isGoogle ? bodyForGoogleLogin(account ?? null) : null;
      const profileShape = profile as
        | { email?: string; given_name?: string; family_name?: string }
        | undefined;

      if (isGoogle) {
        const signupIntent = await isGoogleSignupIntent();

        if (signupIntent) {
          if (!googlePayload) {
            applyGoogleSignupPending(token as Record<string, unknown>, profileShape, tenantSlug);
            await clearGoogleSignupIntentCookie();
            return token;
          }
          try {
            const { response, data } = await exchangeGoogleWithBackend(googlePayload, tenantSlug);
            if (response.status === 404 || !data?.success) {
              applyGoogleSignupPending(token as Record<string, unknown>, profileShape, tenantSlug);
            } else if (data.user && data.token) {
              token.id = data.user.id;
              token.email = data.user.email || token.email;
              token.role = data.user.role || 'client';
              token.profilComplete = data.user.profilComplete || false;
              token.needsPasswordSetup = !!data.user.needsPasswordSetup;
              token.daysRemaining =
                typeof data.user.daysRemaining === 'number' ? data.user.daysRemaining : null;
              token.accessToken = data.token;
              (token as { tenantSlug?: string }).tenantSlug =
                data.tenant?.slug || tenantSlug || undefined;
              (token as { googleSignupPending?: boolean }).googleSignupPending = false;
            } else {
              applyGoogleSignupPending(token as Record<string, unknown>, profileShape, tenantSlug);
            }
          } catch (error) {
            console.warn('[NextAuth] Google signup — backend indisponible, préremplissage:', error);
            applyGoogleSignupPending(token as Record<string, unknown>, profileShape, tenantSlug);
          }
          await clearGoogleSignupIntentCookie();
          return token;
        }

        if (googlePayload) {
          try {
            const { response, data } = await exchangeGoogleWithBackend(googlePayload, tenantSlug);
            if (response.status === 404) {
              (token as { authError?: string }).authError =
                'Aucun compte Google associé sur ce cabinet. Créez un compte ou utilisez le bon domaine.';
              (token as { redirectToSignup?: boolean }).redirectToSignup = true;
              token.accessToken = undefined;
            } else if (!response.ok || !data?.success || !data?.token || !data?.user) {
              const msg =
                typeof data?.message === 'string'
                  ? data.message
                  : `Connexion Google refusée (${response.status})`;
              (token as { authError?: string }).authError = msg;
              token.accessToken = undefined;
            } else {
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
              (token as { redirectToSignup?: boolean }).redirectToSignup = false;
            }
          } catch (error: unknown) {
            console.error('[NextAuth] google login jwt:', error);
            (token as { authError?: string }).authError =
              error instanceof Error
                ? error.message
                : 'API injoignable — vérifiez que le backend tourne sur le port 3005.';
            token.accessToken = undefined;
          }
        } else if (profileShape?.email) {
          (token as { authError?: string }).authError =
            'Jeton Google incomplet. Réessayez ou connectez-vous par email.';
        }
        return token;
      }

      if (user) {
        token.id = user.id;
        token.email = user.email || undefined;
        token.role = (user as { role?: string }).role || 'client';
        token.profilComplete = (user as { profilComplete?: boolean }).profilComplete || false;
        token.needsPasswordSetup =
          (user as { needsPasswordSetup?: boolean }).needsPasswordSetup || false;
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
        (session.user as { authError?: string | null }).authError =
          (token as { authError?: string }).authError || null;
        (session.user as { redirectToSignup?: boolean }).redirectToSignup = Boolean(
          (token as { redirectToSignup?: boolean }).redirectToSignup
        );
        const slug = (token as { tenantSlug?: string }).tenantSlug;
        (session.user as { tenantSlug?: string }).tenantSlug = slug;
        (session as { tenantSlug?: string }).tenantSlug = slug;
        (session as { authError?: string | null }).authError =
          (token as { authError?: string }).authError || null;
        (session as { redirectToSignup?: boolean }).redirectToSignup = Boolean(
          (token as { redirectToSignup?: boolean }).redirectToSignup
        );
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
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
  trustHost: true,
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production'
          ? '__Secure-next-auth.session-token'
          : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'your-secret-key-change-this-in-production',
};

function getHandler() {
  if (!authHandler) {
    authHandler = NextAuth(authOptions);
  }
  return authHandler;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  return getHandler()(req, context);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  return getHandler()(req, context);
}
