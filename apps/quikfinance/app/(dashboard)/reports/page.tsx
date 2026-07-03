"use client";

import Link from "next/link";
import { TrendingUp, Scale, Wallet, Users, ShoppingCart, Landmark, Package, Target, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { translateReportMeta, useI18n } from "@/lib/i18n";
import { reportConfigs } from "@/lib/reports";
import { cn } from "@/lib/utils/cn";

const CATEGORIES = [
  { label: "Profitability & Growth", icon: TrendingUp, accent: "text-emerald-500", keys: ["profit-loss", "project-profitability"] },
  { label: "Financial Position", icon: Scale, accent: "text-indigo-500", keys: ["balance-sheet", "trial-balance", "general-ledger", "day-book"] },
  { label: "Cash Flow", icon: Wallet, accent: "text-sky-500", keys: ["cash-flow", "fx-revaluation"] },
  { label: "Receivables & Payables", icon: Users, accent: "text-amber-500", keys: ["aging", "outstanding", "customer-statement", "vendor-statement"] },
  { label: "Sales & Purchases", icon: ShoppingCart, accent: "text-violet-500", keys: ["sales-register", "purchase-register"] },
  { label: "Taxes (GST)", icon: Landmark, accent: "text-rose-500", keys: ["gst-summary", "gstr-1", "gstr-3b", "gst-parity"] },
  { label: "Inventory", icon: Package, accent: "text-cyan-500", keys: ["stock-valuation"] },
  { label: "Planning", icon: Target, accent: "text-fuchsia-500", keys: ["budget-vs-actual"] }
] as const;

export default function ReportsPage() {
  const { locale, t } = useI18n();
  const all = reportConfigs as Record<string, { key: string; title: string; description: string }>;
  const used = new Set<string>();

  const sections = CATEGORIES.map((cat) => ({
    ...cat,
    reports: cat.keys.map((k) => all[k]).filter(Boolean).map((r) => { used.add(r.key); return r; })
  })).filter((s) => s.reports.length > 0);

  const other = Object.values(all).filter((r) => !used.has(r.key));

  const Card = ({ report }: { report: { key: string; title: string; description: string } }) => {
    const meta = translateReportMeta(locale, report.key, { title: report.title, description: report.description });
    return (
      <Link href={`/reports/${report.key}`} className="group flex flex-col rounded-3xl border border-border/50 bg-card p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-popover">
        <div className="flex items-start justify-between">
          <p className="text-[15px] font-semibold">{meta.title}</p>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
        <p className="mt-1 flex-1 text-[13px] leading-relaxed text-muted-foreground">{meta.description}</p>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">What changed · Why · What to do</p>
      </Link>
    );
  };

  return (
    <div className="space-y-8 animate-fade-up">
      <PageHeader title={t("reports.title", "Reports")} description={t("reports.description", "Visual business insights — every report answers what changed, why, and what to do next.")} />
      {sections.map((s) => (
        <section key={s.label}>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <s.icon className={cn("h-5 w-5", s.accent)} />{s.label}
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {s.reports.map((r) => <Card key={r.key} report={r} />)}
          </div>
        </section>
      ))}
      {other.length ? (
        <section>
          <h2 className="mb-3 text-base font-semibold">More reports</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {other.map((r) => <Card key={r.key} report={r} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
