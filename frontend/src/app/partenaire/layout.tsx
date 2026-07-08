'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { RouteProtection } from '@/components/RouteProtection';
import { Suspense, useEffect } from 'react';

export default function PartenaireLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Harmoniser le titre de l'onglet partenaire avec le favicon
    document.title = 'Ada Papers';
  }, []);

  return (
    <DashboardLayout variant="partenaire">
      <RouteProtection>
        <Suspense
          fallback={
            <div className="min-h-[60vh] flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            </div>
          }
        >
          {children}
        </Suspense>
      </RouteProtection>
    </DashboardLayout>
  );
}

