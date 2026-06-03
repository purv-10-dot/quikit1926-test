import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { DeltaResult } from "@/lib/services/dashboard/period";

/**
 * Period-comparison pill, Bug 6 redesign.
 *
 *   delta.kind === "pct"  → green ▲ "+X%" if good, red ▼ "-X%" if bad.
 *   delta.kind === "new"  → green ▲ "↑ new" — caller had zero prior data
 *                           and a non-zero current value; rendering a
 *                           percentage from a zero base is undefined,
 *                           so we surface that explicitly.
 *   delta.kind === "none" → gray "—" with the range label, for the
 *                           prior=0/value=0 case.
 *
 * `goodWhenLow` flips the sign for metrics where down is good (overdue
 * tasks, stale leads, calls without disposition).
 */
export function DeltaPill({
  delta,
  rangeLabel,
  goodWhenLow = false,
}: {
  delta: DeltaResult;
  rangeLabel: string;
  goodWhenLow?: boolean;
}) {
  if (delta.kind === "none") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        <Minus className="h-3 w-3" />
        — vs {rangeLabel}
      </span>
    );
  }

  if (delta.kind === "new") {
    // "new" is intrinsically an upward signal; goodWhenLow flips polarity.
    const isGood = !goodWhenLow;
    const cls = isGood
      ? "bg-emerald-50 text-emerald-700"
      : "bg-rose-50 text-rose-700";
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
        <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
        new vs {rangeLabel}
      </span>
    );
  }

  const pct = delta.value;
  const isZero = pct === 0;
  if (isZero) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        <Minus className="h-3 w-3" />
        — vs {rangeLabel}
      </span>
    );
  }

  const isUp = pct > 0;
  const isGood = goodWhenLow ? !isUp : isUp;
  const cls = isGood
    ? "bg-emerald-50 text-emerald-700"
    : "bg-rose-50 text-rose-700";
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;
  const sign = isUp ? "+" : "";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {sign}
      {pct}% vs {rangeLabel}
    </span>
  );
}
