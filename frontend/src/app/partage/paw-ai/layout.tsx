import type { Metadata } from 'next';

const resolveSiteUrl = () => {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3004';
  return fromEnv.replace(/\/+$/, '');
};

const SITE_URL = resolveSiteUrl();
const LOGO_URL = `${SITE_URL}/ada-papers-logo.png`;

export const metadata: Metadata = {
  title: 'Partage Paw AI | Ada Papers',
  description:
    'Consultation publique d’une analyse Paw AI partagée depuis la plateforme Ada Papers. Information générale, non substitutive d’un accompagnement personnalisé.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Partage Paw AI | Ada Papers',
    description: 'Analyse juridique informative partagée via Ada Papers.',
    url: `${SITE_URL}/partage/paw-ai`,
    siteName: 'Ada Papers',
    images: [
      {
        url: LOGO_URL,
        width: 512,
        height: 512,
        alt: 'Logo Ada Papers',
      },
    ],
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Partage Paw AI | Ada Papers',
    description: 'Analyse juridique informative partagée via Ada Papers.',
    images: [LOGO_URL],
  },
};

export default function PawAiShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
