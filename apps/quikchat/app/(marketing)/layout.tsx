import type { Metadata } from "next";

/**
 * Marketing layout for the public landing page at `/`.
 *
 * Nested under the root `app/layout.tsx` (html/body/Providers). Dashboard
 * routes live in the `(dashboard)` route group and never load this layout.
 */
export const metadata: Metadata = {
  title: "QuikChat — Real-time team messaging on QuikIT",
  description:
    "Channels, DMs, calls, and meetings for your team — part of the QuikIT suite. Sign in with your QuikIT account.",
};


export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="qc-marketing-shell">{children}</div>;
}
