"use client";

import Link from "next/link";
import { ArrowRight, Calendar, Sparkles } from "lucide-react";
import { useHasMounted } from "@/hooks/use-has-mounted";

interface Props {
  rangeDescription: string;
  ownerLabel: string | null;
  pipelineDisplay: string;
  weightedDisplay: string;
  wonDisplay: string;
  tasksDueToday: number;
  followUpsToday: number;
}

export function DashboardHero({
  rangeDescription,
  ownerLabel,
  pipelineDisplay,
  weightedDisplay,
  wonDisplay,
  tasksDueToday,
  followUpsToday,
}: Props) {
  const mounted = useHasMounted();
  const greeting = mounted
    ? (() => {
        const hour = new Date().getHours();
        return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      })()
    : "Welcome back";

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-accent-600 via-accent-700 to-violet-800 p-5 text-white shadow-lg sm:p-6 dark:border-slate-700">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-white/70">
            <Sparkles size={14} /> CRM command center
          </p>
          <h1
            className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl"
            suppressHydrationWarning
          >
            {greeting}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/85">
            <Calendar size={14} className="shrink-0" />
            <span>{rangeDescription}</span>
            {ownerLabel ? (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{ownerLabel}</span>
            ) : (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">All owners</span>
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
          <HeroStat label="Open pipeline" value={pipelineDisplay} />
          <HeroStat label="Weighted forecast" value={weightedDisplay} />
          <HeroStat label="Won revenue" value={wonDisplay} sub="in period" />
          <HeroStat
            label="Due today"
            value={String(tasksDueToday + followUpsToday)}
            sub={`${tasksDueToday} tasks · ${followUpsToday} follow-ups`}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <QuickLink href="/leads" label="Leads" />
        <QuickLink href="/opportunities" label="Opportunities" />
        <QuickLink href="/tasks" label="Tasks" />
        <QuickLink href="/activities" label="Activities" />
      </div>
    </section>
  );
}

function HeroStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-base">{value}</p>
      {sub ? <p className="text-[10px] text-white/65">{sub}</p> : null}
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/25"
    >
      {label}
      <ArrowRight size={12} />
    </Link>
  );
}
