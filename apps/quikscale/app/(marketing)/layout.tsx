import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./marketing.css";

/**
 * Marketing layout for the public landing page at `/`.
 *
 * Nested under root `app/layout.tsx`, which provides <html>, <body>,
 * SentryInit, and Providers (SessionProvider / QueryClient / ThemeProvider).
 * Those carry over here — we don't re-mount them. The root globals.css is
 * still loaded; marketing.css ships AFTER, so its overrides win for the
 * marketing-specific class names (.nav, .btn, .hero-*, .stage, …).
 *
 * Fonts (Fraunces serif + Inter sans) are scoped via CSS variables
 * (--font-serif, --font-sans) consumed by marketing.css. Dashboard pages
 * keep using Plus Jakarta Sans (the root layout's --font-jakarta).
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

export const metadata: Metadata = {
  title:
    "QuikScale — The Scaling Up Software Platform | KPI, OKR & Strategy Execution India",
  description:
    "QuikScale is the only software built for Verne Harnish's Scaling Up methodology — OPSP, KPI tracking, Rocks, Rockefeller Habits, FACe charts, and 28 AI agents in one connected platform. INR pricing.",
  keywords: [
    "Scaling Up software",
    "Rockefeller Habits software",
    "OKR tracking India",
    "KPI tracking software India",
    "strategy execution platform India",
    "OPSP software",
    "affordable OKR software India",
    "Scaling Up methodology tool",
    "performance management software India",
    "QuikScale",
  ],
  openGraph: {
    type: "website",
    siteName: "QuikScale",
    title: "QuikScale — The Only Software Built for Scaling Up",
    description:
      "KPIs, Rocks, OPSP, Rockefeller Habits, FACe charts, and 28 AI agents — the full Scaling Up toolkit in one connected platform. INR pricing.",
  },
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "QuikScale",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "QuikScale is the only software platform built for Verne Harnish's Scaling Up methodology — OPSP, KPI tracking, Rocks, Rockefeller Habits, FACe/PACe charts, cash modelling, and 28 AI agents in one platform.",
  publisher: { "@type": "Organization", name: "Quikit" },
  offers: {
    "@type": "Offer",
    priceCurrency: "INR",
    price: "499",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: "499",
      priceCurrency: "INR",
      unitText: "per user per month",
    },
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the best software for the Scaling Up methodology?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "QuikScale is the only software platform built specifically for Verne Harnish's Scaling Up / Rockefeller Habits methodology. It digitises the full toolkit — OPSP, KPI tracking, Rocks, Habits checklist, FACe and PACe charts — with 28 built-in AI agents and INR pricing for Indian companies.",
      },
    },
    {
      "@type": "Question",
      name: "Can you run Scaling Up without spreadsheets?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. QuikScale replaces every Scaling Up spreadsheet, PDF worksheet, and whiteboard with one connected platform. Your OPSP, KPIs, Rocks, and Habits checklist all live in one place — updated in real time, not just at the quarterly offsite.",
      },
    },
    {
      "@type": "Question",
      name: "How much does QuikScale cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "QuikScale starts at ₹499/user/month for teams up to 10, scaling to ₹399 (11–50), ₹299 (51–250), and ₹199 (251+). A one-time ₹25,000 implementation fee applies. On-premise available from ₹9L. All pricing in INR.",
      },
    },
    {
      "@type": "Question",
      name: "Can Scaling Up coaches use QuikScale across multiple client companies?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. QuikScale supports coach deployment across multiple client companies from one platform. Coaches can review cross-client execution data, run meeting rhythms, and use AI agents to prep for every session. A partner commission model is available.",
      },
    },
    {
      "@type": "Question",
      name: "What is the difference between QuikScale and a generic OKR tool?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Generic OKR tools like Lattice or Perdoo track goals and KPIs but have no concept of Rocks, OPSP, BHAG, FACe charts, Rockefeller Habits, or meeting rhythm. QuikScale implements the complete Scaling Up methodology — all four decisions — not just goal-tracking.",
      },
    },
  ],
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${fraunces.variable} ${inter.variable}`}>
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
