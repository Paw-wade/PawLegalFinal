/**
 * Ada Papers — Design Tokens (TypeScript)
 * Source of truth: design system https://claude.ai/artifact/6jFWavYGsxmgfar1nEc4tn
 * Ne pas editer manuellement — mettre a jour le design system puis re-exporter.
 */

export const colors = {
  background:         { light: '#ffffff',          dark: '#000000'   },
  foreground:         { light: '#000000',          dark: '#ffffff'   },
  surfaceElevated:    { light: '#ffffff',          dark: '#111111'   },
  overlay:            { light: 'rgba(0,0,0,0.6)',  dark: 'rgba(0,0,0,0.75)' },

  primary:            { light: '#f97316',          dark: '#f97316'   },
  primaryForeground:  { light: '#ffffff',          dark: '#ffffff'   },
  primaryHover:       { light: '#ea580c',          dark: '#ea580c'   },
  primaryTint:        { light: '#fff7ed',          dark: '#431407'   },
  primaryLight:       { light: '#fed7aa',          dark: '#7c2d12'   },

  secondary:          { light: '#fafafa',          dark: '#1a1a1a'   },
  secondaryForeground:{ light: '#000000',          dark: '#ffffff'   },
  accent:             { light: '#fafafa',          dark: '#1a1a1a'   },
  accentForeground:   { light: '#000000',          dark: '#ffffff'   },
  muted:              { light: '#f5f5f5',          dark: '#262626'   },
  mutedForeground:    { light: '#737373',          dark: '#a6a6a6'   },
  border:             { light: '#d9d9d9',          dark: '#333333'   },
  input:              { light: '#d9d9d9',          dark: '#333333'   },
  ring:               { light: '#f97316',          dark: '#f97316'   },

  textStrong:         { light: '#1f1f1f',          dark: '#f5f5f5'   },
  textBody:           { light: '#374151',          dark: '#d1d5db'   },
  textSubtle:         { light: '#6b7280',          dark: '#9ca3af'   },
  textFaint:          { light: '#9ca3af',          dark: '#6b7280'   },

  success:            { light: '#16a34a',          dark: '#22c55e'   },
  successLight:       { light: '#dcfce7',          dark: '#14532d'   },
  danger:             { light: '#dc2626',          dark: '#ef4444'   },
  dangerLight:        { light: '#fee2e2',          dark: '#7f1d1d'   },
  info:               { light: '#2563eb',          dark: '#60a5fa'   },
  infoLight:          { light: '#dbeafe',          dark: '#1e3a8a'   },
  warning:            { light: '#d97706',          dark: '#fbbf24'   },
  warningLight:       { light: '#fef9c3',          dark: '#78350f'   },
} as const;

export const spacing = {
  0:  '0px',
  1:  '4px',
  2:  '8px',
  3:  '12px',
  4:  '16px',
  5:  '20px',
  6:  '24px',
  8:  '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const radius = {
  sm:   '4px',
  md:   '6px',
  lg:   '8px',
  xl:   '12px',
  '2xl': '16px',
  '3xl': '24px',
  full: '9999px',
} as const;

export const shadow = {
  sm:    '0 1px 2px 0 rgba(0,0,0,0.05)',
  md:    '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
  lg:    '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
  xl:    '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
  '2xl': '0 25px 50px -12px rgba(0,0,0,0.25)',
  inner: 'inset 0 2px 4px 0 rgba(0,0,0,0.05)',
} as const;

export const typography = {
  fontSans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  styles: {
    displayLg:   { fontSize: '30px', lineHeight: '36px', fontWeight: 700 },
    displayMd:   { fontSize: '24px', lineHeight: '32px', fontWeight: 700 },
    bodyXl:      { fontSize: '20px', lineHeight: '28px', fontWeight: 600 },
    bodyLg:      { fontSize: '18px', lineHeight: '28px', fontWeight: 400 },
    bodyBase:    { fontSize: '16px', lineHeight: '24px', fontWeight: 400 },
    bodySm:      { fontSize: '14px', lineHeight: '20px', fontWeight: 400 },
    bodyXs:      { fontSize: '12px', lineHeight: '16px', fontWeight: 500 },
    labelMicro:  { fontSize: '11px', lineHeight: '16px', fontWeight: 600 },
    labelNano:   { fontSize: '10px', lineHeight: '14px', fontWeight: 500 },
  },
} as const;

/** Tokens CSS var names — utiliser avec `var(tokens.cssVar.primary)` */
export const cssVar = {
  background:          '--color-background',
  foreground:          '--color-foreground',
  surfaceElevated:     '--color-surface-elevated',
  overlay:             '--color-overlay',
  primary:             '--color-primary',
  primaryForeground:   '--color-primary-foreground',
  primaryHover:        '--color-primary-hover',
  primaryTint:         '--color-primary-tint',
  primaryLight:        '--color-primary-light',
  secondary:           '--color-secondary',
  secondaryForeground: '--color-secondary-foreground',
  accent:              '--color-accent',
  accentForeground:    '--color-accent-foreground',
  muted:               '--color-muted',
  mutedForeground:     '--color-muted-foreground',
  border:              '--color-border',
  input:               '--color-input',
  ring:                '--color-ring',
  textStrong:          '--color-text-strong',
  textBody:            '--color-text-body',
  textSubtle:          '--color-text-subtle',
  textFaint:           '--color-text-faint',
  success:             '--color-success',
  successLight:        '--color-success-light',
  danger:              '--color-danger',
  dangerLight:         '--color-danger-light',
  info:                '--color-info',
  infoLight:           '--color-info-light',
  warning:             '--color-warning',
  warningLight:        '--color-warning-light',
} as const;

export type ColorToken = keyof typeof cssVar;
export type SpacingStep = keyof typeof spacing;
export type RadiusStep = keyof typeof radius;
export type ShadowStep = keyof typeof shadow;
export type TypographyStyle = keyof typeof typography.styles;

const tokens = { colors, spacing, radius, shadow, typography, cssVar };
export default tokens;
