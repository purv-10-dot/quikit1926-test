import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
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

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`${fraunces.variable} ${inter.variable}`}>{children}</div>;
}
