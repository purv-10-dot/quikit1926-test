"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BentoCard, Metric, Pill } from "@/components/design/bento";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type Line = { name: string; qty: number; revenue: number; cost: number; contribution: number; marginPct: number };
type Pareto = { eighty: number; count: number; total: number; share: number };
type Data = {
  period: { from: string; to: string; label: string };
  totals: { revenue: number; cost: number; contribution: number; marginPct: number };
  products: Line[];
  customers: Line[];
  pareto: { products: Pareto; customers: Pareto };
};

const CONCEPTS = [
  { n: "1", title: "80/20 rule", desc: "Typically 20% of products or customers drive 80% of contribution. Protect winners, fix or cut losers." },
  { n: "2", title: "Hidden costs", desc: "Freight, packaging, returns, discounts, payment gateway fees, support, and warranty all eat margin silently." },
  { n: "3", title: "Customer-level profitability", desc: "A customer can be unprofitable even when the product is profitable, once you count service cost and payment terms." },
  { n: "4", title: "Channel economics", desc: "Direct, distributor, and online each carry a different real margin. Measure them separately." },
  { n: "5", title: "Geography", desc: "Each region carries a different real margin once you count logistics, pricing, and payment behaviour." }
];

const pad = (x: number) => String(x).padStart(2, "0");

export function UnitEconomics() {
  const { format } = useCurrency();
  const [offset, setOffset] = useState(0);

  const range = useMemo(() => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + offset);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    const from = `${y}-${pad(m + 1)}-01`;
    const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    return { from, to, label };
  }, [offset]);

  const { data } = useQuery<Data>({
    queryKey: ["unit-economics", range.from, range.to],
    queryFn: async () => {
      const r = await fetch(`/api/v1/reports/unit-economics?from=${range.from}&to=${range.to}`);
      return r.ok ? (((await r.json()) as { data?: Data }).data ?? null as never) : (null as never);
    }
  });

  const margin = (p: number) => <span className={cn("font-semibold tabular-nums", p < 0 ? "text-rose-600" : "text-emerald-600")}>{p}%</span>;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Editorial header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-300 font-serif text-sm font-bold text-amber-900">09</span>
          <h1 className="font-serif text-2xl font-bold tracking-tight md:text-3xl">Unit Economics, the granular view</h1>
        </div>
        <span className="hidden text-[11px] font-bold uppercase tracking-widest text-amber-700 sm:block">Finance for founders</span>
      </div>

      {/* Concept pillars */}
      <div className="space-y-2.5">
        {CONCEPTS.map((c) => (
          <div key={c.n} className="flex items-start gap-3 rounded-2xl border border-border/50 bg-card p-4 shadow-card">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-300 font-serif text-xs font-bold text-amber-900">{c.n}</span>
            <div>
              <p className="font-serif text-lg font-bold leading-tight">{c.title}</p>
              <p className="text-[13px] text-muted-foreground">{c.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Period + totals */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Contribution margin — {data?.period.label ?? range.label}</h2>
        <div className="inline-flex items-center gap-1 rounded-xl border bg-card p-0.5 shadow-card">
          <button type="button" onClick={() => setOffset((o) => o - 1)} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 text-[13px] font-medium">{range.label}</span>
          <button type="button" onClick={() => setOffset((o) => Math.min(o + 1, 0))} disabled={offset >= 0} className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-40" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BentoCard interactive={false}><Metric label="Revenue" value={format(data?.totals.revenue ?? 0)} /></BentoCard>
        <BentoCard interactive={false}><Metric label="Variable cost" value={format(data?.totals.cost ?? 0)} /></BentoCard>
        <BentoCard interactive={false}><Metric label="Contribution" value={format(data?.totals.contribution ?? 0)} /></BentoCard>
        <BentoCard interactive={false}><Metric label="Contribution margin" value={`${data?.totals.marginPct ?? 0}%`} /></BentoCard>
      </div>

      {/* 80/20 callouts */}
      <div className="grid gap-4 md:grid-cols-2">
        {([["Products", data?.pareto.products], ["Customers", data?.pareto.customers]] as const).map(([label, p]) => (
          <BentoCard key={label} interactive={false} tone="amber">
            <p className="text-[12px] font-medium text-muted-foreground">80/20 — {label}</p>
            {p && p.count > 0 ? (
              <p className="mt-1 text-[15px]">
                <span className="text-2xl font-bold tabular-nums">{p.eighty}</span> of {p.count} {label.toLowerCase()} <span className="font-semibold">({p.share}%)</span> drive <span className="font-semibold">80%</span> of contribution.
              </p>
            ) : <p className="mt-1 text-sm text-muted-foreground">No data for this month.</p>}
          </BentoCard>
        ))}
      </div>

      {/* Top 10 products */}
      <Table title="Top 10 products by contribution" rows={data?.products ?? []} format={format} margin={margin} showQty />
      {/* Top 10 customers */}
      <Table title="Top 10 customers by contribution" rows={data?.customers ?? []} format={format} margin={margin} />

      <p className="text-[13px] font-semibold text-muted-foreground">Calculate contribution margin on your top 10 products and top 10 customers this month.</p>
    </div>
  );
}

function Table({ title, rows, format, margin, showQty }: { title: string; rows: Line[]; format: (n: number) => string; margin: (p: number) => React.ReactNode; showQty?: boolean }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-card">
      <div className="border-b px-5 py-3"><h3 className="text-[15px] font-semibold">{title}</h3></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-2.5 text-left font-medium">#</th>
              <th className="px-5 py-2.5 text-left font-medium">Name</th>
              {showQty ? <th className="px-5 py-2.5 text-right font-medium">Qty</th> : null}
              <th className="px-5 py-2.5 text-right font-medium">Revenue</th>
              <th className="px-5 py-2.5 text-right font-medium">Cost</th>
              <th className="px-5 py-2.5 text-right font-medium">Contribution</th>
              <th className="px-5 py-2.5 text-right font-medium">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={showQty ? 7 : 6} className="px-5 py-8 text-center text-muted-foreground">No sales in this period.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.name + i} className="border-t border-border/40 hover:bg-indigo-50/40">
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{i + 1}</td>
                <td className="px-5 py-3 font-medium">{r.name}</td>
                {showQty ? <td className="px-5 py-3 text-right tabular-nums">{r.qty}</td> : null}
                <td className="px-5 py-3 text-right tabular-nums">{format(r.revenue)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{format(r.cost)}</td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums">{format(r.contribution)}</td>
                <td className="px-5 py-3 text-right">{margin(r.marginPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
