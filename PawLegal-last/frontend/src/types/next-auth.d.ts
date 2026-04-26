import 'next-auth';

declare module 'next-auth' {
  interface User {
    id: string;
    role: string;
    profilComplete: boolean;
    token?: string;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      profilComplete: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email?: string;
    role: string;
    profilComplete: boolean;
    accessToken?: string;
  }
}



