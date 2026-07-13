"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ChevronDown } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type Kind = "money" | "percent" | "number" | "text";
type Row = { label: string; value: number | string; kind: Kind };
type Pillar = { key: string; num: string; title: string; desc: string; value: number | string; kind: Kind; tone: "good" | "watch" | "risk"; rows: Row[] };
type Data = { fy: { label: string; from: string; to: string }; pillars: Pillar[] };

const toneDot = { good: "bg-emerald-500", watch: "bg-amber-500", risk: "bg-rose-500" };
const toneText = { good: "text-emerald-600", watch: "text-amber-600", risk: "text-rose-600" };

export function HealthBreakdown({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { format } = useCurrency();
  const [expanded, setExpanded] = useState<string | null>("cash");

  const { data, isFetching } = useQuery<Data>({
    queryKey: ["dashboard-pillars"],
    enabled: open,
    queryFn: async () => {
      const r = await fetch("/api/v1/dashboard/pillars");
      return r.ok ? (((await r.json()) as { data?: Data }).data ?? { fy: { label: "", from: "", to: "" }, pillars: [] }) : { fy: { label: "", from: "", to: "" }, pillars: [] };
    }
  });

  if (!open) return null;
  const fmt = (v: number | string, kind: Kind) =>
    kind === "money" ? format(Number(v)) : kind === "percent" ? `${v}%` : kind === "number" ? new Intl.NumberFormat("en-IN").format(Number(v)) : String(v);

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm md:p-8" onClick={onClose}>
      <div className="w-full max-w-5xl rounded-3xl border bg-card p-6 shadow-popover md:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-bold tracking-tight md:text-3xl">The six pillars of financial intelligence.</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your business broken down for {data?.fy.label || "the current financial year"} · click a pillar to expand.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(data?.pillars ?? []).map((p) => {
            const isOpen = expanded === p.key;
            return (
              <button key={p.key} type="button" onClick={() => setExpanded(isOpen ? null : p.key)}
                className={cn("flex flex-col rounded-2xl border border-border/60 bg-background p-5 text-left shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-popover", isOpen && "ring-1 ring-primary/30")}>
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-300 font-serif text-sm font-bold text-amber-900">{p.num}</span>
                  <span className={cn("h-2 w-2 rounded-full", toneDot[p.tone])} title={p.tone} />
                </div>
                <h3 className="mt-3 font-serif text-xl font-bold tracking-tight">{p.title}</h3>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{p.desc}</p>
                <p className={cn("mt-3 text-2xl font-bold tabular-nums tracking-tight", toneText[p.tone])}>{fmt(p.value, p.kind)}</p>
                <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                  <div className="overflow-hidden">
                    <dl className="mt-3 space-y-1.5 border-t pt-3">
                      {p.rows.map((row, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 text-[13px]">
                          <dt className="text-muted-foreground">{row.label}</dt>
                          <dd className="font-semibold tabular-nums">{fmt(row.value, row.kind)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
                <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />{isOpen ? "Hide" : "Break down"}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-6 text-[13px] font-semibold text-muted-foreground">Weakness in one pillar creates stress across all six.</p>
        {isFetching && !data?.pillars.length ? <p className="mt-2 text-center text-sm text-muted-foreground">Loading your numbers…</p> : null}
      </div>
    </div>
  );
}
