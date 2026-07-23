import type { Metadata } from 'next';
import { Inter, Bricolage_Grotesque } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'QuikSkill LMS',
  description: 'Multi-tenant Learning Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` covers ONLY this element's own attributes, not
    // its subtree. The marketing layout's pre-paint theme script stamps
    // `data-theme` on <html> before React hydrates, and React would otherwise
    // log "Extra attributes from the server: data-theme" on every landing view.
    // This is the documented remedy for that pattern; it hides nothing else.
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
