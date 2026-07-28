import type { Metadata } from 'next';
import {
  Inter,
  Bricolage_Grotesque,
  Noto_Sans_Devanagari,
  Noto_Sans_Bengali,
  Noto_Sans_Tamil,
  Noto_Sans_Telugu,
  Noto_Sans_Kannada,
} from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// Body/UI face — readable workhorse for dense interfaces and data.
const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

// Display face — carries QuikSkill's personality on headings and stats.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '600', '700', '800'],
});

/*
 * Indic script coverage — one face per script behind the 7 shipped locales
 * (see LOCALES in lib/i18n.tsx). Inter carries no Devanagari/Bengali/Tamil/
 * Telugu/Kannada glyphs, so hi, mr, bn, ta, te and kn were falling back to
 * whatever the OS happened to have — six of seven locales rendering degraded.
 * `globals.css` maps each `html[lang=…]` to the variables declared here.
 *
 * These are loaded through next/font (not the old `@import` from
 * fonts.googleapis.com) so they are SELF-HOSTED from our own origin: a
 * `font-src`/`style-src 'self'` CSP would drop the external request outright,
 * and self-hosting also removes the extra DNS + connection hop.
 *
 * `preload: false` on all five: the overwhelming majority of sessions are `en`,
 * and preloading would push five unused font payloads into every page's <head>.
 * The @font-face rules are still emitted, so the browser fetches the one it
 * actually needs the moment the matching `html[lang]` rule applies.
 */
// Devanagari serves BOTH hi and mr.
const devanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  variable: '--font-devanagari',
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
});

const bengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  variable: '--font-bengali',
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
});

const tamil = Noto_Sans_Tamil({
  subsets: ['tamil'],
  variable: '--font-tamil',
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
});

const telugu = Noto_Sans_Telugu({
  subsets: ['telugu'],
  variable: '--font-telugu',
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
});

const kannada = Noto_Sans_Kannada({
  subsets: ['kannada'],
  variable: '--font-kannada',
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
});

const fontVars = [
  sans.variable,
  display.variable,
  devanagari.variable,
  bengali.variable,
  tamil.variable,
  telugu.variable,
  kannada.variable,
].join(' ');

export const metadata: Metadata = {
  title: 'QuikSkill LMS',
  description: 'Multi-tenant Learning Management System',
  // QuikSkill ships its OWN in-app i18n (7 locales — see lib/i18n.tsx), so
  // browser auto-translation is redundant AND harmful: Google Translate rewrites
  // the server-rendered text (wrapping nodes in <font> tags) BEFORE React
  // hydrates, which trips "Hydration failed — initial UI does not match". Opting
  // the app out of machine translation removes that whole class of mismatch and
  // leaves language selection to the in-app switcher.
  other: { google: 'notranslate' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` covers ONLY this element's own attributes, not
    // its subtree. The marketing layout's pre-paint theme script stamps
    // `data-theme` on <html> before React hydrates, and React would otherwise
    // log "Extra attributes from the server: data-theme" on every landing view.
    // This is the documented remedy for that pattern; it hides nothing else.
    // (It also covers `lang`, which Providers syncs to the chosen locale.)
    <html lang="en" translate="no" suppressHydrationWarning className={`notranslate ${fontVars}`}>
      {/* `suppressHydrationWarning` on <body>: browser extensions that inject
          attributes/nodes into the body before hydration (Grammarly's
          data-gr-* / data-new-gr-* attrs, password managers, Dark Reader) would
          otherwise trip a hydration mismatch on an otherwise-correct tree. This
          suppresses only <body>'s own attributes, one level deep — real
          mismatches inside the app still surface. */}
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
