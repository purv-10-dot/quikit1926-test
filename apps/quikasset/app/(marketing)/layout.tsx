import type { Metadata } from "next";
import "./marketing.css";

export const metadata: Metadata = {
  title: "QuikAsset — IT & Fixed-Asset Lifecycle Management",
  description:
    "Track company assets from procurement to retirement: inventory, assignments, repairs, replacements, fiscal budgets, reports and a full audit trail.",
  openGraph: {
    title: "QuikAsset — IT & Fixed-Asset Lifecycle Management",
    description:
      "Inventory, assignments, repairs, budgets and reports for every company asset.",
    type: "website",
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Providers are mounted once at the root layout — do NOT re-mount here.
  return <div className="qa-landing">{children}</div>;
}
