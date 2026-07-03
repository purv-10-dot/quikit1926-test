"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Bento grid — a 12-column responsive canvas; children set their own col-span. */
export function Bento({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-12", className)}>{children}</div>;
}

type BentoCardProps = {
  children: React.ReactNode;
  className?: string;
  /** Tailwind col-span classes, e.g. "lg:col-span-4". */
  span?: string;
  href?: string;
  onClick?: () => void;
  tone?: "default" | "indigo" | "emerald" | "amber" | "red";
  /** Lift + ring on hover (default true). */
  interactive?: boolean;
};

const toneRing: Record<string, string> = {
  default: "",
  indigo: "before:from-indigo-500/10",
  emerald: "before:from-emerald-500/10",
  amber: "before:from-amber-500/10",
  red: "before:from-rose-500/10"
};

/** The core surface: rounded, almost border-less, soft shadow, smooth hover-lift. */
export function BentoCard({ children, className, span, href, onClick, tone = "default", interactive = true }: BentoCardProps) {
  const base = cn(
    "group relative flex flex-col overflow-hidden rounded-3xl border border-border/50 bg-card p-5 shadow-card text-left",
    "before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-br before:to-transparent before:opacity-0 before:transition-opacity before:duration-300",
    tone !== "default" && toneRing[tone],
    (interactive || onClick) && "transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-border hover:shadow-popover hover:before:opacity-100",
    onClick && "cursor-pointer",
    span,
    className
  );
  if (href) {
    return (
      <Link href={href} className={base}>
        {children}
        <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base}>
        {children}
        <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }
  return <div className={base}>{children}</div>;
}

/** A label → big value block with optional delta pill and sublabel. */
export function Metric({ label, value, sub, delta, icon: Icon, accent }: {
  label: string; value: string; sub?: string; delta?: { value: string; dir: "up" | "down" | "flat" }; icon?: React.ComponentType<{ className?: string }>; accent?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
        {Icon ? <Icon className={cn("h-4 w-4", accent)} /> : null}
        {label}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-[26px] font-bold leading-none tracking-tight tabular-nums">{value}</span>
        {delta ? <DeltaPill dir={delta.dir}>{delta.value}</DeltaPill> : null}
      </div>
      {sub ? <p className="text-[12px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function DeltaPill({ children, dir }: { children: React.ReactNode; dir: "up" | "down" | "flat" }) {
  const cls = dir === "up" ? "bg-emerald-50 text-emerald-700" : dir === "down" ? "bg-rose-50 text-rose-600" : "bg-muted text-muted-foreground";
  return <span className={cn("mb-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold", cls)}>{children}</span>;
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "emerald" | "amber" | "red" | "indigo" }) {
  const map = {
    neutral: "bg-muted text-muted-foreground",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-rose-50 text-rose-600",
    indigo: "bg-indigo-50 text-indigo-700"
  } as const;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", map[tone])}>{children}</span>;
}

/** Circular score ring (Business Health). */
export function HealthRing({ score, size = 92 }: { score: number; size?: number }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const stroke = pct >= 75 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stroke} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums">{Math.round(pct)}</span>
        <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">score</span>
      </div>
    </div>
  );
}

/** Tiny gradient sparkline area for trend cards. */
export function MiniArea({ data, color = "hsl(var(--primary))", height = 48 }: { data: number[]; color?: string; height?: number }) {
  // recharts' ResponsiveContainer measures the DOM, so it renders nothing on the
  // server and the chart on the client → React hydration mismatch. Render it only
  // after mount; the server + first client render show a matching empty box.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const series = data.map((v, i) => ({ i, v }));
  const id = `ma-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div style={{ height }} className="w-full">
      {mounted && (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
