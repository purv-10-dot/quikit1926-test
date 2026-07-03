"use client";

import Link from "next/link";
import {
  Wallet, TrendingUp, TrendingDown, Receipt, AlertTriangle, Sparkles, ArrowRight,
  FilePlus2, CreditCard, UserPlus, Upload, Landmark, ShieldCheck, CalendarClock
} from "lucide-react";
import { useState, useEffect } from "react";
import { Bento, BentoCard, Metric, HealthRing, MiniArea, Pill, DeltaPill } from "@/components/design/bento";
import { HealthBreakdown } from "@/components/dashboard/HealthBreakdown";
import { useDashboard } from "@/lib/hooks/useDashboard";
import { useCurrency } from "@/lib/currency";
import { useAiDock } from "@/lib/stores/ai-dock";
import { cn } from "@/lib/utils/cn";

function deriveDir(change: string): "up" | "down" | "flat" {
  if (/^\+|\bup\b|increase/i.test(change)) return "up";
  if (/^[-−]|\bdown\b|decrease|overdue|due/i.test(change)) return "down";
  return "flat";
}

/** Days until the next GST return deadline (GSTR-3B, 20th of next month). */
function nextGstDeadline(now: Date): { label: string; days: number } {
  let due = new Date(now.getFullYear(), now.getMonth(), 20);
  if (now.getDate() > 20) due = new Date(now.getFullYear(), now.getMonth() + 1, 20);
  const days = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  return { label: due.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), days };
}

export function CommandCenter() {
  const { data } = useDashboard();
  const { format, formatCompact } = useCurrency();
  const openDock = useAiDock((s) => s.openDock);
  const [healthOpen, setHealthOpen] = useState(false);
  // Date-derived UI must be computed AFTER mount: `new Date()` differs between
  // the server (its TZ/clock) and the browser, which causes a React hydration
  // mismatch. Server + first client render show a neutral placeholder; the real
  // date fills in post-hydration.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const kpi = (needle: string) => data.kpis.find((k) => k.label.toLowerCase().includes(needle));
  const cash = kpi("cash");
  const receivables = kpi("receivable");
  const payables = kpi("payable");
  const gst = kpi("gst");
  const overdue = kpi("overdue");
  const revenue = kpi("revenue");

  const cashValue = cash?.value ?? 0;
  const overdueCount = overdue?.value ?? 0;
  const cashSeries = data.cashFlow.map((c) => c.cash);
  const revSeries = data.revenueExpense.map((r) => r.revenue);

  // Business Health Score — a transparent heuristic over real signals.
  const health = (() => {
    let s = 100;
    if (overdueCount > 0) s -= Math.min(overdueCount * 5, 25);
    if ((payables?.value ?? 0) > cashValue) s -= 15;
    if (cashValue < 0) s -= 30;
    if ((receivables?.value ?? 0) > cashValue * 1.5) s -= 10;
    return Math.max(8, Math.min(100, s));
  })();
  const healthLabel = health >= 75 ? "Healthy" : health >= 50 ? "Watch" : "At risk";

  // AI risk alerts — derived from the same real data (no fabrication).
  const alerts: { text: string; tone: "red" | "amber" | "emerald" }[] = [];
  if (overdueCount > 0) alerts.push({ text: `${overdueCount} invoice${overdueCount > 1 ? "s" : ""} overdue — follow up to protect cash flow.`, tone: "red" });
  if ((payables?.value ?? 0) > 0) alerts.push({ text: `${format(payables!.value)} in payables outstanding — plan upcoming payments.`, tone: "amber" });
  if (cashValue < 0) alerts.push({ text: "Cash balance is negative — review spend and collections urgently.", tone: "red" });
  if (alerts.length === 0) alerts.push({ text: "No risks detected — your books look healthy today.", tone: "emerald" });

  const gstDue = now ? nextGstDeadline(now) : { label: "—", days: 0 };
  const today = now ? now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }) : "";

  const workQueue = [
    overdueCount > 0 && { label: `Follow up on ${overdueCount} overdue invoice${overdueCount > 1 ? "s" : ""}`, href: "/reports/aging", tone: "red" as const },
    (payables?.value ?? 0) > 0 && { label: `Review & pay ${format(payables!.value)} in bills`, href: "/payables", tone: "amber" as const },
    { label: `File GST (GSTR-3B) by ${gstDue.label}`, href: "/reports/gstr-3b", tone: "indigo" as const },
    { label: "Reconcile bank transactions", href: "/banking", tone: "neutral" as const }
  ].filter(Boolean) as { label: string; href: string; tone: "red" | "amber" | "indigo" | "neutral" }[];

  return (
    <div className="animate-fade-up space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{today}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Command Center</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => openDock()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-semibold shadow-card transition hover:-translate-y-0.5 hover:shadow-popover">
            <Sparkles className="h-4 w-4 text-indigo-500" />Ask AI
          </button>
          <Link href="/invoices/new" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-foreground px-4 text-sm font-semibold text-background shadow-sm transition hover:opacity-90">
            <FilePlus2 className="h-4 w-4" />New Invoice
          </Link>
        </div>
      </div>

      <Bento>
        {/* Cash position — hero */}
        <BentoCard span="col-span-2 lg:col-span-5" tone="indigo" href="/banking">
          <Metric label="Today's Cash Position" value={format(cashValue)} icon={Wallet} accent="text-indigo-500"
            delta={cash ? { value: cash.change, dir: deriveDir(cash.change) } : undefined} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-muted/50 p-3">
              <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" />Receivables</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{receivables ? format(receivables.value) : "—"}</p>
            </div>
            <div className="rounded-2xl bg-muted/50 p-3">
              <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"><TrendingDown className="h-3.5 w-3.5 text-rose-500" />Payables</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{payables ? format(payables.value) : "—"}</p>
            </div>
          </div>
          <div className="mt-auto pt-3"><MiniArea data={cashSeries.length ? cashSeries : [0, 0]} color="hsl(var(--primary))" /></div>
        </BentoCard>

        {/* Business health — click to break down by the six pillars */}
        <BentoCard span="col-span-1 lg:col-span-3" onClick={() => setHealthOpen(true)}>
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><ShieldCheck className="h-4 w-4" />Business Health</p>
          <div className="mt-2 flex items-center gap-4">
            <HealthRing score={health} />
            <div>
              <Pill tone={health >= 75 ? "emerald" : health >= 50 ? "amber" : "red"}>{healthLabel}</Pill>
              <p className="mt-2 text-[12px] text-muted-foreground">Tap to break down the six pillars for this financial year.</p>
            </div>
          </div>
        </BentoCard>

        {/* AI insights / risk */}
        <BentoCard span="col-span-1 lg:col-span-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><Sparkles className="h-4 w-4 text-indigo-500" />AI Risk Alerts</p>
          </div>
          <ul className="mt-2 space-y-2">
            {alerts.slice(0, 3).map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px]">
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", a.tone === "red" ? "bg-rose-500" : a.tone === "amber" ? "bg-amber-500" : "bg-emerald-500")} />
                <span className="leading-snug">{a.text}</span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => openDock("Why did my cash position change this month?")} className="mt-auto inline-flex items-center gap-1 pt-3 text-[12px] font-semibold text-indigo-600 hover:underline">
            Explain with AI <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </BentoCard>

        {/* Work queue */}
        <BentoCard span="col-span-2 lg:col-span-5">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><AlertTriangle className="h-4 w-4 text-amber-500" />Today&apos;s Work Queue</p>
          <ul className="mt-2 divide-y">
            {workQueue.map((w) => (
              <li key={w.label}>
                <Link href={w.href} className="group flex items-center justify-between gap-3 py-2.5 text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full", w.tone === "red" ? "bg-rose-500" : w.tone === "amber" ? "bg-amber-500" : w.tone === "indigo" ? "bg-indigo-500" : "bg-muted-foreground/40")} />
                    {w.label}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </BentoCard>

        {/* GST / Tax deadline */}
        <BentoCard span="col-span-1 lg:col-span-3" tone="amber" href="/reports/gstr-3b">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><CalendarClock className="h-4 w-4 text-amber-500" />Next GST Deadline</p>
          <p className="mt-2 text-2xl font-bold tracking-tight">{gstDue.days}d</p>
          <p className="text-[12px] text-muted-foreground">GSTR-3B due {gstDue.label}</p>
          {gst ? <p className="mt-auto pt-2 text-[13px] font-semibold">{format(gst.value)} <span className="font-normal text-muted-foreground">payable</span></p> : null}
        </BentoCard>

        {/* Revenue trend */}
        <BentoCard span="col-span-1 lg:col-span-4" href="/reports/profit-loss">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><TrendingUp className="h-4 w-4 text-emerald-500" />Revenue</p>
            {revenue ? <DeltaPill dir={deriveDir(revenue.change)}>{revenue.change}</DeltaPill> : null}
          </div>
          <p className="mt-1 text-[22px] font-bold tabular-nums">{revenue ? format(revenue.value) : formatCompact(revSeries.at(-1) ?? 0)}</p>
          <div className="mt-auto pt-2"><MiniArea data={revSeries.length ? revSeries : [0, 0]} color="#10b981" /></div>
        </BentoCard>

        {/* Recent activity */}
        <BentoCard span="col-span-2 lg:col-span-7" interactive={false}>
          <div className="mb-1 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><Receipt className="h-4 w-4" />Recent Activity</p>
            <Link href="/reports/day-book" className="text-[12px] font-medium text-indigo-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y">
            {data.feed.slice(0, 6).map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{f.label}</p>
                  <p className="text-[11px] text-muted-foreground">{f.date}</p>
                </div>
                <span className={cn("shrink-0 text-[13px] font-semibold tabular-nums", f.amount >= 0 ? "text-emerald-600" : "text-rose-500")}>
                  {f.amount >= 0 ? "+" : "−"}{format(Math.abs(f.amount))}
                </span>
              </div>
            ))}
            {data.feed.length === 0 ? <p className="py-6 text-center text-[13px] text-muted-foreground">No recent activity.</p> : null}
          </div>
        </BentoCard>

        {/* Quick actions */}
        <BentoCard span="col-span-2 lg:col-span-5" interactive={false}>
          <p className="mb-2 text-[12px] font-medium text-muted-foreground">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { href: "/invoices/new", label: "Create Invoice", icon: FilePlus2, tint: "text-indigo-500" },
              { href: "/payments/received", label: "Record Payment", icon: Wallet, tint: "text-emerald-500" },
              { href: "/expenses/new", label: "Add Expense", icon: CreditCard, tint: "text-amber-500" },
              { href: "/customers/new", label: "New Customer", icon: UserPlus, tint: "text-sky-500" },
              { href: "/banking/import", label: "Import Statement", icon: Upload, tint: "text-violet-500" },
              { href: "/banking/accounts/new", label: "Add Bank", icon: Landmark, tint: "text-rose-500" }
            ].map((a) => (
              <Link key={a.href} href={a.href} className="group flex items-center gap-2.5 rounded-2xl border border-border/50 bg-muted/30 p-3 text-[13px] font-medium transition hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-card">
                <a.icon className={cn("h-4 w-4", a.tint)} />
                {a.label}
              </Link>
            ))}
          </div>
        </BentoCard>
      </Bento>

      <HealthBreakdown open={healthOpen} onClose={() => setHealthOpen(false)} />
    </div>
  );
}
