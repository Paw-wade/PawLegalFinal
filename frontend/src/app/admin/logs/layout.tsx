import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Logs | Admin',
  robots: { index: false, follow: false },
};

export default function AdminLogsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
