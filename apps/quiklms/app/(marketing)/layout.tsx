import type { Metadata, Viewport } from 'next';

/**
 * Marketing layout for the public QuikSkill landing page at `/`.
 *
 * Nested under the root `app/layout.tsx`, which already supplies html/body,
 * Providers and both font variables (`--font-sans` Inter, `--font-display`
 * Bricolage Grotesque) — so unlike the QuikCRM/QuikScale marketing layouts this
 * one does NOT re-declare next/font. Re-declaring would ship a second copy of
 * the same families.
 *
 * Dashboard routes live in other route groups and never load this layout.
 */

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

const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is QuikSkill?',
    a: 'QuikSkill is a multi-tenant learning management system covering the full training lifecycle — authoring courses, delivering them through a SCORM-capable player, assessing with proctored quizzes and exams, issuing verifiable certificates, and reporting on progress and compliance.',
  },
  {
    q: 'Does it work for schools as well as companies?',
    a: 'Yes. Each tenant is configured as either school or corporate, which changes the vocabulary and the modules on offer — batches, timetables, attendance and parent access for schools; course assignments, compliance windows and manager reporting for enterprises.',
  },
  {
    q: 'How are assessments kept honest?',
    a: 'Quizzes can run under proctoring with fullscreen enforcement, tab-switch and copy-paste detection, and webcam face checks. Question order and the served subset are randomised per attempt and pinned server-side, so two learners sitting together do not see the same paper.',
  },
  {
    q: 'Can certificates be verified by someone outside the organisation?',
    a: 'Every issued certificate carries a public verification URL and a QR code that resolves to it. An employer can confirm authenticity without an account, and the certificate is only downloadable when the learner actually met the passing criteria.',
  },
  {
    q: 'What content formats are supported?',
    a: 'Video (uploaded, YouTube or Vimeo), audio, PDF, Word, Excel and PowerPoint documents, rich text, external links, embeds, and SCORM 1.2 / 2004 packages with progress tracked back into the learner record.',
  },
];

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
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      {children}
    </>
  );
}

export { FAQS };
