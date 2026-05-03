import type { Metadata } from 'next';
import LexiaUserClient from './LexiaUserClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'LEXIA | Assistant juridique',
  robots: { index: false, follow: false },
};

/** LEXIA pour tout utilisateur connecté (corpus sur le VPS via le backend). */
export default function LexiaUserPage() {
  return <LexiaUserClient />;
}
