import type { Metadata, Viewport } from 'next';
import './globals.css';
import SessionProvider from '@/providers/SessionProvider';
import { PushNotificationsBootstrap } from '@/components/PushNotificationsBootstrap';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  // Titre court affiché à côté du favicon dans l’onglet
  title: 'Ada Papers',
  // Description SEO (on peut garder la description longue)
  description:
    "Ada Papers - Service d'Accompagnement aux démarches administratives pour vos titres de séjour, visas et démarches liées au droit des étrangers et du travail.",
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ada Papers',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/ada-papers-logo.png', type: 'image/png' },
    ],
    apple: '/ada-papers-logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased overflow-x-hidden min-w-0 max-w-[100vw]">
        <SessionProvider>
          <PushNotificationsBootstrap />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
