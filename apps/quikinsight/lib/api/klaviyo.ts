export interface KlaviyoData {
  connected: boolean;
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
  return (await res.json()) as KlaviyoData;
}
