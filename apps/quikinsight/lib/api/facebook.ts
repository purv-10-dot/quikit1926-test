import { withSample } from "./sample";
import { FACEBOOK_SAMPLE } from "@/lib/mock/platformSamples";
import { encodePeriod } from "@/lib/period/resolve";
import type { DateWindow, PeriodSpec } from "@/lib/period/types";

export interface FacebookData {
  connected: boolean;
  /** Set when these are sample figures, not the workspace's own. */
  isSampleData?: boolean;
  pageName?: string;
  fans?: number;
  reach?: number;
  impressions?: number;
  engagedUsers?: number;
  postEngagements?: number;
  engagementRate?: string;
  period?: DateWindow;
  topPosts?: Array<{
    id: string;
    message: string;
    thumbnail?: string;
    timestamp: string;
    reach: number;
    engagement: number;
    clicks: number;
  }>;
}

export async function getFacebookData(period?: PeriodSpec): Promise<FacebookData> {
  const qs = period ? `?${encodePeriod(period).toString()}` : "";
  const res = await fetch(`/api/facebook${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load Facebook data (${res.status})`);
  const live = (await res.json()) as FacebookData;
  // Not connected -> representative sample data + a banner on the page.
  return withSample<FacebookData>(live, FACEBOOK_SAMPLE);
}
