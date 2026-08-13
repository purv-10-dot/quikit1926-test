export type PerformanceView = "all" | "paid" | "organic";

export interface OverviewKpi {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  sub: string;
}

export interface PlatformCard {
  id: string;
  name: string;
  color: string;
  metrics: { label: string; value: string }[];
}

export interface OverviewData {
  connected: boolean;
  kpis: OverviewKpi[];
  organicPlatforms: PlatformCard[];
  googlePlatforms: PlatformCard[];
  paidPlatforms: PlatformCard[];
  crmPlatforms: PlatformCard[];
  emailPlatforms: PlatformCard[];
  localPlatforms: PlatformCard[];
}

/** GET /overview?days= — real, range-scoped data from the connected platforms. */
export async function getOverviewData(range: number): Promise<OverviewData> {
  const res = await fetch(`/api/overview?days=${range}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load overview (${res.status})`);
  return (await res.json()) as OverviewData;
}
