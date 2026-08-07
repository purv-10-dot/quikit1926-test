export interface GoogleAdsData {
  connected: boolean;
  accountName?: string;
  spend?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  conversions?: number;
  conversionRate?: number;
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
    roas: number;
  }>;
}

export async function getGoogleAdsData(): Promise<GoogleAdsData> {
  const res = await fetch("/api/google-ads", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load Google Ads data (${res.status})`);
  return (await res.json()) as GoogleAdsData;
}
