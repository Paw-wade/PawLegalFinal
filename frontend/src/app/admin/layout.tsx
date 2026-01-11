'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { RouteProtection } from '@/components/RouteProtection';
import { useEffect } from 'react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Harmoniser le titre de l'onglet admin avec le favicon
    document.title = 'Paw Legal';
  }, []);

  return (
    <DashboardLayout variant="admin">
      <RouteProtection>
        {children}
      </RouteProtection>
    </DashboardLayout>
  );
}
