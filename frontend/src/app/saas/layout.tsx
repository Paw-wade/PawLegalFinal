import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ada Papers — Plateforme de gestion pour le droit des étrangers',
  description:
    "SaaS dédié aux cabinets d'avocats, structures de conseil et associations : dossiers, documents, messagerie, rendez-vous et suivi des démarches administratives en un seul espace sécurisé.",
  openGraph: {
    title: 'Ada Papers — Votre organisation, un espace dédié',
    description:
      'Centralisez dossiers, pièces, échanges clients et équipe sur une plateforme pensée pour le droit des étrangers et l\'accompagnement juridique.',
    locale: 'fr_FR',
    type: 'website',
  },
};

export default function SaasLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
