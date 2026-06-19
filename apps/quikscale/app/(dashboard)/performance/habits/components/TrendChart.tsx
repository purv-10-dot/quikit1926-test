"use client";

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useHabitTrends } from "@/lib/hooks/useHabits";

interface Props {
  highlightId?: string;
  onSelect?: (id: string) => void;
}

const CHART_W = 320;
const CHART_H = 140;
const PAD_X = 20;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const MAX_POINTS = 6;

/**
 * Quarter-over-quarter overall % line chart. SVG-based — uses the campaign
 * timeline as x-axis, agreement % as y-axis. The current campaign shows as
 * an emphasized dot with a tooltip pill; everything else is a thinner stroke
 * + smaller dot. RAG threshold guidelines are drawn faintly in the background
 * (80% strong, 60% OK) so the eye lands on whether each round is healthy.
 */
export function TrendChart({ highlightId, onSelect }: Props) {
  const { data, isLoading } = useHabitTrends();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const visible = useMemo(() => (data ?? []).slice(-MAX_POINTS), [data]);

  if (isLoading) {
    return (
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5 animate-pulse">
        <div className="h-3 w-32 bg-gray-100 rounded mb-3" />
        <div className="h-32 bg-gray-100 rounded" />
      </section>
    );
  }
  if (!visible.length) return null;

  const last = visible[visible.length - 1];
  const prev = visible.length > 1 ? visible[visible.length - 2] : null;
  const delta = prev ? last.overallPct - prev.overallPct : 0;
  const deltaPts = Math.round(delta * 100);

  const xStep = visible.length > 1 ? (CHART_W - PAD_X * 2) / (visible.length - 1) : 0;
  const yMax = 1;
  const yScale = (pct: number) => PAD_TOP + (1 - pct / yMax) * (CHART_H - PAD_TOP - PAD_BOTTOM);
  const xPos = (i: number) => PAD_X + i * xStep;

  const points = visible.map((p, i) => ({ x: xPos(i), y: yScale(p.overallPct), p }));
  const linePath = points
    .map((pt, i) => (i === 0 ? `M${pt.x},${pt.y}` : `L${pt.x},${pt.y}`))
    .join(" ");
  const areaPath = `${linePath} L${points[points.length - 1]?.x ?? 0},${CHART_H - PAD_BOTTOM} L${points[0]?.x ?? 0},${CHART_H - PAD_BOTTOM} Z`;

  const highlightIdx = visible.findIndex((p) => p.id === highlightId);
  const showIdx = hoverIdx ?? (highlightIdx >= 0 ? highlightIdx : null);

  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5">
      <header className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 tracking-tight">Quarterly trend</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Overall % across last {visible.length} {visible.length === 1 ? "campaign" : "campaigns"}
          </p>
        </div>
        {prev && (
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
              delta > 0.005
                ? "bg-green-50 border-green-200 text-green-700"
                : delta < -0.005
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-gray-50 border-gray-200 text-gray-600"
            }`}
          >
            <DeltaIcon delta={delta} />
            <span className="text-[11px] font-semibold tabular-nums">
              {delta > 0 ? "+" : ""}
              {deltaPts} pts vs prev
            </span>
          </div>
        )}
      </header>

      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full h-auto"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="habitTrendArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(59,130,246)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="rgb(59,130,246)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <rect
            x={PAD_X}
            y={yScale(1)}
            width={CHART_W - PAD_X * 2}
            height={yScale(0.8) - yScale(1)}
            className="fill-green-50/70"
          />
          <rect
            x={PAD_X}
            y={yScale(0.8)}
            width={CHART_W - PAD_X * 2}
            height={yScale(0.6) - yScale(0.8)}
            className="fill-amber-50/40"
          />

          {[0, 0.5, 1].map((tick) => (
            <g key={tick}>
              <line
                x1={PAD_X}
                x2={CHART_W - PAD_X}
                y1={yScale(tick)}
                y2={yScale(tick)}
                className="stroke-gray-200"
                strokeDasharray="2 3"
                strokeWidth="0.5"
              />
              <text
                x={PAD_X - 4}
                y={yScale(tick) + 3}
                textAnchor="end"
                className="fill-gray-400 text-[8px]"
              >
                {Math.round(tick * 100)}
              </text>
            </g>
          ))}

          {visible.length > 1 && <path d={areaPath} fill="url(#habitTrendArea)" />}
          {visible.length > 1 && (
            <path
              d={linePath}
              fill="none"
              className="stroke-blue-500"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.map((pt, i) => {
            const isHL = i === showIdx;
            const isCurrent = visible[i].id === highlightId;
            return (
              <g
                key={visible[i].id}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onClick={() => onSelect?.(visible[i].id)}
                className="cursor-pointer"
              >
                <rect
                  x={pt.x - xStep / 2}
                  y={0}
                  width={Math.max(1, xStep)}
                  height={CHART_H}
                  fill="transparent"
                />
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHL ? 5 : isCurrent ? 4 : 3}
                  className={
                    isHL || isCurrent ? "fill-white stroke-blue-600" : "fill-white stroke-blue-400"
                  }
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>

        {showIdx !== null && points[showIdx] && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${(points[showIdx].x / CHART_W) * 100}%`,
              top: `${(points[showIdx].y / CHART_H) * 100}%`,
              transform: "translate(-50%, calc(-100% - 8px))",
            }}
          >
            <div className="bg-gray-900 text-white text-[10px] font-semibold px-2 py-1 rounded shadow-md whitespace-nowrap tabular-nums">
              {Math.round(visible[showIdx].overallPct * 100)}%
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between px-2 mt-1 text-[10px] tabular-nums">
        {visible.map((p, i) => {
          const isCurrent = p.id === highlightId;
          return (
            <button
              key={p.id}
              onClick={() => onSelect?.(p.id)}
              className={`truncate flex-1 min-w-0 transition-colors ${
                isCurrent ? "text-gray-900 font-semibold" : "text-gray-400 hover:text-gray-700"
              }`}
              title={p.label}
              style={{ textAlign: i === 0 ? "left" : i === visible.length - 1 ? "right" : "center" }}
            >
              {compactLabel(p.label)}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
        <LegendDot color="bg-green-500" label="≥80% Strong" />
        <LegendDot color="bg-amber-400" label="60–79% OK" />
        <LegendDot color="bg-red-400"   label="<60% Risk" />
      </div>
    </section>
  );
}

function compactLabel(label: string): string {
  // "Q3 2025" → "Q3 25"; "Q1 2026 · R2" → "Q1 26·R2"
  return label
    .replace(/(\d{2})(\d{2})/, "$2")
    .replace(/ · R/, "·R")
    .replace(/ /g, " ");
}

function DeltaIcon({ delta }: { delta: number }) {
  if (delta > 0.005) return <TrendingUp className="h-3.5 w-3.5" />;
  if (delta < -0.005) return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
