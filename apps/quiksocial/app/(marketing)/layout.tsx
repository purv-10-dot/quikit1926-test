import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import SmoothScroll from "./_components/SmoothScroll";
import RevealObserver from "./_components/RevealObserver";
import "./marketing.css";
import "lenis/dist/lenis.css";

/**
 * Marketing layout for the public landing page at `/`.
 *
 * Nested under root `app/layout.tsx` (which owns <html>/<body>/Providers and
 * Plus Jakarta Sans). We never re-mount those here. marketing.css + the
 * landing fonts + Lenis smooth scroll load ONLY on this route group, so the
 * dark cinematic landing never bleeds into the (light) dashboard, which lives
 * in a different route group and never imports this layout.
 *
 * Landing fonts are exposed as CSS variables (--font-sans / --font-serif /
 * --font-mono) on the wrapper; the inline fontFamily makes the whole landing
 * subtree pick up Inter even though <body> keeps the dashboard's Jakarta.
 */


const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QuikSocial — Amplify Your Social Presence",
  description:
    "Schedule, analyze, and grow across every social platform from a single cinematic command center. Built for creators who refuse to be average.",
  keywords: [
    "social media management",
    "AI content creation",
    "social media scheduling",
    "content analytics",
    "Instagram scheduler",
    "LinkedIn scheduler",
    "social media automation",
    "AI captions",
    "QuikSocial",
  ],
  openGraph: {
    type: "website",
    siteName: "QuikSocial",
    title: "QuikSocial — Amplify Your Social Presence",
    description:
      "Schedule, analyze, and grow across every social platform from a single cinematic command center.",
  },
};

export const viewport: Viewport = {
  themeColor: "#050507",
  colorScheme: "dark",
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "QuikSocial",
  description:
    "Schedule, analyze, and grow across every social platform from a single cinematic command center.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${inter.variable} ${instrumentSerif.variable} ${jetBrainsMono.variable}`}
      style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <SmoothScroll />
      <RevealObserver />
      {children}
    </div>
  );
}
