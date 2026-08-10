import type {
  MetaSocialPost,
  FacebookPageData,
  InstagramData,
  MetaData,
} from "@/lib/types";

const BASE    = "https://graph.facebook.com/v19.0";
const TOKEN   = process.env.META_ACCESS_TOKEN!;
const PAGE_ID = process.env.META_PAGE_ID!;
const IG_ID   = process.env.META_IG_ACCOUNT_ID!;

type InsightValue = { value: number; end_time?: string };
type InsightItem  = { name: string; values?: InsightValue[]; total_value?: { value: number } };

type RawFBPost = {
  id: string;
  message?: string;
  created_time: string;
  insights?: { data: Array<{ name: string; values: Array<{ value: number }> }> };
};

type RawIGPost = {
  id: string;
  caption?: string;
  media_type: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  reach?: number;
  impressions?: number;
};

async function metaFetch(endpoint: string) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${endpoint}${sep}access_token=${TOKEN}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`Meta API error: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ data?: unknown[] }>;
}

export async function getFacebookPageInsights(): Promise<FacebookPageData> {
  const since = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  const until = Math.floor(Date.now() / 1000);

  const data = await metaFetch(
    `/${PAGE_ID}/insights?metric=page_impressions,page_reach,page_engaged_users,` +
    `page_post_engagements,page_fans&period=week&since=${since}&until=${until}`
  );

  const metrics: Record<string, number> = {};
  for (const item of (data.data ?? []) as InsightItem[]) {
    const latest = item.values?.[item.values.length - 1];
    metrics[item.name] = latest?.value ?? 0;
  }

  const reach        = metrics["page_reach"] ?? 0;
  const engagedUsers = metrics["page_engaged_users"] ?? 0;

  const topPosts = await getTopFacebookPosts();

  return {
    reach,
    impressions:      metrics["page_impressions"] ?? 0,
    engagedUsers,
    postEngagements:  metrics["page_post_engagements"] ?? 0,
    fans:             metrics["page_fans"] ?? 0,
    engagementRate:   reach > 0 ? ((engagedUsers / reach) * 100).toFixed(1) : "0",
    topPosts,
  };
}

async function getTopFacebookPosts(): Promise<MetaSocialPost[]> {
  const data = await metaFetch(
    `/${PAGE_ID}/posts?fields=message,created_time,insights.metric(post_impressions,` +
    `post_engaged_users,post_clicks)&limit=10`
  );

  return ((data.data ?? []) as RawFBPost[])
    .map((post) => {
      const insightMap: Record<string, number> = {};
      for (const i of post.insights?.data ?? []) {
        insightMap[i.name] = i.values?.[0]?.value ?? 0;
      }
      return {
        id:         post.id,
        platform:   "facebook" as const,
        message:    post.message?.slice(0, 80) ?? "",
        timestamp:  post.created_time,
        reach:      insightMap["post_impressions"] ?? 0,
        engagement: insightMap["post_engaged_users"] ?? 0,
        clicks:     insightMap["post_clicks"] ?? 0,
      };
    })
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 3);
}

export async function getInstagramInsights(): Promise<InstagramData> {
  const data = await metaFetch(
    `/${IG_ID}/insights?metric=reach,impressions,profile_views,` +
    `accounts_engaged&period=week&metric_type=total_value`
  );

  const metrics: Record<string, number> = {};
  for (const item of (data.data ?? []) as InsightItem[]) {
    metrics[item.name] = item.total_value?.value ?? 0;
  }

  const reach           = metrics["reach"] ?? 0;
  const accountsEngaged = metrics["accounts_engaged"] ?? 0;

  const topPosts = await getTopInstagramPosts();

  return {
    reach,
    impressions:      metrics["impressions"] ?? 0,
    profileViews:     metrics["profile_views"] ?? 0,
    accountsEngaged,
    engagementRate:   reach > 0 ? ((accountsEngaged / reach) * 100).toFixed(1) : "0",
    topPosts,
  };
}

async function getTopInstagramPosts(): Promise<MetaSocialPost[]> {
  const data = await metaFetch(
    `/${IG_ID}/media?fields=caption,media_type,timestamp,` +
    `like_count,comments_count,reach,impressions&limit=10`
  );

  return ((data.data ?? []) as RawIGPost[])
    .map((post) => ({
      id:         post.id,
      platform:   "instagram" as const,
      message:    post.caption?.slice(0, 80) ?? "",
      timestamp:  post.timestamp,
      likes:      post.like_count ?? 0,
      comments:   post.comments_count ?? 0,
      reach:      post.reach ?? 0,
      impressions: post.impressions ?? 0,
      engagement: (post.like_count ?? 0) + (post.comments_count ?? 0),
    }))
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 3);
}

export async function getAllMetaData(): Promise<Omit<MetaData, "source" | "reason">> {
  const [facebook, instagram] = await Promise.all([
    getFacebookPageInsights(),
    getInstagramInsights(),
  ]);

  return {
    facebook,
    instagram,
    combinedReach:      (facebook.reach ?? 0) + (instagram.reach ?? 0),
    combinedEngagement: (facebook.engagedUsers ?? 0) + (instagram.accountsEngaged ?? 0),
  };
}
