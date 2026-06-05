import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./marketing.css";

/**
 * Marketing layout for the public QuikCRM landing page at `/`.
 *
 * Nested under root `app/layout.tsx` (html/body/Providers). marketing.css ships
 * AFTER root globals.css so its resets win for the marketing surface. Dashboard
 * routes live in a different route group and never load this layout.
 *
 * Fonts: Inter via next/font (the QuikScale / QuikTrack pattern), exposed as the
 * `--font-sans` CSS variable that the ported marketing.css consumes.
 */

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-sans",
  display: "swap",
});

const SITE_URL = "https://crm.quikit.ai";
const TITLE = "QuikCRM — Run your entire sales motion from one workspace";
const DESCRIPTION =
  "Leads, pipeline, quotes, orders, telephony, and reports — 20 connected modules built for teams that sell. Capture, score, route, quote, and convert without switching tools.";
const OG_IMAGE = `${SITE_URL}/marketing/image%20-%202026-05-27T182232.568.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · QuikCRM" },
  description: DESCRIPTION,
  applicationName: "QuikCRM",
  authors: [{ name: "Quikit" }],
  creator: "Quikit",
  publisher: "Quikit",
  keywords: [
    "CRM software India",
    "sales CRM",
    "lead management software",
    "pipeline management",
    "quote to cash",
    "CPQ software India",
    "CRM with telephony",
    "affordable CRM",
    "QuikCRM",
  ],
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/marketing/CRM%2016.png", sizes: "16x16", type: "image/png" },
      { url: "/marketing/CRM%2032.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/marketing/CRM%20180.png",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    siteName: "QuikCRM",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [{ url: OG_IMAGE, alt: "QuikCRM — the complete sales OS" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_IMAGE] },
  category: "business software",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2A3F5A",
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "What exactly is QuikCRM?",
    a: "QuikCRM is a sales operating system built around 20 connected modules — leads, contacts, accounts, pipeline, quotes, orders, telephony, automations, reports and more. Every record, call and rule lives in one schema, so your reps stop tab-hopping and your data stops drifting.",
  },
  {
    q: "Can I bring my existing customer data in?",
    a: "Yes — drop a CSV and our importer maps columns, validates rows and pushes the work to a background queue so big files don't block your browser. You get row-level error reports for anything that fails and you can re-upload just the fixes.",
  },
  {
    q: "How does calling work inside the CRM?",
    a: "Click-to-call from any lead, contact or deal. The softphone shows live status, records the conversation and prompts the rep for a post-call disposition. Dispositions can auto-map to pipeline stages — so 'Demo Scheduled' actually moves the deal.",
  },
  {
    q: "How granular is access control?",
    a: "Three layers: RBAC roles define what a user can do; account-level ACL defines which records they see; and field-level masking hides sensitive columns from roles that shouldn't read them. Managers see their tree, reps see their book — no leakage.",
  },
  {
    q: "Can I customise the pipeline and fields?",
    a: "Every stage, status, dropdown and custom field is yours to shape — per entity. Add dynamic custom fields, write lead scoring rules, and save permission templates so a new hire gets the right view in one click.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Spin up a workspace in under a minute, no credit card required. You get the full module set on the trial so you can pressure-test it with real data before deciding.",
  },
];

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Quikit",
  url: "https://quikit.ai",
  logo: `${SITE_URL}/marketing/CRM%20logo.png`,
  sameAs: ["https://quikit.ai"],
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "QuikCRM",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: DESCRIPTION,
  url: SITE_URL,
  publisher: { "@type": "Organization", name: "Quikit", url: "https://quikit.ai" },
  featureList: [
    "Leads & pipeline management",
    "AI lead scoring",
    "Quote-to-cash (CPQ)",
    "Orders & invoicing",
    "Built-in telephony",
    "Workflow automation",
    "Reports & KPI dashboards",
    "RBAC & field-level security",
  ],
  offers: { "@type": "Offer", priceCurrency: "INR", price: "0", description: "Free trial" },
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

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={inter.variable}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      {children}
    </div>
  );
}
