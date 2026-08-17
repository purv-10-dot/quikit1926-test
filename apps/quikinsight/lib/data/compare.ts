/**
 * Delta maths for period comparison.
 *
 * The one rule that matters: `null` means "no comparison was possible", and it
 * is never interchangeable with `0`, which means "genuinely unchanged". Every
 * function here preserves that distinction.
 */
import { isComparable } from "@/lib/period/capability";
import type { ComparisonAvailability } from "@/lib/period/types";

export interface Delta {
  /** Signed percentage change, or null when no baseline exists. */
  percent: number | null;
  direction: "up" | "down" | "flat" | null;
  availability: ComparisonAvailability;
  /** The baseline figure, kept so the UI can show "was 1,204". */
  previousValue: number | null;
}

export const NO_COMPARISON: Delta = {
  percent: null,
  direction: null,
  availability: "unavailable",
  previousValue: null,
};

export const COMPARISON_OFF: Delta = {
  percent: null,
  direction: null,
  availability: "off",
  previousValue: null,
};

/**
 * Three-state trend.
 *
 * `deltaDir` in lib/data/formatters.ts returns "up" for 0, which renders a green
 * ▲ 0% for a flat metric. This is the replacement — use it for anything
 * comparison-related.
 */
export function deltaTrend(percent: number | null): "up" | "down" | "flat" | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  if (percent > 0) return "up";
  if (percent < 0) return "down";
  return "flat";
}

/**
 * Percentage change from `previous` to `current`.
 *
 * Growth from a zero baseline is deliberately NOT reported as +100% or
 * +Infinity: 0 → 40 has no meaningful percentage, so it comes back as
 * unavailable and the UI shows the raw values instead of an invented ratio.
 */
export function computeDelta(current: number, previous: number | null): Delta {
  if (previous === null || !Number.isFinite(previous) || !Number.isFinite(current)) {
    return NO_COMPARISON;
  }
  if (previous === 0) {
    return { ...NO_COMPARISON, previousValue: 0 };
  }
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  return {
    percent: Number(percent.toFixed(1)),
    direction: deltaTrend(percent),
    availability: "available",
    previousValue: previous,
  };
}

export interface CompositePart {
  /** Connector key, matched against PERIOD_SUPPORT. */
  platform: string;
  connected: boolean;
  current: number;
  previous: number | null;
}

/**
 * Delta for a KPI summed across several platforms.
 *
 * A KPI like "Total Reach" adds GA4 + Facebook + Instagram + LinkedIn. GA4 can
 * answer for a past window; the social connectors cannot. Diffing the sum would
 * quietly treat the un-comparable parts as unchanged and understate the real
 * movement — a plausible-looking number built partly from fiction.
 *
 * So the rule is all-or-nothing: the composite is comparable only if EVERY
 * connected contributor is comparable. Disconnected sources are ignored, since
 * they contribute nothing to either side of the sum.
 */
export function compositeDelta(parts: CompositePart[]): { value: number; delta: Delta } {
  const active = parts.filter((p) => p.connected);
  const value = active.reduce((sum, p) => sum + (Number.isFinite(p.current) ? p.current : 0), 0);

  if (active.length === 0) return { value, delta: NO_COMPARISON };

  const allComparable = active.every((p) => isComparable(p.platform) && p.previous !== null);
  if (!allComparable) return { value, delta: NO_COMPARISON };

  const previous = active.reduce((sum, p) => sum + (p.previous ?? 0), 0);
  return { value, delta: computeDelta(value, previous) };
}

/** Formats a delta for display: "▲ 12.4%", "▼ 3.1%", "0%", or "" when absent. */
export function formatDelta(d: Delta): string {
  if (d.percent === null) return "";
  if (d.percent === 0) return "0%";
  return `${d.direction === "up" ? "▲" : "▼"} ${Math.abs(d.percent)}%`;
}
