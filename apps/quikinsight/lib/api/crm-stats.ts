import { withSample } from "./sample";
import { CRM_SAMPLE } from "@/lib/mock/platformSamples";
export interface CrmStatsData {
  connected: boolean;
  /** Set when these are sample figures, not the workspace's own. */
  isSampleData?: boolean;
  totalContacts?: number;
  recentContacts?: number;
  totalDeals?: number;
  openDeals?: number;
  wonDeals?: number;
  lostDeals?: number;
  pipeline?: number;
  revenue?: number;
  leads?: number;
  winRate?: number;
  stages?: Array<{ label: string; count: number; value: number }>;
  dealsByMonth?: Array<{ month: string; count: number; value: number }>;
}

export async function getCrmStats(): Promise<CrmStatsData> {
  const res = await fetch("/api/crm-stats", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load CRM stats (${res.status})`);
  const live = (await res.json()) as CrmStatsData;
  // No CRM connected -> representative sample data + a banner on the page.
  return withSample<CrmStatsData>(live, CRM_SAMPLE);
}
