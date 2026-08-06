import type { Config } from 'tailwindcss';

/** rgb(var(--x) / <alpha>) helper so semantic tokens support opacity modifiers. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class', // Enable class-based dark mode (ThemeContext port)
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    // Required for any @quikit/ui component rendered here (Contact Support,
    // DataTable, …). Without it Tailwind never emits the utilities those
    // components use — `w-[380px]`, `z-[201]`, `bg-[var(--color-bg-primary)]` —
    // and they render unstyled: no width, no background, no rounding.
    '../../packages/ui/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    screens: {
      '2xs': '320px',
      xs: '480px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
    },
    extend: {
      colors: {
        // Brand accent — set server-side per tenant; hex so it stays simple.
        brand: {
          primary: 'var(--brand-primary, #4f46e5)',
          secondary: 'var(--brand-secondary, #3730a3)',
        },
        // Semantic neutral tokens (light + dark via .dark in globals.css).
        canvas: token('bg'),
        surface: {
          DEFAULT: token('surface'),
          muted: token('surface-muted'),
          sunken: token('surface-sunken'),
        },
        fg: {
          DEFAULT: token('fg'),
          muted: token('fg-muted'),
          subtle: token('fg-subtle'),
        },
        line: {
          DEFAULT: token('line'),
          strong: token('line-strong'),
        },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        info: { DEFAULT: token('info'), soft: token('info-soft') },
        // Legacy scale kept for any existing references.
        primary: {
          50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc',
          400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1',
          800: '#075985', 900: '#0c4a6e',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
      },
      borderColor: {
        DEFAULT: token('line'),
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(var(--shadow-color) / 0.05)',
        sm: '0 1px 3px 0 rgb(var(--shadow-color) / 0.08), 0 1px 2px -1px rgb(var(--shadow-color) / 0.08)',
        md: '0 4px 12px -2px rgb(var(--shadow-color) / 0.10), 0 2px 6px -2px rgb(var(--shadow-color) / 0.08)',
        lg: '0 12px 28px -6px rgb(var(--shadow-color) / 0.16), 0 4px 10px -4px rgb(var(--shadow-color) / 0.10)',
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 2s infinite',
        'fade-in': 'fade-in 200ms ease-out both',
        'slide-up': 'slide-up 240ms cubic-bezier(0.16,1,0.3,1) both',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
