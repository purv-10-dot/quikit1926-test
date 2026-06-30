"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/skeleton";

/** KPI tile — the building block for portal dashboards. */
export function Kpi({ label, value, sub, icon: Icon, tone = "default", loading }: {
  label: string; value: ReactNode; sub?: ReactNode; icon?: LucideIcon;
  tone?: "default" | "emerald" | "amber" | "rose" | "indigo"; loading?: boolean;
}) {
  const toneCls = {
    default: "text-foreground", emerald: "text-emerald-600", amber: "text-amber-600", rose: "text-rose-600", indigo: "text-indigo-600"
  }[tone];
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        {Icon ? <Icon className={cn("h-4 w-4", toneCls)} /> : null}
      </div>
      {loading ? <Skeleton className="mt-2 h-8 w-24" /> : <p className={cn("mt-2 text-2xl font-bold tabular-nums", toneCls)}>{value}</p>}
      {sub ? <p className="mt-1 text-[12px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/** Card with a header, optional "view all" link, and a body. */
export function WidgetCard({ title, href, action, children, className }: {
  title: string; href?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={cn("flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card", className)}>
      <header className="flex items-center justify-between border-b px-5 py-3">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {action ?? (href ? <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">View all<ArrowRight className="h-3.5 w-3.5" /></Link> : null)}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export function SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon?: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {Icon ? <Icon className="h-8 w-8 text-muted-foreground/60" /> : null}
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function QuickActions({ actions }: { actions: { label: string; href?: string; onClick?: () => void; icon?: LucideIcon }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => {
        const Inner = (
          <span className="inline-flex items-center gap-2 rounded-xl border bg-card px-3.5 py-2 text-sm font-medium shadow-card transition hover:border-primary/40 hover:text-primary">
            {a.icon ? <a.icon className="h-4 w-4" /> : null}{a.label}
          </span>
        );
        return a.href ? <Link key={a.label} href={a.href}>{Inner}</Link> : <button key={a.label} onClick={a.onClick}>{Inner}</button>;
      })}
    </div>
  );
}

/** Vertical activity timeline. */
export function Timeline({ items }: { items: { title: string; meta?: string; time?: string; tone?: "default" | "emerald" | "amber" | "rose" }[] }) {
  const dot = { default: "bg-muted-foreground/40", emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500" };
  if (!items.length) return <EmptyState title="No recent activity" />;
  return (
    <ol className="space-y-0 px-5 py-2">
      {items.map((it, i) => (
        <li key={i} className="relative flex gap-3 pb-4 last:pb-2">
          {i < items.length - 1 ? <span className="absolute left-[5px] top-3 h-full w-px bg-border" /> : null}
          <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", dot[it.tone ?? "default"])} />
          <div className="min-w-0">
            <p className="text-sm font-medium">{it.title}</p>
            <p className="text-xs text-muted-foreground">{[it.meta, it.time].filter(Boolean).join(" · ")}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
