import { withSample } from "./sample";
import { YOUTUBE_SAMPLE } from "@/lib/mock/platformSamples";
export interface YouTubeData {
  connected: boolean;
  /** Set when these are sample figures, not the workspace's own. */
  isSampleData?: boolean;
  channelName?: string;
  subscribers?: number;
  totalViews?: number;
  totalVideos?: number;
  watchTimeHours?: number;
  avgViewDuration?: number;
  topVideos?: Array<{ title: string; views: number; likes: number; comments: number; publishedAt: string }>;
}

export async function getYouTubeData(): Promise<YouTubeData> {
  const res = await fetch("/api/youtube", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load YouTube data (${res.status})`);
  const live = (await res.json()) as YouTubeData;
  // Not connected -> representative sample data + a banner on the page.
  return withSample<YouTubeData>(live, YOUTUBE_SAMPLE);
}
