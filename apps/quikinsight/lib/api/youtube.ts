export interface YouTubeData {
  connected: boolean;
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
  return (await res.json()) as YouTubeData;
}
