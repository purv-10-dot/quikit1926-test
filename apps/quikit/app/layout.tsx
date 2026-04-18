import type { Metadata } from "next";
import { Providers } from "./providers";
import { SentryInit } from "./sentry-init";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuikIT — Platform Gateway",
  description: "Login, manage your organization, and launch apps.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <SentryInit />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
