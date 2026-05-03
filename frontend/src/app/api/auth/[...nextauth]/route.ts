import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { publicApiPath } from '@/lib/publicApiUrl';

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

      try {
        const response = await fetch(publicApiPath('/auth/login'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password
          })
        });

        const data = await response.json();

        if (data.success && data.token) {
          // Le token sera stocké côté client après la connexion
          // On le retourne dans l'objet user pour qu'il soit disponible dans les callbacks
          return {
            id: data.user.id,
            email: data.user.email,
            name: `${data.user.firstName} ${data.user.lastName}`,
            role: data.user.role || 'client',
            profilComplete: data.user.profilComplete || false,
            needsPasswordSetup: !!data.user.needsPasswordSetup,
            daysRemaining: typeof data.user.daysRemaining === 'number' ? data.user.daysRemaining : null,
            token: data.token
          };
        }

        // Si la réponse contient un message d'erreur, le propager
        if (data.message) {
          throw new Error(data.message);
        }

        return null;
      } catch (error: any) {
        console.error('Erreur de connexion:', error);
        // Propager l'erreur pour qu'elle soit gérée par NextAuth
        throw error;
      }
    }
  })
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

const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async signIn({ account }) {
      if (account?.provider !== 'google' && account?.provider !== 'google-signup') {
        return true;
      }
      if (!account.id_token) {
        return false;
      }
      // Parcours "inscription Google" : on autorise la session NextAuth
      // même si le compte backend n'existe pas encore, pour préremplir le formulaire.
      if (account.provider === 'google-signup') {
        return true;
      }
      try {
        const response = await fetch(publicApiPath('/auth/google-login'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            idToken: account.id_token,
          }),
        });
        const data = await response.json();
        // Si l'email Google n'est pas encore connu côté backend,
        // rediriger vers l'inscription pour éviter un AccessDenied opaque.
        if (response.status === 404) {
          return '/auth/signup';
        }
        if (!response.ok) return false;
        return Boolean(data?.success && data?.token && data?.user);
      } catch (error) {
        console.error('Erreur validation Google signIn callback:', error);
        return false;
      }
    },
    async jwt({ token, user, account, profile }) {
      if ((account?.provider === 'google' || account?.provider === 'google-signup') && account.id_token) {
        try {
          const response = await fetch(publicApiPath('/auth/google-login'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              idToken: account.id_token,
            }),
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
    signIn: '/auth/signin'
  },
  session: {
    strategy: 'jwt',
    // Session longue (90 jours) pour éviter les déconnexions fréquentes.
    maxAge: 90 * 24 * 60 * 60,
    // Réécrit la session au fil de l'eau pour conserver une expérience continue.
    updateAge: 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET || 'your-secret-key-change-this-in-production',
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };


