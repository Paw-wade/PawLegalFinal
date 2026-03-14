import type { Metadata } from 'next';
import './globals.css';
import SessionProvider from '@/providers/SessionProvider';

export const metadata: Metadata = {
  // Titre court affiché à côté du favicon dans l’onglet
  title: 'Ada Papers',
  // Description SEO (on peut garder la description longue)
  description:
    "Ada Papers - Service d'Accompagnement aux démarches administratives pour vos titres de séjour, visas et démarches liées au droit des étrangers et du travail.",
  viewport: { width: 'device-width', initialScale: 1, maximumScale: 5 },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased overflow-x-hidden min-w-0">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
