/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Design system Ada Papers : couleurs liées aux tokens de src/styles/tokens.css (clair / sombre)
        ds: {
          bg: 'var(--color-background)',
          elevated: 'var(--color-surface-elevated)',
          secondary: 'var(--color-secondary)',
          muted: 'var(--color-muted)',
          primary: 'var(--color-primary)',
          'primary-hover': 'var(--color-primary-hover)',
          'primary-tint': 'var(--color-primary-tint)',
          'primary-light': 'var(--color-primary-light)',
          strong: 'var(--color-text-strong)',
          body: 'var(--color-text-body)',
          subtle: 'var(--color-text-subtle)',
          border: 'var(--color-border)',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}



