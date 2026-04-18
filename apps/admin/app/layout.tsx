import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { SentryInit } from "./sentry-init";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuikScale Admin",
  description: "Organisation management portal for QuikScale",
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
