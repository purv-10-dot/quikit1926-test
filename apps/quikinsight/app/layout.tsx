import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import SessionProviders from "@/components/layout/SessionProviders";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "QuikInsight — AI Growth OS for Marketing",
  description: "AI-native marketing intelligence dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Apply the persisted theme server-side so there's no flash of the wrong mode.
  const isDark = cookies().get("theme")?.value === "dark";
  return (
    <html lang="en" className={inter.variable}>
      <body className={isDark ? "dark" : undefined}>
        <SessionProviders>
          <AppShell>{children}</AppShell>
        </SessionProviders>
      </body>
    </html>
  );
}
