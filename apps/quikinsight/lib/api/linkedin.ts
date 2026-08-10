export interface LinkedInData {
  connected: boolean;
  organizationName?: string;
  websiteUrl?: string;
  description?: string;
  specialties?: string[];
  // Core KPIs
  followers?: number;
  paidFollowers?: number;
  impressions?: number;
  engagements?: number;
  reach?: number;
  engagementRate?: string;
  // Post breakdown
  clicks?: number;
  shares?: number;
  reactions?: number;
  comments?: number;
  // Page analytics
  pageViews?: number;
  uniqueVisitors?: number;
  mobilePageViews?: number;
  // Video
  videoViews?: number;
  videoWatchTimeSeconds?: number;
  // Demographics
  followersByIndustry?: { name: string; count: number }[];
  followersBySeniority?: { name: string; count: number }[];
  followersByGeo?: { name: string; count: number }[];
  followersByFunction?: { name: string; count: number }[];
  // Recent posts
  recentPosts?: { id: string; text: string; publishedAt: number; feedDistribution: string }[];
}

export async function getLinkedInData(): Promise<LinkedInData> {
  const res = await fetch("/api/linkedin", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load LinkedIn data (${res.status})`);
  return (await res.json()) as LinkedInData;
}
