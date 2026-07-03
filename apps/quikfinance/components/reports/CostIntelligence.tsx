"use client";

import { useQuery } from "@tanstack/react-query";
import { BentoCard, Metric } from "@/components/design/bento";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type Scenario = { drop: number; revenue: number; variableCost: number; fixedCost: number; profit: number };
type Data = {
  period: { label: string };
  revenue: number; variableCost: number; fixedCost: number; contribution: number; cmRatio: number; operatingProfit: number;
  breakEven: number | null; marginOfSafety: number | null; dol: number | null; fixedShare: number;
  scenarios: Scenario[];
  fixedBreakdown: { name: string; amount: number }[];
  risk: { level: string; label: string; note: string };
  downturnProfit: number;
};

export function CostIntelligence() {
  const { format } = useCurrency();
  const { data } = useQuery<Data | null>({
    queryKey: ["cost-intelligence"],
    queryFn: async () => {
      const r = await fetch("/api/v1/reports/cost-intelligence");
      return r.ok ? (((await r.json()) as { data?: Data }).data ?? null) : null;
    }
  });

  const money = (v: number) => <span className={cn("tabular-nums", v < 0 && "text-rose-600")}>{format(v)}</span>;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Editorial header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-300 font-serif text-sm font-bold text-amber-900">11</span>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Cost Intelligence</h1>
        </div>
        <span className="hidden text-[11px] font-bold uppercase tracking-widest text-amber-700 sm:block">Finance for founders</span>
      </div>
      <h2 className="font-serif text-3xl font-bold tracking-tight md:text-4xl">Which costs will hurt me if sales fall 20%?</h2>

      {/* Key metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BentoCard interactive={false}><Metric label="Fixed costs (per year)" value={format(data?.fixedCost ?? 0)} sub={`${data?.fixedShare ?? 0}% of total cost`} /></BentoCard>
        <BentoCard interactive={false}><Metric label="Variable costs" value={format(data?.variableCost ?? 0)} sub="Scale with sales" /></BentoCard>
        <BentoCard interactive={false}><Metric label="Break-even revenue" value={data?.breakEven != null ? format(data.breakEven) : "—"} sub={`Contribution margin ${data?.cmRatio ?? 0}%`} /></BentoCard>
        <BentoCard interactive={false}><Metric label="Margin of safety" value={data?.marginOfSafety != null ? `${data.marginOfSafety}%` : "—"} sub="Sales can fall this much before a loss" /></BentoCard>
      </div>

      {/* Downturn simulation */}
      <div className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-card">
        <div className="border-b px-5 py-3"><h3 className="text-[15px] font-semibold">If sales fall… (this year)</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-[#0f172a] text-white">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Indicator</th>
                {(data?.scenarios ?? []).map((s) => (
                  <th key={s.drop} className={cn("px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide", s.drop === 20 && "text-amber-300")}>
                    {s.drop === 0 ? "Today" : `−${s.drop}%`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Revenue", get: (s: Scenario) => s.revenue },
                { label: "Variable cost", get: (s: Scenario) => -s.variableCost },
                { label: "Fixed cost", get: (s: Scenario) => -s.fixedCost },
                { label: "Profit / Loss", get: (s: Scenario) => s.profit, bold: true }
              ].map((row) => (
                <tr key={row.label} className={cn("border-t border-border/40", row.bold && "bg-muted/30 font-bold")}>
                  <td className="px-5 py-3 font-medium">{row.label}</td>
                  {(data?.scenarios ?? []).map((s) => (
                    <td key={s.drop} className={cn("px-5 py-3 text-right", s.drop === 20 && "bg-amber-50")}>{money(row.get(s))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[12px] text-muted-foreground">Variable costs fall with sales; fixed costs stay. The gap between the two profit columns is the damage your fixed costs do in a downturn.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,360px)]">
        {/* Fixed cost breakdown */}
        <div className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-card">
          <div className="border-b px-5 py-3"><h3 className="text-[15px] font-semibold">Your fixed costs</h3></div>
          <div className="divide-y">
            {(data?.fixedBreakdown ?? []).length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No fixed costs recorded this year.</p>
            ) : data!.fixedBreakdown.map((f) => (
              <div key={f.name} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-medium">{f.name}</span>
                <span className="tabular-nums">{format(f.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Lesson / verdict */}
        <div className="flex flex-col justify-between gap-4 rounded-3xl bg-[#0f172a] p-6 text-white shadow-popover">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Lesson</p>
            <p className="mt-2 font-serif text-xl font-bold leading-snug">High fixed cost equals high risk.</p>
            <p className="mt-3 text-[13px] leading-relaxed text-white/80">{data?.risk.note}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/60">Verdict</p>
            <p className="text-base font-semibold">{data?.risk.label ?? "—"}</p>
            {data?.dol != null ? <p className="mt-1 text-[12px] text-white/70">Operating leverage {data.dol}× — every 1% sales change swings profit ~{data.dol}%.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
