import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./marketing.css";

/**
 * Marketing layout for the public landing page at `/`.
 *
 * Nested under root `app/layout.tsx`, which provides <html>, <body>, and
 * Providers (SessionProvider / QueryClient / ThemeProvider). Those carry
 * over here — we don't re-mount them. The root globals.css is still
 * loaded; marketing.css ships AFTER, so its overrides win for the
 * marketing-specific class names (.nav, .btn, .hero-*, .stage, …).
 *
 * Fonts (Fraunces serif + Inter sans) are scoped via CSS variables
 * (--font-serif, --font-sans) consumed by marketing.css — mirrors
 * apps/quikscale/app/(marketing)/layout.tsx. Dashboard pages keep using
 * Plus Jakarta Sans (the root layout's --font-jakarta).
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
  title: "QuikFlow — No-Code Workflow Automation Across QuikIT",
  description:
    "QuikFlow connects triggers, actions, and approvals across every QuikIT app into one no-code automation canvas — no engineering ticket required.",
  openGraph: {
    type: "website",
    siteName: "QuikFlow",
    title: "QuikFlow — No-Code Workflow Automation Across QuikIT",
    description:
      "Build cross-app automations — meetings, KPIs, approvals, notifications — without writing a line of code.",
  },
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "QuikFlow",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "QuikFlow is QuikIT's no-code workflow automation platform — triggers, actions, and approvals connected across every app in the QuikIT suite.",
  publisher: { "@type": "Organization", name: "Quikit" },
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
      {children}
    </div>
  );
}
