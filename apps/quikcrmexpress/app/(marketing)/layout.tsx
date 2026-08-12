import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { FAQS } from "./_components/faq-data";
import "./marketing.css";


/**
 * Marketing layout for the public landing page at `/`.
 *
 * Nested under the root `app/layout.tsx` (html/body/Providers). marketing.css
 * ships AFTER the root globals.css, so its resets and class overrides win for
 * the marketing surfaces only. Dashboard routes live in a different route
 * group and never load this layout.
 *
 * Mirrors apps/quiktrack/app/(marketing)/layout.tsx.
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

const SITE_URL = "https://crmexpress.quikit.ai";
const TITLE =
  "QuikCRMExpress — Sales CRM for Indian Teams | Leads, Pipeline & Telephony";
const DESCRIPTION =
  "QuikCRMExpress runs your whole sales motion in one place — lead capture, pipeline, quotes and orders, built-in telephony with call disposition, and automation that follows up so your reps don't have to.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · QuikCRMExpress" },
  description: DESCRIPTION,
  applicationName: "QuikCRMExpress",
  authors: [{ name: "Quikit" }],
  creator: "Quikit",
  publisher: "Quikit",
  keywords: [
    "sales CRM India",
    "lead management software",
    "CRM with telephony",
    "call disposition CRM",
    "sales pipeline software India",
    "quotation and order management",
    "sales automation for SMBs",
    "QuikCRMExpress",
  ],
  alternates: { canonical: "/" },
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
    siteName: "QuikCRMExpress",
    title: "QuikCRMExpress — Every lead worked. Every call logged.",
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  category: "business software",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Quikit",
  url: "https://quikit.in",
  sameAs: ["https://quikit.in"],
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "QuikCRMExpress",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: DESCRIPTION,
  url: SITE_URL,
  publisher: { "@type": "Organization", name: "Quikit", url: "https://quikit.in" },
  featureList: [
    "Lead capture, scoring and assignment",
    "Accounts, contacts and opportunity pipeline",
    "Quotes, price lists and orders",
    "Built-in telephony with call disposition",
    "Workflow automation and SLA tracking",
    "Bulk import from XLSX/CSV",
    "Reports and dashboards",
    "Quikit suite integration",
  ],
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
  return (
    <div className={`marketing-shell ${fraunces.variable} ${inter.variable}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </div>
  );
}
