import { withSample } from "./sample";
import { X_ADS_SAMPLE } from "@/lib/mock/platformSamples";
export interface XAdsData {
  connected: boolean;
  /** Set when these are sample figures, not the workspace's own. */
  isSampleData?: boolean;
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
  const live = (await res.json()) as XAdsData;
  // Not connected -> representative sample data + a banner on the page.
  return withSample<XAdsData>(live, X_ADS_SAMPLE);
}
