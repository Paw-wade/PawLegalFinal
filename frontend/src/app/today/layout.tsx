import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#f97316',
};

export const metadata: Metadata = {
  title: 'Ma journee - Ada Papers',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Ma journee',
  },
};

export default function TodayLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
