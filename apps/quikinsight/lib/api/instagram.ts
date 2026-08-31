import { withSample } from "./sample";
import { INSTAGRAM_SAMPLE } from "@/lib/mock/platformSamples";
export interface InstagramData {
  connected: boolean;
  /** Set when these are sample figures, not the workspace's own. */
  isSampleData?: boolean;
  username?: string;
  followers?: number;
  reach?: number;
  impressions?: number;
  profileViews?: number;
  accountsEngaged?: number;
  engagementRate?: string;
  topPosts?: Array<{
    id: string;
    message: string;
    thumbnail?: string;
    timestamp: string;
    reach: number;
    engagement: number;
    mediaType?: string;
  }>;
}

export async function getInstagramData(): Promise<InstagramData> {
  const res = await fetch("/api/instagram", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load Instagram data (${res.status})`);
  const live = (await res.json()) as InstagramData;
  // Not connected -> representative sample data + a banner on the page.
  return withSample<InstagramData>(live, INSTAGRAM_SAMPLE);
}
