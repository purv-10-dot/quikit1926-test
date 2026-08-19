import { withSample } from "./sample";
import { X_SAMPLE } from "@/lib/mock/platformSamples";
export interface XData {
  connected: boolean;
  /** Set when these are sample figures, not the workspace's own. */
  isSampleData?: boolean;
  handle?: string;
  followers?: number;
  following?: number;
  tweets?: number;
  impressions?: number;
  engagements?: number;
  engagementRate?: number;
  recentPosts?: Array<{ id: string; text: string; impressions: number; likes: number; retweets: number; replies: number; publishedAt: string }>;
}

export async function getXData(): Promise<XData> {
  const res = await fetch("/api/x", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load X (Twitter) data (${res.status})`);
  const live = (await res.json()) as XData;
  // Not connected -> representative sample data + a banner on the page.
  return withSample<XData>(live, X_SAMPLE);
}
