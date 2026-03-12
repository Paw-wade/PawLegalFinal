import type { Metadata } from 'next';
import './globals.css';
import SessionProvider from '@/providers/SessionProvider';

export const metadata: Metadata = {
  // Titre court affiché à côté du favicon dans l’onglet
  title: 'ADA Pappers',
  // Description SEO (on peut garder la description longue)
  description:
    "ADA Pappers - Service d'Accompagnement aux démarches administratives pour vos titres de séjour, visas et démarches liées au droit des étrangers et du travail.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
