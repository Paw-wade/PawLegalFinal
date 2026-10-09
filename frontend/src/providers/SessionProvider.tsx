'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import TenantSlugSync from '@/components/TenantSlugSync';

export default function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider refetchOnWindowFocus={false}>
      <TenantSlugSync />
      {children}
    </NextAuthSessionProvider>
  );
}



