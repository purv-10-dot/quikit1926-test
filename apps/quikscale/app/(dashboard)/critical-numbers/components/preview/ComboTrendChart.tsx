"use client";

/**
 * Combo chart for one Critical Number: bars coloured by that period's health
 * tier (same `resolveTargetTier` + `TIER_HEX` as the card/table), with the
 * actual-value trend line overlaid and a real numeric y-axis (round gridlines
 * + labels up the left side, like the reference line-chart screenshot).
 * Scaling/line/marker technique lifted straight from
 * `performance/habits/components/TrendChart.tsx`; the bars, y-axis, and
 * dashed target guide are the new parts.
 *
 * Used by both the mock-data preview section AND the real
 * `CriticalNumberCard` — so `Props.record` is a minimal structural shape
 * (just the fields this component actually reads), not tied to
 * `MockCriticalNumber`. Both `MockCriticalNumber` and the real API's
 * `CriticalNumberRow` (mapped: `category?.name` → `categoryName`, `updates`
 * → `history`) satisfy it without a wrapper type.
 */

import { useMemo, useState } from "react";
import { resolveTargetTier, CRITICAL_TIER_LABELS, type CriticalTier } from "@/lib/utils/criticalNumberTiers";
import { TIER_HEX, TIER_UNKNOWN } from "../tierPalette";
import type { CriticalNumberFrequency } from "@/lib/schemas/criticalNumberSchema";

const CHART_W = 560;
const CHART_H = 240;
/**
 * Minimum y-axis gutter. The ACTUAL gutter is computed per-render from the
 * widest tick label (see `PAD_LEFT` below) — this fixed 40 used to be the whole
 * story, which clipped the leading digit off any 7-figure value: a 1,000,000
 * target rendered its axis as "000000".
 */
const PAD_LEFT_MIN = 40;
/** Approx advance width of one digit at the labels' 9px tabular font. */
const AXIS_DIGIT_W = 5.5;
/** Breathing room between the label's right edge and the axis line. */
const AXIS_LABEL_GAP = 10;
const PAD_RIGHT = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;
const MAX_BAR_W = 32;

const FREQUENCY_LABELS: Record<CriticalNumberFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "dd MonthName yyyy" — spelled out manually rather than via `toLocaleString`
 *  so the day-month-year order is guaranteed regardless of runtime locale. */
function formatAxisDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Round axis max + step (0, 20, 40, 60… style), aiming for ~5-8 gridlines. */
function niceTicks(maxValue: number, targetCount = 5) {
  if (maxValue <= 0) return { ticks: [0], axisMax: 1 };
  const rawStep = maxValue / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const niceResidual = residual >= 7.5 ? 10 : residual >= 3.5 ? 5 : residual >= 1.5 ? 2 : 1;
  const step = niceResidual * magnitude;
  const axisMax = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= axisMax + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return { ticks, axisMax };
}

export interface ComboTrendChartRecord {
  title: string;
  categoryName: string;
  frequency: CriticalNumberFrequency;
  targetValue: number;
  /** Oldest-first. */
  history: { date: string; value: number }[];
}

interface Props {
  record: ComboTrendChartRecord;
  /** Hides the title/category line and the card's own border/shadow/padding
   *  — for embedding inside a card that already shows the title (e.g.
   *  `CriticalNumberCard`'s "Trend" section). Standalone usage is unaffected. */
  compact?: boolean;
}

export function ComboTrendChart({ record, compact = false }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const points = useMemo(
    () =>
      record.history.map((h) => ({
        ...h,
        tier: resolveTargetTier({ currentValue: h.value, targetValue: record.targetValue }).tier,
      })),
    [record.history, record.targetValue],
  );

  if (points.length < 2) return null;

  const rawMax = Math.max(record.targetValue, ...points.map((p) => p.value));
  const { ticks, axisMax } = niceTicks(rawMax);

  // Widen the gutter to whatever the longest tick label actually needs, so large
  // values (lakhs/crores of rupees) aren't cut off at the left edge.
  const widestTickChars = Math.max(...ticks.map((t) => String(t).length));
  const PAD_LEFT = Math.max(PAD_LEFT_MIN, widestTickChars * AXIS_DIGIT_W + AXIS_LABEL_GAP);

  // Bars are centered on their tick position, so the plotted x-range has to
  // be inset by half a bar's width on each side — otherwise the first/last
  // bar's centre sits exactly ON the padding boundary and half the bar
  // bleeds into the y-axis label margin (the actual cause of the overlap).
  const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const barWidth = Math.min(MAX_BAR_W, (plotW / points.length) * 0.6);
  const innerLeft = PAD_LEFT + barWidth / 2;
  const innerRight = CHART_W - PAD_RIGHT - barWidth / 2;
  const xStep = points.length > 1 ? (innerRight - innerLeft) / (points.length - 1) : 0;
  const yScale = (v: number) => PAD_TOP + (1 - v / axisMax) * (CHART_H - PAD_TOP - PAD_BOTTOM);
  const xPos = (i: number) => innerLeft + i * xStep;
  const baseline = CHART_H - PAD_BOTTOM;

  const linePoints = points.map((p, i) => ({ x: xPos(i), y: yScale(p.value) }));
  const linePath = linePoints.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");
  const targetY = yScale(record.targetValue);

  // The target label sits at whichever end has more headroom above the
  // bars there, so it never lands under a tall bar — the actual cause of
  // the overlap, not just a z-order fight. A rising trend means the tall
  // bars are on the right, so the label goes left (and vice versa).
  const labelOnLeft = points[points.length - 1].value >= points[0].value;

  return (
    <section className={compact ? "" : "bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5"}>
      <header className={`flex items-center gap-3 mb-3 flex-wrap ${compact ? "justify-end" : "items-start justify-between"}`}>
        {!compact && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 tracking-tight">{record.title}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {record.categoryName} · value vs. target over time
            </p>
          </div>
        )}
        <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
          {(["great", "good", "concerned", "bad"] as CriticalTier[]).map((t) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: TIER_HEX[t] }} />
              {CRITICAL_TIER_LABELS[t]}
            </span>
          ))}
        </div>
      </header>

      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full h-auto"
          preserveAspectRatio="none"
        >
          {/* Y-axis — faint horizontal gridlines + numeric labels */}
          {ticks.map((t) => {
            const y = yScale(t);
            return (
              <g key={t}>
                <line
                  x1={PAD_LEFT}
                  x2={CHART_W - PAD_RIGHT}
                  y1={y}
                  y2={y}
                  className="stroke-gray-100"
                  strokeWidth="1"
                />
                <text x={PAD_LEFT - 8} y={y + 3} textAnchor="end" className="fill-gray-400 text-[9px] tabular-nums">
                  {t}
                </text>
              </g>
            );
          })}

          {/* Tier-coloured bars */}
          {points.map((p, i) => {
            const hex = p.tier ? TIER_HEX[p.tier] : TIER_UNKNOWN.hex;
            const y = yScale(p.value);
            return (
              <rect
                key={p.date}
                x={xPos(i) - barWidth / 2}
                y={y}
                width={barWidth}
                height={Math.max(0, baseline - y)}
                fill={hex}
                opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.45}
                rx={2}
              />
            );
          })}

          {/* Dashed target guide — painted after the bars so it's never
              hidden, and anchored to the low-value end so it's never
              covered by a bar there either. */}
          <line
            x1={PAD_LEFT}
            x2={CHART_W - PAD_RIGHT}
            y1={targetY}
            y2={targetY}
            className="stroke-gray-400"
            strokeDasharray="4 3"
            strokeWidth="1"
          />
          <text
            x={labelOnLeft ? PAD_LEFT + 4 : CHART_W - PAD_RIGHT}
            y={Math.max(10, targetY - 6)}
            textAnchor={labelOnLeft ? "start" : "end"}
            className="fill-gray-500 text-[9px] font-medium"
          >
            Target {record.targetValue}
          </text>

          {/* Trend line overlay */}
          <path d={linePath} fill="none" className="stroke-gray-900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {linePoints.map((pt, i) => (
            <g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
              <rect x={pt.x - xStep / 2} y={0} width={Math.max(1, xStep)} height={CHART_H} fill="transparent" />
              <circle cx={pt.x} cy={pt.y} r={hoverIdx === i ? 5 : 3.5} className="fill-white stroke-gray-900" strokeWidth="2" />
            </g>
          ))}

          {/* X-axis date labels — drawn in-SVG so they land exactly under
              their bar regardless of the asymmetric left padding. */}
          {points.map((p, i) => (
            <text
              key={p.date}
              x={xPos(i)}
              y={CHART_H - PAD_BOTTOM + 16}
              textAnchor="middle"
              className="fill-gray-400 text-[9px] tabular-nums"
            >
              {formatAxisDate(p.date)}
            </text>
          ))}
        </svg>

        {hoverIdx !== null && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${(linePoints[hoverIdx].x / CHART_W) * 100}%`,
              top: `${(linePoints[hoverIdx].y / CHART_H) * 100}%`,
              transform: "translate(-50%, calc(-100% - 8px))",
            }}
          >
            <div className="bg-gray-900 text-white text-[10px] font-semibold px-2 py-1 rounded shadow-md whitespace-nowrap tabular-nums">
              {points[hoverIdx].value} on {formatAxisDate(points[hoverIdx].date)}
            </div>
          </div>
        )}
      </div>

      {/* Cadence, right below the dates — so it's clear these points are
          weekly/monthly/quarterly, not read off the dates alone. */}
      <p className="text-center text-[10px] text-gray-400 mt-1">
        {FREQUENCY_LABELS[record.frequency]} updates
      </p>
    </section>
  );
}
