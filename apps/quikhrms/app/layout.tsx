import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Fraunces } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "QuikIT HRMS",
  description: "AI-native HR Management System — QuikIT OS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // The head script applies the saved `dark` class before hydration to avoid
      // a theme flash, which intentionally diverges from the server HTML — so the
      // <html> attribute mismatch here is expected and suppressed.
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            // Apply saved dark theme before hydration to avoid a flash — but NOT on
            // pre-auth/branded pages (login, password reset, invites, candidate
            // portal), which have their own fixed design and must stay light.
            __html: `try{var p=location.pathname;var preAuth=/(login|forgot-password|reset-password|invite|candidate-portal|candidate-documents|interview-feedback)/.test(p);var t=localStorage.getItem('hrms.theme');if(t==='dark'&&!preAuth)document.documentElement.classList.add('dark');}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
