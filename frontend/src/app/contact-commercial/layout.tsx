import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contacter le service commercial | Ada Papers',
  description:
    'Échangez avec l’équipe commerciale Ada Papers : démonstration, tarifs, partenariat ou question sur la plateforme.',
  robots: { index: true, follow: true },
};

export default function ContactCommercialLayout({ children }: { children: React.ReactNode }) {
  return children;
}
