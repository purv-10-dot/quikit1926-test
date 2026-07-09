import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import { Providers } from "@/components/providers";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QuikTrack",
  description: "Project management — Spaces, Sprints, Kanban, Timesheet, Reports",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // SEC-06: forward the per-request CSP nonce (set by middleware on `x-nonce`)
  // to next-themes so its inline anti-FOUC theme script carries the nonce.
  // Without it, `script-src` (nonce + strict-dynamic, no 'unsafe-inline')
  // blocks that script — matches the JSON-LD nonce pattern in (marketing)/layout.
  const nonce = headers().get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning className={jakarta.variable}>
      <body className="font-sans antialiased">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
