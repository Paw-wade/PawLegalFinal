import type { Metadata } from 'next';

type ThreadPayload = {
  success?: boolean;
  data?: {
    thread?: {
      title?: string;
      body?: string;
      _id?: string;
    };
  };
};

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
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api').replace(/\/+$/, '');
const LOGO_URL = `${SITE_URL}/ada-papers-logo.png`;

function excerpt(text: string, max = 180) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}...`;
}

async function fetchThread(threadId: string) {
  if (!threadId) return null;
  try {
    const res = await fetch(`${API_BASE}/forum/threads/${encodeURIComponent(threadId)}`, {
      method: 'GET',
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as ThreadPayload;
    return json?.data?.thread || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const thread = await fetchThread(id);
  const threadTitle = (thread?.title || '').trim();
  const threadBody = (thread?.body || '').trim();

  const title = threadTitle
    ? `${threadTitle} | Forum Ada Papers`
    : 'Discussion | Forum Ada Papers';
  const description = excerpt(threadBody || threadTitle || 'Discussion du forum Ada Papers');
  const url = `${SITE_URL}/forum/${id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
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
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [LOGO_URL],
    },
  };
}

export default function ForumThreadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

