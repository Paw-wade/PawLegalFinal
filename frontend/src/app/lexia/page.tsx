import type { Metadata } from 'next';
import LexiaClient from '../admin/lexia/LexiaClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Paw AI | Assistant juridique',
  robots: { index: false, follow: false },
};

export default function LexiaUserPage() {
  return <LexiaClient audience="user" />;
}