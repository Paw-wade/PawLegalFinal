/** URLs locales recommandées par cabinet (dev). Le port suit celui du navigateur. */
export type DevCabinetEntry = {
  slug: string;
  label: string;
  /** Sous-domaines reconnus par tenantSlugFromHost */
  hostHints: string[];
};

export const DEV_CABINETS: DevCabinetEntry[] = [
  {
    slug: 'cabinet-wadepaw',
    label: 'Wadepaw',
    hostHints: ['wadepaw'],
  },
  {
    slug: 'cabinet-dupont',
    label: 'Dupont',
    hostHints: ['dupont', 'dupon'],
  },
  {
    slug: 'cabinet-martin',
    label: 'Martin',
    hostHints: ['martin'],
  },
];

export function devCabinetSignInUrl(slug: string, port = '3004'): string {
  const entry = DEV_CABINETS.find((c) => c.slug === slug);
  const hint = entry?.hostHints[0] ?? slug.replace('cabinet-', '');
  if (slug === 'cabinet-wadepaw') {
    return `http://localhost:${port}/auth/signin`;
  }
  return `http://${hint}.localhost:${port}/auth/signin`;
}

export function devCabinetLabel(slug: string | null | undefined): string {
  if (!slug) return '—';
  return DEV_CABINETS.find((c) => c.slug === slug)?.label ?? slug;
}

export function isPlainLocalhostHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}
