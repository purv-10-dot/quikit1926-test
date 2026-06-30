"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/utils/currency";
import type { DataColumn, TableRow } from "@/lib/modules";
import { cn } from "@/lib/utils/cn";

function asDate(v: unknown) {
  if (typeof v !== "string" && typeof v !== "number") return String(v ?? "");
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

/** A single record rendered as a premium card (Card view). Picks a title, a headline
 *  money figure, a status chip, and a few supporting fields from the module columns. */
export function RecordCard({ columns, row, href, onClick }: {
  columns: DataColumn[];
  row: TableRow;
  href?: string | null;
  onClick?: () => void;
}) {
  const { currency } = useCurrency();
  const titleCol = columns[0];
  const moneyCol = columns.find((c) => c.kind === "money");
  const statusCol = columns.find((c) => c.kind === "status");
  const rest = columns
    .filter((c) => c !== titleCol && c !== moneyCol && c !== statusCol)
    .slice(0, 3);

  const title = String(row[titleCol?.key] ?? "—");
  const moneyVal = moneyCol ? row[moneyCol.key] : null;
  const money = moneyVal != null && moneyVal !== "" ? formatMoney(Number(moneyVal) || 0, currency) : null;
  const status = statusCol ? row[statusCol.key] : null;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[15px] font-semibold text-foreground">{title}</p>
        {href ? <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:text-indigo-500" /> : null}
      </div>
      {money ? <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{money}</p> : null}
      <div className="mt-3 space-y-1.5">
        {rest.map((c) => {
          const v = row[c.key];
          if (v == null || v === "") return null;
          return (
            <div key={c.key} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-muted-foreground">{c.label}</span>
              <span className="truncate font-medium">{c.kind === "date" ? asDate(v) : String(v)}</span>
            </div>
          );
        })}
      </div>
      {status && typeof status === "string" ? <div className="mt-3"><StatusBadge status={status} /></div> : null}
    </>
  );

  const cls = "group flex flex-col rounded-3xl border border-border/50 bg-card p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-popover";
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={cn(cls, "text-left")}>{inner}</button>;
}
