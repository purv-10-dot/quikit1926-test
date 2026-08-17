import { encodePeriod } from "@/lib/period/resolve";
import type { CompareMode, DateWindow, PeriodSpec } from "@/lib/period/types";

export type PerformanceView = "all" | "paid" | "organic";

export interface OverviewKpi {
  label: string;
  value: string;
  /** Pre-formatted, e.g. "▲ 12.4%". Empty when no comparison is shown. */
  delta: string;
  trend: "up" | "down" | "flat";
  sub: string;
  /**
   * "off"          — the user asked for no comparison
   * "unavailable"  — asked, but this source can't report a past window
   * "available"    — a real delta
   */
  comparison?: "available" | "unavailable" | "off";
}

export interface PlatformCard {
  id: string;
  name: string;
  color: string;
  metrics: { label: string; value: string }[];
}

export interface OverviewPeriod {
  current: DateWindow;
  previous: DateWindow | null;
  /** e.g. "11 – 17 Aug 2026 vs 4 – 10 Aug 2026". */
  label: string;
  mode: CompareMode;
}

export interface OverviewData {
  connected: boolean;
  period?: OverviewPeriod;
  kpis: OverviewKpi[];
  organicPlatforms: PlatformCard[];
  googlePlatforms: PlatformCard[];
  paidPlatforms: PlatformCard[];
  crmPlatforms: PlatformCard[];
  emailPlatforms: PlatformCard[];
  localPlatforms: PlatformCard[];
}

/**
 * Real, period-scoped data from the connected platforms.
 *
 * Accepts a full PeriodSpec (with comparison) or a bare day count. The number
 * form maps to the legacy `?days=` endpoint behaviour — no comparison — so
 * existing callers keep their exact semantics and outbound API cost.
 */
export async function getOverviewData(period: PeriodSpec | number): Promise<OverviewData> {
  const qs =
    typeof period === "number"
      ? `days=${period}`
      : encodePeriod(period).toString();
  const res = await fetch(`/api/overview?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load overview (${res.status})`);
  return (await res.json()) as OverviewData;
}
