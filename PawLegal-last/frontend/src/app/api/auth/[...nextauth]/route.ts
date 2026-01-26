import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

// Configuration NextAuth
const authOptions: NextAuthOptions = {
  providers: [
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
          const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api';
          
          const response = await fetch(`${API_URL}/auth/login`, {
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
              token: data.token
            };
          }

          return null;
        } catch (error: any) {
          console.error('Erreur de connexion:', error);
          return null;
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email || undefined; // Stocker l'email dans le token
        token.role = (user as any).role || 'client';
        token.profilComplete = (user as any).profilComplete || false;
        token.accessToken = (user as any).token;
        
        // Stocker le token dans localStorage côté client
        // Note: Ceci sera fait côté client après la connexion
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
        (session.user as any).accessToken = token.accessToken as string;
        
        // Stocker le token dans localStorage côté client si disponible
        if (typeof window !== 'undefined' && token.accessToken) {
          localStorage.setItem('token', token.accessToken as string);
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
    maxAge: 30 * 24 * 60 * 60, // 30 jours
  },
  secret: process.env.NEXTAUTH_SECRET || 'your-secret-key-change-this-in-production',
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };


