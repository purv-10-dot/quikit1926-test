export interface XAdsData {
  connected: boolean;
  accountName?: string;
  spend?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  conversions?: number;
  campaigns?: Array<{ id: string; name: string; status: string; spend: number; impressions: number; clicks: number; ctr: number }>;
}

export async function getXAdsData(): Promise<XAdsData> {
  const res = await fetch("/api/x-ads", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load X Ads data (${res.status})`);
  return (await res.json()) as XAdsData;
}
