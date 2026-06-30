import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./marketing.css";

/**
 * Marketing layout for the public landing page at `/`.
 *
 * Nested under root `app/layout.tsx`. marketing.css ships AFTER root globals.css
 * so its resets win for marketing surfaces. Dashboard routes are in a different
 * route group and never load this layout.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const SITE_URL = "https://finance.quikit.ai";
const TITLE = "QuikFinance — Cloud Accounting & GST Software for Indian Businesses";
const DESCRIPTION =
  "QuikFinance is the finance workspace that closes your books faster — invoicing, billing, banking, GST returns, and reports in one connected platform. INR-first. GST-ready. Try free.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · QuikFinance" },
  description: DESCRIPTION,
  applicationName: "QuikFinance",
  authors: [{ name: "Quikit" }],
  creator: "Quikit",
  publisher: "Quikit",
  keywords: [
    "accounting software India",
    "GST software",
    "invoicing software India",
    "GST return filing",
    "bank reconciliation software",
    "cloud accounting for SMBs",
    "e-invoicing software",
    "QuikFinance",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "QuikFinance",
    title: "QuikFinance — Cloud Accounting & GST, done faster.",
    description:
      "Invoicing, billing, banking, GST returns, and reports for Indian businesses — connected in one fast, intelligent workspace.",
    url: SITE_URL,
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  category: "business software",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2d88ff",
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "QuikFinance",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  description:
    "QuikFinance is cloud accounting and GST software — invoicing, billing, banking, reconciliation, GST returns, and financial reports in one connected platform.",
  url: SITE_URL,
  publisher: { "@type": "Organization", name: "Quikit", url: "https://quikit.in" },
  featureList: [
    "Invoicing and receivables",
    "Bills and payments",
    "Banking and reconciliation",
    "GST returns (GSTR-1, 3B) and e-invoicing",
    "Financial reports (P&L, balance sheet, cash flow)",
    "Inventory and projects",
    "Quikit OS integration",
  ],
  offers: {
    "@type": "Offer",
    priceCurrency: "INR",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      priceCurrency: "INR",
      unitText: "per user per month",
    },
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`marketing-shell ${jakarta.variable}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      {children}
    </div>
  );
}
