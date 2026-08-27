import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { headers } from "next/headers";
import "./marketing.css";


/**
 * Marketing layout for the public landing page at `/`.
 *
 * Nested under root `app/layout.tsx` (html/body/Providers/Plus Jakarta Sans).
 * marketing.css ships AFTER root globals.css, so its resets and class
 * overrides win for the marketing-specific surfaces. Dashboard routes are in
 * a different route group and never load this layout.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});


const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const SITE_URL = "https://track.quikit.ai";
const TITLE =
  "QuikTrack — Jira Alternative for Indian Teams | Affordable Project Management Software";
const DESCRIPTION =
  "QuikTrack gives Indian engineering teams full Jira-equivalent functionality — sprint boards, backlog management, bug tracking, and custom workflows — at 1/10th the cost. INR pricing. No USD surprises. Try free.";
const OG_IMAGE = `${SITE_URL}/marketing/HEro%20BG.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · QuikTrack",
  },
  description: DESCRIPTION,
  applicationName: "QuikTrack",
  authors: [{ name: "Quikit" }],
  creator: "Quikit",
  publisher: "Quikit",
  keywords: [
    "Jira alternative India",
    "project management software for startups",
    "affordable project management software",
    "task management tool India",
    "agile project management software India",
    "developer task management tool",
    "reduce Jira costs",
    "sprint planning tool India",
    "project tracking software for SMBs",
    "QuikTrack",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "QuikTrack",
    title: "QuikTrack — Everything Jira Does. 1/10th the Price.",
    description:
      "Full sprint boards, backlog, bug tracking and custom workflows for Indian engineering teams — priced for India, not Atlassian's enterprise clients.",
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: OG_IMAGE,
        width: 1920,
        height: 1471,
        alt: "QuikTrack sprint board — Jira alternative India",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  category: "business software",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2d88ff",
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is QuikTrack?",
    a: "QuikTrack is the engineering workspace that ships product faster. It brings sprint boards, backlog management, bug and issue tracking, custom workflows, velocity reporting, and release management into one connected workspace — giving your team real-time visibility from sprint kickoff to release.",
  },
  {
    q: "What does QuikTrack's sprint planning look like?",
    a: "QuikTrack supports full Scrum and Kanban workflows. Sprint planning, velocity tracking, burndown charts, and WIP limits are all built in. Your team gets instant sprint visibility — burndown, cycle time, and velocity live on one screen — so you know where the sprint stands before standup, not after a deadline slips.",
  },
  {
    q: "How does issue tracking work in QuikTrack?",
    a: "Every issue has an owner, a status, and a due date. QuikTrack tracks the full hierarchy — epics, stories, tasks, and bugs — with linked PRs, screenshots, and threaded comments. Every issue owned. Every resolution tracked.",
  },
  {
    q: "Can I build custom workflows?",
    a: "Yes. QuikTrack lets you define custom statuses, transitions, validators, and approvals. Build the exact process your team runs — not the rigid default someone else decided you'd need. No paid plugins required.",
  },
  {
    q: "How quickly can my team get started?",
    a: "Most teams are running their first sprint within 5 days. QuikTrack is intuitive by design — no lengthy onboarding, no certification courses, and no dedicated admin required to get up and running.",
  },
  {
    q: "Does QuikTrack connect with other tools?",
    a: "QuikTrack is part of the Quikit OS. When a deal closes in QuikCRM, a project opens automatically in QuikTrack. Engineering KPIs flow into QuikScale. One connected suite for your entire company — no integrations to maintain.",
  },
];

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Quikit",
  url: "https://quikit.in",
  logo: `${SITE_URL}/marketing/logo.png`,
  sameAs: ["https://quikit.in"],
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "QuikTrack",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "QuikTrack is the engineering workspace that ships product faster — sprint boards, backlog management, issue tracking, custom workflows, velocity reporting, and release management in one connected platform.",
  url: SITE_URL,
  publisher: { "@type": "Organization", name: "Quikit", url: "https://quikit.in" },
  featureList: [
    "Sprint boards (Scrum and Kanban)",
    "Backlog management",
    "Bug and issue tracking",
    "Custom workflows",
    "Velocity reporting",
    "Release management",
    "Goal cascade",
    "Quikit OS integration",
  ],
  offers: {
    "@type": "Offer",
    priceCurrency: "INR",
    price: "66",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: "66",
      priceCurrency: "INR",
      unitText: "per user per month",
    },
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    reviewCount: "24",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // SEC-06: the per-request CSP nonce set by middleware. Our inline JSON-LD
  // scripts must carry it now that script-src no longer allows 'unsafe-inline'.
  const nonce = headers().get("x-nonce") ?? undefined;
  return (
    <div className={`marketing-shell ${fraunces.variable} ${inter.variable}`}>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </div>
  );
}
