import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ada Papers | Plateforme de gestion pour cabinets et structures juridiques',
  description:
    "SaaS pour cabinets d'avocats et structures de conseil : dossiers, documents, messagerie, rendez-vous et suivi d'équipe dans un espace sécurisé et dédié.",
  openGraph: {
    title: 'Ada Papers | Votre organisation, un espace dédié',
    description:
      'Centralisez dossiers, pièces, échanges clients et équipe sur une plateforme de gestion pensée pour les cabinets et structures juridiques.',
    locale: 'fr_FR',
    type: 'website',
  },
};

export default function SaasLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
