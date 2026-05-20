import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Demander un espace organisation | Ada Papers',
  description:
    "Formulaire de demande d'environnement dédié Ada Papers pour cabinets, structures de conseil et associations.",
  robots: { index: true, follow: true },
};

export default function DevenirCabinetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
