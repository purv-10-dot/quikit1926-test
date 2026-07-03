"use client";

import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/* ------------------------------ Sparkline ------------------------------ */
export function Sparkline({ data, color = "currentColor", className }: { data: number[]; color?: string; className?: string }) {
  if (!data || data.length < 2) return null;
  const w = 72, h = 28, min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const id = `sg-${Math.abs(data.reduce((a, b) => a + b, 0)).toString(36)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-7 w-[72px]", className)} preserveAspectRatio="none" style={{ color }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------ Stat tile ------------------------------ */
export function StatTile({ label, value, change, tone, spark, sparkColor }: {
  label: string; value: string; change: string; tone: "good" | "warn" | "neutral"; spark?: number[]; sparkColor?: string;
}) {
  const Icon = tone === "good" ? ArrowUpRight : tone === "warn" ? ArrowDownRight : Minus;
  const toneClass = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-rose-500" : "text-muted-foreground";
  return (
    <div className="rounded-2xl border bg-card p-3.5 shadow-card transition-shadow hover:shadow-md">
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-[22px] font-bold leading-none tracking-tight tabular-nums">{value}</p>
        {spark ? <Sparkline data={spark} color={sparkColor ?? "hsl(var(--primary))"} /> : null}
      </div>
      <div className={cn("mt-2 inline-flex items-center gap-1 text-[11px] font-semibold", toneClass)}>
        <Icon className="h-3.5 w-3.5" />{change}
      </div>
    </div>
  );
}

/* ----------------------------- Action tile ----------------------------- */
const TINTS: Record<string, { bg: string; icon: string; text: string }> = {
  sky: { bg: "bg-sky-50 hover:bg-sky-100/70 border-sky-100", icon: "bg-sky-500/15 text-sky-600", text: "text-sky-700" },
  violet: { bg: "bg-violet-50 hover:bg-violet-100/70 border-violet-100", icon: "bg-violet-500/15 text-violet-600", text: "text-violet-700" },
  amber: { bg: "bg-amber-50 hover:bg-amber-100/70 border-amber-100", icon: "bg-amber-500/15 text-amber-600", text: "text-amber-700" },
  emerald: { bg: "bg-emerald-50 hover:bg-emerald-100/70 border-emerald-100", icon: "bg-emerald-500/15 text-emerald-600", text: "text-emerald-700" }
};

export function ActionTile({ href, title, subtitle, icon: Icon, tint }: {
  href: string; title: string; subtitle: string; icon: React.ComponentType<{ className?: string }>; tint: keyof typeof TINTS;
}) {
  const t = TINTS[tint];
  return (
    <Link href={href} className={cn("group flex items-center gap-3 rounded-2xl border p-3 transition-colors", t.bg)}>
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", t.icon)}><Icon className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-foreground">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <ArrowUpRight className={cn("h-4 w-4 shrink-0 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100", t.text)} />
    </Link>
  );
}

/* --------------------------- Mini aging bars --------------------------- */
export function MiniBars({ data, format }: { data: { name: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const palette = ["bg-emerald-400", "bg-amber-400", "bg-orange-400", "bg-rose-400"];
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={d.name} className="flex items-center gap-3 text-xs">
          <span className="w-14 shrink-0 text-muted-foreground">{d.name}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", palette[i % palette.length])} style={{ width: `${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 0)}%` }} />
          </div>
          <span className="w-20 shrink-0 text-right font-medium tabular-nums">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
