export interface MetaAdsData {
  connected: boolean;
  accountName?: string;
  spend?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  conversions?: number;
  roas?: number;
  campaigns?: Array<{
    id: string;
    name: string;
    status: string;
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    conversions: number;
  }>;
}

export async function getMetaAdsData(): Promise<MetaAdsData> {
  const res = await fetch("/api/meta-ads", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load Meta Ads data (${res.status})`);
  return (await res.json()) as MetaAdsData;
}
