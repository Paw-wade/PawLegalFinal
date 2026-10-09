'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { PlatformRouteProtection } from '@/components/PlatformRouteProtection';
import { PLATFORM_SIGNIN_PATH } from '@/lib/auth/platformSession';

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSignIn = pathname === PLATFORM_SIGNIN_PATH;

  if (isSignIn) {
    return <>{children}</>;
  }

  return (
    <PlatformShell>
      <Suspense
        fallback={
          <div className="flex justify-center py-20">
            <div className="animate-spin h-10 w-10 border-2 border-orange-500 border-t-transparent rounded-full" />
          </div>
        }
      >
        <PlatformRouteProtection>{children}</PlatformRouteProtection>
      </Suspense>
    </PlatformShell>
  );
}
