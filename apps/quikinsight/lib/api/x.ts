export interface XData {
  connected: boolean;
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
  return (await res.json()) as XData;
}
