import type { Metadata } from 'next';
import PawAiComingSoon from './PawAiComingSoon';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Paw AI | Assistant juridique',
  robots: { index: false, follow: false },
};

/** Paw AI : accès complet réservé aux admin (voir /admin/lexia) ; ici message « en conception » pour les autres. */
export default function LexiaUserPage() {
  return <PawAiComingSoon />;
}