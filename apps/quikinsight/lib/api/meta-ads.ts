import { withSample } from "./sample";
import { META_ADS_SAMPLE } from "@/lib/mock/platformSamples";
export interface MetaAdsData {
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
  const live = (await res.json()) as MetaAdsData;
  // Not connected -> representative sample data + a banner on the page.
  return withSample<MetaAdsData>(live, META_ADS_SAMPLE);
}
