import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { SentryInit } from "./sentry-init";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
      <body className="font-body antialiased">
        <SentryInit />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
