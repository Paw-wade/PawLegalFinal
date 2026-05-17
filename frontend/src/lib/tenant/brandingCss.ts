import {
  ADAPAPERS_PRIMARY_HEX,
  ADAPAPERS_PRIMARY_HSL,
  useUnifiedPublicBranding,
} from './unifiedBranding';

/** Convertit #RRGGBB en composantes HSL pour variables Tailwind `--primary`. */
export function hexToHslComponents(hex: string): string | null {
  const raw = String(hex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(raw)) return null;
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function applyTenantBrandingCss(branding?: { primaryColor?: string; name?: string }) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const unified = useUnifiedPublicBranding();
  const color = unified
    ? ADAPAPERS_PRIMARY_HEX
    : branding?.primaryColor?.trim();
  const hsl = unified
    ? ADAPAPERS_PRIMARY_HSL
    : color
      ? hexToHslComponents(color)
      : null;
  if (hsl) {
    root.style.setProperty('--primary', hsl);
    root.style.setProperty('--ring', hsl);
    if (color) {
      root.style.setProperty('--tenant-primary', color);
    }
  } else {
    root.style.removeProperty('--primary');
    root.style.removeProperty('--ring');
    root.style.removeProperty('--tenant-primary');
  }
  if (branding?.name) {
    root.style.setProperty('--tenant-brand-name', branding.name);
  } else {
    root.style.removeProperty('--tenant-brand-name');
  }
}
