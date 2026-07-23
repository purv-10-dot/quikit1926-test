import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './hooks/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
    '../../packages/app-shell/src/**/*.{js,ts,jsx,tsx}',
    '../../packages/data-grid/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--font-plus-jakarta-sans)',
          'system-ui',
          'sans-serif',
        ],
      },
      fontSize: {
        h1: ['28px', { lineHeight: '42px', fontWeight: '700' }],
        h2: ['24px', { lineHeight: '36px', fontWeight: '700' }],
        h3: ['20px', { lineHeight: '30px', fontWeight: '500' }],
        b1: ['16px', { lineHeight: '24px', fontWeight: '400' }],
        b2: ['14px', { lineHeight: '21px', fontWeight: '400' }],
        b3: ['12px', { lineHeight: '18px', fontWeight: '400' }],
      },
      colors: {
        // ─── Brand: warm construction orange ──────────────────────────
        construction: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
        // Semantic alias of the brand — what UI code should reach for
        // when it wants "the construction primary".
        brand: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        // Slate-blue used for "execution / informational" surfaces
        // (works alongside the brand without competing).
        steel: {
          50:  '#f1f5f9',
          100: '#e2e8f0',
          200: '#cbd5e1',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
        },
        // Themeable accent scale. Each shade reads a --accent-* CSS variable,
        // but the FALLBACK is QuikInfra's own construction orange — so when no
        // user has picked a colour (the default), `accent-*` renders the exact
        // brand palette and the design is unchanged. AccentThemeApplier only
        // sets the variables when a user has explicitly chosen a colour.
        // (accent-300 = #FFAF55, the golden top of the primary-button gradient.)
        accent: {
          50:  'var(--accent-50, #fff7ed)',
          100: 'var(--accent-100, #ffedd5)',
          200: 'var(--accent-200, #fed7aa)',
          300: 'var(--accent-300, #FFAF55)',
          400: 'var(--accent-400, #fb923c)',
          500: 'var(--accent-500, #f97316)',
          600: 'var(--accent-600, #ea580c)',
          700: 'var(--accent-700, #c2410c)',
          800: 'var(--accent-800, #9a3412)',
          900: 'var(--accent-900, #7c2d12)',
          DEFAULT: 'var(--accent-color, #ea580c)',
        },
      },
      boxShadow: {
        'brand': '0 4px 14px 0 rgba(234, 88, 12, 0.18)',
        'soft':  '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.05)',
      },
      backgroundImage: {
        'brand-gradient':
          'linear-gradient(135deg, #ea580c 0%, #f97316 50%, #fb923c 100%)',
        'brand-soft':
          'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
        'shimmer-gradient':
          'linear-gradient(90deg, rgba(226,232,240,0) 0%, rgba(226,232,240,0.7) 50%, rgba(226,232,240,0) 100%)',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
