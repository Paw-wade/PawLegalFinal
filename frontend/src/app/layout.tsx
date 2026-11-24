import type { Metadata, Viewport } from 'next';
import './globals.css';
import SessionProvider from '@/providers/SessionProvider';
import { PushNotificationsBootstrap } from '@/components/PushNotificationsBootstrap';
import { GuidePopup } from '@/components/ui/GuidePopup';
import { GuideFloatingButton } from '@/components/ui/GuideFloatingButton';

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
      { url: '/ada-papers-icon.png', type: 'image/png' },
    ],
    apple: '/ada-papers-icon.png',
  },
  openGraph: {
    title: 'Ada Papers',
    description:
      "Ada Papers - Service d'Accompagnement aux démarches administratives pour vos titres de séjour, visas et démarches liées au droit des étrangers et du travail.",
    images: [{ url: '/ada-papers-icon.png' }],
    siteName: 'Ada Papers',
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Ada Papers',
    description:
      "Ada Papers - Service d'Accompagnement aux démarches administratives pour vos titres de séjour, visas et démarches liées au droit des étrangers et du travail.",
    images: ['/ada-papers-icon.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased overflow-x-clip min-w-0 max-w-[100vw]">
        <SessionProvider>
          <PushNotificationsBootstrap />
          <GuidePopup />
          <GuideFloatingButton />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
