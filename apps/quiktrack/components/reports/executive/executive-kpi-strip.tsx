"use client";

import { Gauge, CheckCircle2, Activity, Clock, ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { ExecutiveReportData } from "./types";

interface Props {
  data: ExecutiveReportData;
}

export function ExecutiveKpiStrip({ data }: Props) {
  const s = data.summary;
  const wow = data.weekOverWeek;
  // All KPI deltas are now strictly week-over-week — last week of the range
  // vs the week before. When the range has fewer than 2 ISO weeks, the delta
  // collapses to null and the card shows "—".
  const deltaLabel = wow.available && wow.thisWeekLabel && wow.lastWeekLabel
    ? `${wow.thisWeekLabel} vs ${wow.lastWeekLabel}`
    : "Not enough data";

  const cards: Card[] = [
    {
      label: "Overall Productivity",
      value: `${s.productivity}%`,
      delta: wow.available ? wow.delta.productivity : null,
      deltaSuffix: "%",
      deltaLabel,
      icon: <Gauge className="h-5 w-5" />,
      tone: "violet",
      sparkValues: data.series.productivity,
      sparkColor: "#8b5cf6",
      higherIsBetter: true,
    },
    {
      label: "Tasks Completed",
      value: formatThousand(s.totalClosed),
      delta: wow.available ? wow.delta.closedPct : null,
      deltaSuffix: "%",
      deltaLabel,
      icon: <CheckCircle2 className="h-5 w-5" />,
      tone: "blue",
      sparkValues: data.series.closed,
      sparkColor: "#3b82f6",
      higherIsBetter: true,
    },
    {
      label: "Avg Velocity",
      value: `${s.velocity}`,
      hint: "tasks / week",
      // Velocity is a "tasks per week" rate — the most honest WoW signal is
      // the raw closed-count delta between the two weeks.
      delta: wow.available ? wow.delta.closedAbs : null,
      deltaSuffix: " tasks",
      deltaLabel,
      icon: <Activity className="h-5 w-5" />,
      tone: "emerald",
      sparkValues: data.series.closed,
      sparkColor: "#10b981",
      higherIsBetter: true,
    },
    {
      label: "Delayed Tasks",
      value: `${s.delayedPct}%`,
      delta: wow.available ? wow.delta.delayedPct : null,
      deltaSuffix: "%",
      deltaLabel,
      icon: <Clock className="h-5 w-5" />,
      tone: "orange",
      sparkValues: data.series.slipped,
      sparkColor: "#f97316",
      higherIsBetter: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((c) => (
        <KpiCell key={c.label} card={c} />
      ))}
    </div>
  );
}

type Tone = "violet" | "blue" | "emerald" | "orange";

interface Card {
  label: string;
  value: string;
  hint?: string;
  delta: number | null;
  /** Suffix appended to the delta number (e.g. "%", " tasks"). */
  deltaSuffix: string;
  deltaLabel: string;
  icon: React.ReactNode;
  tone: Tone;
  sparkValues: number[];
  sparkColor: string;
  /** Up arrow is good when true, bad when false. */
  higherIsBetter: boolean;
}

const TONE_STYLES: Record<Tone, { iconBg: string; iconText: string; valueText: string }> = {
  violet: {
    iconBg: "bg-violet-100 dark:bg-violet-500/10",
    iconText: "text-violet-600 dark:text-violet-400",
    valueText: "text-violet-600 dark:text-violet-400",
  },
  blue: {
    iconBg: "bg-blue-100 dark:bg-blue-500/10",
    iconText: "text-blue-600 dark:text-blue-400",
    valueText: "text-blue-600 dark:text-blue-400",
  },
  emerald: {
    iconBg: "bg-emerald-100 dark:bg-emerald-500/10",
    iconText: "text-emerald-600 dark:text-emerald-400",
    valueText: "text-emerald-600 dark:text-emerald-400",
  },
  orange: {
    iconBg: "bg-orange-100 dark:bg-orange-500/10",
    iconText: "text-orange-600 dark:text-orange-400",
    valueText: "text-orange-600 dark:text-orange-400",
  },
};

function KpiCell({ card }: { card: Card }) {
  const styles = TONE_STYLES[card.tone];
  // delta tone: zero is neutral (gray), positive/negative scored by direction.
  const deltaTone: "good" | "bad" | "neutral" =
    card.delta === null
      ? "neutral"
      : card.delta === 0
      ? "neutral"
      : (card.higherIsBetter ? card.delta > 0 : card.delta < 0)
      ? "good"
      : "bad";
  const deltaToneClass =
    deltaTone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : deltaTone === "bad"
      ? "text-red-600 dark:text-red-400"
      : "text-gray-500 dark:text-gray-400";
  const DeltaIcon =
    card.delta === null || card.delta === 0
      ? Minus
      : card.delta > 0
      ? ArrowUp
      : ArrowDown;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-lg transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px] font-medium text-gray-600 dark:text-gray-400">
          {card.label}
          <span className="inline-flex w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 text-[10px] items-center justify-center cursor-help">i</span>
        </div>
        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${styles.iconBg} ${styles.iconText}`}>
          {card.icon}
        </span>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <div className={`text-3xl font-bold tabular-nums ${styles.valueText}`}>{card.value}</div>
        {card.hint && (
          <div className="text-xs text-gray-500 dark:text-gray-400 pb-1">{card.hint}</div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {card.delta !== null ? (
          <div className={`inline-flex items-center gap-1 text-xs font-medium ${deltaToneClass}`}>
            <DeltaIcon className="h-3 w-3" />
            <span>
              {Math.abs(card.delta)}
              {card.deltaSuffix}
            </span>
            <span className="text-gray-400 dark:text-gray-500 font-normal">{card.deltaLabel}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {card.deltaLabel}
          </span>
        )}
        <Sparkline values={card.sparkValues} color={card.sparkColor} />
      </div>
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 80;
  const h = 30;
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const step = w / (values.length - 1);
  const norm = (v: number) => h - ((v - min) / Math.max(1, max - min)) * h;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${norm(v).toFixed(1)}`);
  const polyline = points.join(" ");
  const area = `0,${h} ${polyline} ${w},${h}`;
  const gradientId = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={w} height={h} className="shrink-0">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

function formatThousand(n: number): string {
  return n.toLocaleString("en-US");
}
