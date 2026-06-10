import type { Metadata, Viewport } from "next";
import "./marketing.css";

/**
 * Marketing layout for the public landing page at `/`.
 *
 * Nested under root `app/layout.tsx` (html/body/Providers/Plus Jakarta Sans).
 * marketing.css ships AFTER root globals.css, so its resets and class
 * overrides win for the marketing-specific surfaces. Dashboard routes are in
 * a different route group and never load this layout.
 *
 * Fonts (Space Grotesk + Inter) are loaded via the root layout's <link>
 * tags-equivalent — we mirror the standalone landing's approach using a
 * `<link>` block injected by the root layout. Keeping it minimal here.
 */
const SITE_URL = "https://quikinfra.quikit.ai";
const SITE_NAME = "QuikInfra ERP";
const TITLE = "QuikInfra ERP — Construction Management Software for Indian Builders";
const DESCRIPTION =
  "QuikInfra is an AI-powered construction ERP that connects site, store, procurement, and management. Track materials, money, and project progress in real time — replace Excel and WhatsApp with one unified construction management platform.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | QuikInfra ERP",
  },
  description: DESCRIPTION,
  keywords: [
    "construction ERP software",
    "construction management software",
    "construction project management software",
    "construction procurement software",
    "BOQ tracking software",
    "daily progress report software",
    "DPR software",
    "contractor billing software",
    "RAB billing",
    "material requisition",
    "purchase order software for construction",
    "inventory management for construction",
    "AI construction software",
    "construction software India",
    "QuikInfra",
    "QuikInfra",
  ],
  applicationName: SITE_NAME,
  authors: [{ name: "QuikInfra", url: SITE_URL }],
  creator: "QuikInfra",
  publisher: "QuikInfra",
  category: "Construction Software",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_IN",
    images: [
      {
        url: "/marketing/og-image.png",
        width: 1200,
        height: 630,
        alt: "QuikInfra ERP — Run every construction site from one dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/marketing/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
