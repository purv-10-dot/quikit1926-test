export interface FacebookData {
  connected: boolean;
  pageName?: string;
  fans?: number;
  reach?: number;
  impressions?: number;
  engagedUsers?: number;
  postEngagements?: number;
  engagementRate?: string;
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

export async function getFacebookData(): Promise<FacebookData> {
  const res = await fetch("/api/facebook", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load Facebook data (${res.status})`);
  return (await res.json()) as FacebookData;
}
