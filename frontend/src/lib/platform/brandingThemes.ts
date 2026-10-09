/** Palette proposée dans la console Ada Papers (choix admin). */
export type BrandingColorSwatch = {
  id: string;
  hex: string;
  label: string;
  group: string;
};

export const BRANDING_COLOR_GROUPS = [
  'Bleus',
  'Verts',
  'Oranges & ambre',
  'Rouges & rose',
  'Violets',
  'Ardoise & neutres',
] as const;

export const BRANDING_COLOR_PALETTE: BrandingColorSwatch[] = [
  { id: 'indigo', hex: '#2A4DD0', label: 'Indigo', group: 'Bleus' },
  { id: 'blue', hex: '#2563EB', label: 'Bleu', group: 'Bleus' },
  { id: 'sky', hex: '#0284C7', label: 'Ciel', group: 'Bleus' },
  { id: 'cyan', hex: '#0891B2', label: 'Cyan', group: 'Bleus' },
  { id: 'navy', hex: '#1E3A8A', label: 'Marine', group: 'Bleus' },

  { id: 'teal', hex: '#0D9488', label: 'Sarcelle', group: 'Verts' },
  { id: 'emerald', hex: '#059669', label: 'Émeraude', group: 'Verts' },
  { id: 'green', hex: '#16A34A', label: 'Vert', group: 'Verts' },
  { id: 'lime', hex: '#65A30D', label: 'Citron', group: 'Verts' },
  { id: 'forest', hex: '#14532D', label: 'Forêt', group: 'Verts' },

  { id: 'orange', hex: '#F97316', label: 'Orange', group: 'Oranges & ambre' },
  { id: 'amber', hex: '#D97706', label: 'Ambre', group: 'Oranges & ambre' },
  { id: 'gold', hex: '#CA8A04', label: 'Or', group: 'Oranges & ambre' },
  { id: 'rust', hex: '#C2410C', label: 'Rouille', group: 'Oranges & ambre' },

  { id: 'red', hex: '#DC2626', label: 'Rouge', group: 'Rouges & rose' },
  { id: 'rose', hex: '#E11D48', label: 'Rose', group: 'Rouges & rose' },
  { id: 'pink', hex: '#DB2777', label: 'Fuchsia', group: 'Rouges & rose' },
  { id: 'burgundy', hex: '#9F1239', label: 'Bordeaux', group: 'Rouges & rose' },

  { id: 'violet', hex: '#7C3AED', label: 'Violet', group: 'Violets' },
  { id: 'purple', hex: '#9333EA', label: 'Pourpre', group: 'Violets' },
  { id: 'fuchsia', hex: '#C026D3', label: 'Magenta', group: 'Violets' },
  { id: 'indigo-dark', hex: '#4F46E5', label: 'Indigo foncé', group: 'Violets' },

  { id: 'slate', hex: '#475569', label: 'Ardoise', group: 'Ardoise & neutres' },
  { id: 'gray', hex: '#4B5563', label: 'Gris', group: 'Ardoise & neutres' },
  { id: 'zinc', hex: '#52525B', label: 'Zinc', group: 'Ardoise & neutres' },
  { id: 'stone', hex: '#57534E', label: 'Pierre', group: 'Ardoise & neutres' },
  { id: 'charcoal', hex: '#1F2937', label: 'Charbon', group: 'Ardoise & neutres' },
];

export function normalizeHexColor(input: string): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (/^#[0-9a-f]{3}$/i.test(withHash)) {
    const h = withHash.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(withHash)) {
    return withHash.toUpperCase();
  }
  return null;
}

export function findPaletteSwatch(hex: string): BrandingColorSwatch | undefined {
  const n = normalizeHexColor(hex);
  if (!n) return undefined;
  return BRANDING_COLOR_PALETTE.find(
    (s) => normalizeHexColor(s.hex) === n
  );
}
