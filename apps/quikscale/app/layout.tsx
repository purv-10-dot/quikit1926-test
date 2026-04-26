import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { SentryInit } from "./sentry-init";
import "./globals.css";

// Primary typeface per design system (see docs/typography.md).
// All weights bundled so h1 (bold) / h3 (medium) / body (regular) work without FOUT.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QuikIT - All Your Business Apps, One Platform",
  description:
    "One platform to access all your business apps — KPI tracking, performance management, payroll, and more.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={jakarta.variable}>
      <body className="font-sans antialiased">
        <SentryInit />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
