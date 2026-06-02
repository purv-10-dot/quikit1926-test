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
  title: "QuikScale — Run your Scaling Up strategy. Live. In one place.",
  description:
    "QuikScale is the goal and KPI tracking tool built natively on the Scaling Up methodology. Track People, Strategy, Execution, and Cash — in rhythm, in one place.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`${fraunces.variable} ${inter.variable}`}>{children}</div>;
}
