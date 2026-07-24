import type { Metadata, Viewport } from 'next';
import { Fraunces } from 'next/font/google';
import './marketing.css';
import { FAQS } from './faqs';

/**
 * Marketing layout for the public QuikSkill landing page at `/`.
 *
 * Nested under the root `app/layout.tsx`, which already supplies html/body,
 * Providers and both font variables (`--font-sans` Inter, `--font-display`
 * Bricolage Grotesque) — so this one does NOT re-declare Inter. Re-declaring
 * would ship a second copy of the same family. It adds only Fraunces, which
 * the root layout does not load and which `.serif-italic` needs for the
 * editorial accents in the headings.
 *
 * `marketing.css` is imported here rather than in globals.css so its rules load
 * after Tailwind and apply inside the `.lp-root` wrapper only. Dashboard routes
 * live in other route groups and never load this layout.
 */

// The landing's display serif — used only by `.serif-italic`, so the italic
// cuts are the point.
const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  weight: ['500', '600', '700'],
  variable: '--font-fraunces-lp',
  display: 'swap',
});

/**
 * Applies the saved landing theme (or the OS preference) before first paint, so
 * a dark-mode visitor never sees a white flash. Uses its own `quikskill-theme`
 * key + `data-theme` attribute — deliberately separate from the dashboard's
 * `theme` key + `.dark` class, so toggling one never moves the other.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem('quikskill-theme');if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}`;

const SITE_URL = process.env.NEXT_PUBLIC_QUIKLMS_URL || 'https://quikskill.vercel.app';
const TITLE = 'QuikSkill — the LMS that runs training, assessment and compliance';
const DESCRIPTION =
  'Author courses, run proctored assessments, issue verifiable certificates and track compliance — for schools and enterprises, on one multi-tenant platform.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s · QuikSkill' },
  description: DESCRIPTION,
  applicationName: 'QuikSkill',
  authors: [{ name: 'Quikit' }],
  creator: 'Quikit',
  publisher: 'Quikit',
  keywords: [
    'learning management system',
    'LMS India',
    'corporate training platform',
    'school LMS',
    'proctored assessments',
    'online exam software',
    'compliance training',
    'SCORM LMS',
    'QuikSkill',
  ],
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    type: 'website',
    siteName: 'QuikSkill',
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  category: 'business software',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b1020',
};

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'QuikSkill',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: DESCRIPTION,
  url: SITE_URL,
  publisher: { '@type': 'Organization', name: 'Quikit', url: 'https://quikit.ai' },
  featureList: [
    'Course authoring with 3-tier module structure',
    'SCORM 1.2 and 2004 playback',
    'Proctored quizzes and exams',
    'Verifiable certificates',
    'Batches, attendance and timetables',
    'Compliance tracking and reporting',
    'Multi-tenant with role-based access',
  ],
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={fraunces.variable}>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      {children}
    </div>
  );
}
