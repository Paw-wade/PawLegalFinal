'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { RouteProtection } from '@/components/RouteProtection';
import { useEffect } from 'react';

export default function PartenaireLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Harmoniser le titre de l'onglet partenaire avec le favicon
    document.title = 'Paw Legal';
  }, []);

  return (
    <DashboardLayout variant="partenaire">
      <RouteProtection>
        {children}
      </RouteProtection>
    </DashboardLayout>
  );
}

