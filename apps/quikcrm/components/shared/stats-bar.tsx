/**
 * Stats bar — the thin row of inline KPIs shown above list pages.
 *
 * Visual pattern mirrors the Opportunities pipeline header
 * ("Pipeline ₹55.5Cr · Weighted ₹27.5Cr · This quarter forecast ₹27.5Cr"):
 * muted label, semibold tabular-num value, separator dots, optional accent
 * pill for highlight stats.
 *
 * Render this directly under the <PageHeader>; the Quotes / Products /
 * Price Lists list pages all use it.
 */
import type { ReactNode } from "react";

export interface StatItem {
  /** Muted, lowercase-ish label. Keep it short — "active", "drafts", not "Active deals" */
  label: string;
  /** Main figure — already formatted (₹ prefix, comma separators, etc.). */
  value: ReactNode;
  /** Optional helper shown under or beside the value in muted style. */
  hint?: string;
  /** If true, value renders in accent colour instead of crm-text — used for "Default" / "Active" highlights. */
  accent?: boolean;
}

export function StatsBar({ items, className = "" }: { items: StatItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <div
      className={
        "mb-4 flex flex-wrap items-baseline gap-x-5 gap-y-2 rounded-lg border border-crm-border bg-white px-4 py-3 text-sm " +
        className
      }
      role="region"
      aria-label="Summary statistics"
    >
      {items.map((it, i) => (
        <div key={`${it.label}-${i}`} className="flex items-baseline gap-1.5">
          <span className="text-xs uppercase tracking-wider text-crm-muted">{it.label}</span>
          <span
            className={
              "tabular-nums font-semibold " + (it.accent ? "text-accent-700" : "text-crm-text")
            }
          >
            {it.value}
          </span>
          {it.hint && <span className="text-xs text-crm-muted">{it.hint}</span>}
        </div>
      ))}
    </div>
  );
}
