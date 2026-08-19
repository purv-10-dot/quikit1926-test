import { withSample } from "./sample";
import { GOOGLE_ADS_SAMPLE } from "@/lib/mock/platformSamples";
export interface GoogleAdsData {
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
  const live = (await res.json()) as GoogleAdsData;
  // Not connected -> representative sample data + a banner on the page.
  return withSample<GoogleAdsData>(live, GOOGLE_ADS_SAMPLE);
}
