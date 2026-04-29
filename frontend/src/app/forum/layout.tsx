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
const FORUM_URL = `${SITE_URL}/forum`;
const LOGO_URL = `${SITE_URL}/ada-papers-logo.png`;

export const metadata: Metadata = {
  title: 'Forum | Ada Papers',
  description:
    "Forum Ada Papers: posez vos questions et partagez vos retours sur les démarches administratives.",
  openGraph: {
    title: 'Forum Ada Papers',
    description:
      "Posez vos questions, consultez les réponses et suivez les nouvelles discussions sur le forum Ada Papers.",
    url: FORUM_URL,
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
    title: 'Forum Ada Papers',
    description:
      "Posez vos questions, consultez les réponses et suivez les nouvelles discussions sur le forum Ada Papers.",
    images: [LOGO_URL],
  },
};

export default function ForumLayout({ children }: { children: React.ReactNode }) {
  return children;
}

