export interface InstagramData {
  connected: boolean;
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
  return (await res.json()) as InstagramData;
}
