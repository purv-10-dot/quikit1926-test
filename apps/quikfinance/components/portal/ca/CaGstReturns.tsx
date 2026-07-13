"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader, WidgetCard, EmptyState } from "@/components/portal/widgets";

type Col = { key: string; label: string; kind?: "money" | "number" };
type Summary = { label: string; value: number; tone?: string; kind?: "number" };
type Report = { title: string; description?: string; columns: Col[]; rows: Array<Record<string, unknown>>; summary: Summary[] };

const RETURNS = [
  { key: "gstr-1", label: "GSTR-1 (Outward)" },
  { key: "gstr-3b", label: "GSTR-3B (Summary)" }
];

export function CaGstReturns() {
  const { format } = useCurrency();
  const [type, setType] = useState("gstr-1");
  const { data, isPending } = useQuery({
    queryKey: ["ca-gst", type],
    queryFn: async () => {
      const r = await fetch(`/api/v1/portal/ca/gst?type=${type}`);
      return r.ok ? ((await r.json()).data as Report) : null;
    }
  });

  const cell = (row: Record<string, unknown>, c: Col) => {
    const v = row[c.key];
    if (c.kind === "money") return <span className="tabular-nums">{format(Number(v ?? 0))}</span>;
    if (c.kind === "number") return <span className="tabular-nums">{Number(v ?? 0)}</span>;
    return <span className="font-medium">{String(v ?? "—")}</span>;
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <SectionHeader title="GST Returns" description="Prepared from the selected company's invoices" actions={
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border bg-card px-3.5 py-2 text-sm font-medium shadow-card hover:text-primary"><Download className="h-4 w-4" />Export</button>
      } />

      <div className="flex flex-wrap gap-2">
        {RETURNS.map((r) => (
          <button key={r.key} onClick={() => setType(r.key)} className={cn("rounded-xl border px-3.5 py-2 text-sm font-medium transition", type === r.key ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-muted")}>{r.label}</button>
        ))}
      </div>

      {data?.summary && (
        <div className="grid gap-4 sm:grid-cols-3">
          {data.summary.map((s) => (
            <div key={s.label} className="rounded-2xl border bg-card p-5 shadow-card">
              <p className="text-[12px] text-muted-foreground">{s.label}</p>
              <p className={cn("mt-1 text-2xl font-bold tabular-nums", s.tone === "warn" && "text-amber-600", s.tone === "good" && "text-emerald-600")}>{s.kind === "number" ? s.value : format(s.value)}</p>
            </div>
          ))}
        </div>
      )}

      <WidgetCard title={data?.title ?? "GST Return"}>
        {isPending ? (
          <div className="space-y-2 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !data || data.rows.length === 0 ? (
          <EmptyState title="No data for this period" hint="No qualifying invoices in the selected company's books." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>{data.columns.map((c) => <th key={c.key} className={cn("px-5 py-2.5", c.kind ? "text-right" : "text-left")}>{c.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/40">{data.columns.map((c) => <td key={c.key} className={cn("px-5 py-2.5", c.kind ? "text-right" : "text-left")}>{cell(row, c)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>
    </div>
  );
}
