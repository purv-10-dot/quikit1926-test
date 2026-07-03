"use client";

import { Sparkles, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { BentoCard } from "@/components/design/bento";
import { useAiDock } from "@/lib/stores/ai-dock";

export type SummaryItem = { label: string; value: number; tone?: "good" | "warn" | "neutral"; kind?: string };

/** Per-report "what to do next" suggestions, keyed by report. */
const NEXT_STEP: Record<string, string> = {
  aging: "Send payment reminders to customers with the largest overdue balances.",
  outstanding: "Prioritise collections on the oldest, biggest overdue amounts.",
  "trial-balance": "If the difference isn't zero, find the unbalanced entry before closing the period.",
  "balance-sheet": "Confirm assets equal liabilities plus equity, then lock the period.",
  "profit-loss": "Compare with the previous period to see which categories moved — and why.",
  "cash-flow": "Plan for upcoming outflows so the closing balance stays positive.",
  "gst-summary": "Reconcile output tax against input credit before you file.",
  "gstr-3b": "File GSTR-3B before the 20th to avoid late fees and interest.",
  "gstr-1": "File GSTR-1 with this period's outward supplies.",
  "sales-register": "Identify your strongest periods and double down on what's working.",
  "purchase-register": "Review vendor spend for consolidation or negotiation opportunities.",
  "stock-valuation": "Flag slow-moving stock that's tying up working capital.",
  "budget-vs-actual": "Investigate any category running over budget this period.",
  "day-book": "Scan for unusual entries before they reach the financial statements.",
  "general-ledger": "Drill into any account with unexpected movement."
};

export function InsightStrip({ reportKey, summary, title, format }: {
  reportKey: string;
  summary: SummaryItem[];
  title: string;
  format: (n: number) => string;
}) {
  const openDock = useAiDock((s) => s.openDock);
  const fmt = (it: SummaryItem) =>
    it.kind === "number" ? new Intl.NumberFormat("en-IN").format(it.value) : it.kind === "percent" ? `${it.value}%` : format(it.value);

  const headline = summary[0];
  const watch = summary.filter((s) => s.tone === "warn");
  const good = summary.filter((s) => s.tone === "good");
  const nextStep = NEXT_STEP[reportKey] ?? "Review the figures below, then export or share for your records.";

  return (
    <BentoCard interactive={false} tone="indigo">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        <Sparkles className="h-4 w-4 text-indigo-500" />Insights
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Highlight</p>
          {headline ? <p className="mt-1 text-lg font-bold tabular-nums">{fmt(headline)}</p> : <p className="mt-1 text-sm text-muted-foreground">—</p>}
          {headline ? <p className="text-[12px] text-muted-foreground">{headline.label}</p> : null}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Watch</p>
          {watch.length ? (
            <ul className="mt-1 space-y-1">
              {watch.slice(0, 3).map((w) => (
                <li key={w.label} className="flex items-center gap-1.5 text-[12px]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />{w.label}: <span className="font-semibold tabular-nums">{fmt(w)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Nothing flagged{good.length ? "" : ""}.</p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Do next</p>
          <p className="mt-1 text-[12px] leading-snug">{nextStep}</p>
          <button type="button" onClick={() => openDock(`Explain my ${title} report — what changed and what should I do?`)}
            className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-600 hover:underline">
            Ask AI <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </BentoCard>
  );
}
