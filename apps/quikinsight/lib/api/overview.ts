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
  /**
   * Raw numeric values behind a subset of `metrics`, for callers that need to
   * sum/average across cards (e.g. Overview's Social/Paid/Email KPI strips) —
   * `metrics` alone can't be aggregated since its values are pre-formatted
   * strings ("1.3K", "9.8%"). Optional: not every card populates it.
   */
  raw?: Record<string, number>;
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
/**
 * Representative KPI strip for a workspace with nothing connected.
 *
 * The overview route honestly reports `connected: false` with an empty `kpis`
 * array; without this the generated report renders a blank scorecard. Values
 * line up with the other samples in lib/mock/platformSamples.ts.
 */
export const OVERVIEW_KPIS_SAMPLE: OverviewKpi[] = [
  { label: "Total Reach",  value: "184K",  delta: "▲ 12.4%", trend: "up",   sub: "vs. previous period", comparison: "available" },
  { label: "Engagement",   value: "21.6K", delta: "▲ 8.1%",  trend: "up",   sub: "vs. previous period", comparison: "available" },
  { label: "Web Traffic",  value: "38.2K", delta: "▼ 2.4%",  trend: "down", sub: "vs. previous period", comparison: "available" },
  { label: "Leads",        value: "412",   delta: "▲ 9.3%",  trend: "up",   sub: "vs. previous period", comparison: "available" },
  { label: "Pipeline",     value: "$1.3M", delta: "▲ 14.0%", trend: "up",   sub: "vs. previous period", comparison: "available" },
  { label: "Revenue",      value: "$486K", delta: "▲ 6.2%",  trend: "up",   sub: "vs. previous period", comparison: "available" },
];

export async function getOverviewData(period: PeriodSpec | number): Promise<OverviewData> {
  const qs =
    typeof period === "number"
      ? `days=${period}`
      : encodePeriod(period).toString();
  const res = await fetch(`/api/overview?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load overview (${res.status})`);
  return (await res.json()) as OverviewData;
}
