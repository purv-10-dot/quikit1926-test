import { withSample } from "./sample";
import { KLAVIYO_SAMPLE } from "@/lib/mock/platformSamples";
export interface KlaviyoData {
  connected: boolean;
  /** Set when these are sample figures, not the workspace's own. */
  isSampleData?: boolean;
  listName?: string;
  totalProfiles?: number;
  activeProfiles?: number;
  totalFlows?: number;
  avgOpenRate?: number;
  avgClickRate?: number;
  revenue?: number;
  recentCampaigns?: Array<{ id: string; name: string; sentAt: string; recipients: number; openRate: number; clickRate: number; revenue: number }>;
}

export async function getKlaviyoData(): Promise<KlaviyoData> {
  const res = await fetch("/api/klaviyo", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load Klaviyo data (${res.status})`);
  const live = (await res.json()) as KlaviyoData;
  // Not connected -> representative sample data + a banner on the page.
  return withSample<KlaviyoData>(live, KLAVIYO_SAMPLE);
}
