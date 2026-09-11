// Meta connector â€” discovers the Page at runtime, uses the Page access token,
// and degrades gracefully when the account manages no Page / no linked IG.
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { NoConnectionError } from "./errors";
import { computeEngagementRate, windowToUnixRange, withinWindow } from "./metaEngagement";
import { trailingWindow } from "@/lib/period/resolve";
import type { DateWindow } from "@/lib/period/types";

const BASE = "https://graph.facebook.com/v19.0";

async function getMetaConn(userId: string, workspaceId?: string): Promise<{ token: string; selectedPageId: string }> {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "META_FACEBOOK" },
  });
  if (!conn) throw new NoConnectionError();
  if (conn.status !== "CONNECTED") throw new Error("Meta not connected");
  const md = (conn.metadata ?? {}) as Record<string, string>;
  return { token: conn.accessToken ?? "", selectedPageId: md.selectedPageId ?? md.pageId ?? "" };
}

async function metaGet(path: string, token: string) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await axios.get(`${BASE}${path}${sep}access_token=${token}`);
  return res.data;
}

const emptyFb = {
  reach: 0, impressions: 0, engagedUsers: 0, postEngagements: 0, fans: 0,
  engagementRate: "0", topPosts: [] as Array<Record<string, unknown>>,
};
const emptyIg = {
  reach: 0, impressions: 0, profileViews: 0, followers: 0, accountsEngaged: 0,
  engagementRate: "0", topPosts: [] as Array<Record<string, unknown>>,
};

async function facebookInsights(pageId: string, pageToken: string, w: DateWindow) {
  const { since, until } = windowToUnixRange(w);
  const metrics: Record<string, number> = {};

  // Page-level insights are best-effort: Meta has deprecated many of these
  // metrics, and one invalid metric fails the whole call â€” so we never rely on
  // it alone. Post-derived aggregates below are the dependable source.
  //
  // UNVERIFIED metric name: `page_impressions` was deprecated (Nov 2025) along
  // with the rest of this family; `page_views_total` is the best-corroborated
  // replacement found via research, matching the same impressions->views
  // pattern already confirmed for Instagram's account-insights fix earlier
  // this session, but could not be confirmed against Meta's live docs
  // (network-restricted in this environment). This call is best-effort/
  // fire-and-forget anyway (its result barely affects `reach` below), so a
  // wrong name here degrades to the existing post-derived fallback rather
  // than breaking anything. MUST be smoke-tested against a real Page before
  // fully trusting `impressions` if it's ever surfaced directly.
  try {
    const data = await metaGet(
      `/${pageId}/insights?metric=page_views_total&period=day&since=${since}&until=${until}`,
      pageToken
    );
    for (const item of data.data ?? []) {
      metrics[item.name] = (item.values ?? []).reduce((acc: number, v: any) => acc + (Number(v.value) || 0), 0);
    }
  } catch (err) {
    console.error("FB page insights error:", err instanceof Error ? err.message : err);
  }

  // Fans/followers straight from the Page node â€” reliable even when insights
  // metrics are restricted.
  let fanCount = 0;
  try {
    const pg = await metaGet(`/${pageId}?fields=fan_count,followers_count`, pageToken);
    fanCount = Number(pg.fan_count ?? pg.followers_count ?? 0);
  } catch { /* */ }

  // Posts + per-post insights (these still work) â€” the basis for our aggregates.
  // No native date filter on this edge, so the window is applied client-side
  // below (`withinWindow`) after fetching the most recent posts.
  type FbAggPost = { id: string; platform: "facebook"; message: string; thumbnail?: string; timestamp: string; reach: number; engagement: number; clicks: number };
  let allPosts: FbAggPost[] = [];
  try {
    // UNVERIFIED metric name: `post_impressions` was deprecated (Nov 2025);
    // `post_media_view` is the confirmed replacement per multiple independent
    // sources describing this same deprecation wave (mirrors the
    // impressions->views fix already confirmed and shipped for Instagram's
    // account-insights call earlier this session). Could not verify the
    // literal string against Meta's live docs directly (network-restricted
    // in this environment) â€” MUST be smoke-tested against a real Page before
    // fully trusting `reach`/`engagement` below; this IS the metric that was
    // silently zeroing Facebook Reach/Engagement while Fans stayed correct
    // (fan_count comes from a separate, unrelated call above).
    const postsData = await metaGet(
      `/${pageId}/posts?fields=message,created_time,full_picture,insights.metric(post_media_view,post_engaged_users,post_clicks)&limit=50`,
      pageToken
    );
    const mapped: FbAggPost[] = (postsData.data ?? []).map((post: Record<string, unknown>) => {
      const insightMap: Record<string, number> = {};
      const insights = post.insights as { data?: Array<{ name: string; values?: Array<{ value: number }> }> } | undefined;
      for (const i of insights?.data ?? []) insightMap[i.name] = i.values?.[0]?.value ?? 0;
      return {
        id: String(post.id ?? ""), platform: "facebook" as const,
        message: (post.message as string | undefined)?.slice(0, 80) ?? "",
        thumbnail: post.full_picture as string | undefined,
        timestamp: String(post.created_time ?? ""),
        reach: insightMap["post_media_view"] ?? 0,
        engagement: insightMap["post_engaged_users"] ?? 0,
        clicks: insightMap["post_clicks"] ?? 0,
      };
    });
    allPosts = mapped.filter((p) => withinWindow(p.timestamp, w));
  } catch { /* */ }

  const topPosts = [...allPosts].sort((a, b) => b.reach - a.reach).slice(0, 5);
  const postReachSum = allPosts.reduce((acc, p) => acc + (p.reach || 0), 0);
  const postEngSum   = allPosts.reduce((acc, p) => acc + (p.engagement || 0), 0);

  // Prefer page insights when present, else fall back to post-derived totals.
  // Both sides are now scoped to the same `w` window, so this ratio and the
  // post totals agree with the account-level insights call above.
  const impressions  = metrics["page_views_total"] || postReachSum;
  const reach        = postReachSum || impressions;
  const engagedUsers = postEngSum;
  const fans         = fanCount;
  return {
    reach, impressions, engagedUsers, postEngagements: postEngSum, fans,
    engagementRate: computeEngagementRate(engagedUsers, reach),
    topPosts,
  };
}

async function instagramInsights(igId: string, token: string, w: DateWindow) {
  const metrics: Record<string, number> = {};
  const { since, until } = windowToUnixRange(w);

  // Account-level insights are best-effort (several IG metrics were deprecated).
  // `metric_type=total_value` is required as of Graph API v19+ for `reach`/
  // `views`/`profile_views` to return real data on this endpoint — without it
  // the response's `data` items carry an empty `values` array, which silently
  // summed to 0 here and fell through to the less-accurate postReachSum
  // fallback below. `reach`-only fix already applied in lib/connectors/
  // instagram.ts and ported here; `views`/`profile_views` were NOT included
  // in that port, so `impressions` below was hardcoded to equal `reach`
  // (never a real, independent number) and `profileViews` was actually the
  // follower count — both fixed now by requesting and parsing the same three
  // metrics instagram.ts already does, in the same shape.
  let impressions = 0;
  let profileViews = 0;
  try {
    const data = await metaGet(
      `/${igId}/insights?metric=reach,views,profile_views&period=day&metric_type=total_value&since=${since}&until=${until}`,
      token
    );
    for (const item of data.data ?? []) {
      const total = Number(item.total_value?.value) || 0;
      metrics[item.name] = total;
      if (item.name === "views") impressions = total;
      else if (item.name === "profile_views") profileViews = total;
    }
    if (impressions === 0) {
      console.error("[metaConnector] Instagram views metric returned 0 for account insights (accountId:", igId, ")");
    }
  } catch (err) {
    console.error("IG account insights error:", err instanceof Error ? err.message : err);
  }

  // Follower count from the IG node (reliable).
  let followers = 0;
  try {
    const acc = await metaGet(`/${igId}?fields=followers_count`, token);
    followers = Number(acc.followers_count ?? 0);
  } catch { /* */ }

  // `saved`/`shares` are included alongside `likes`/`comments` so this matches
  // the formula in lib/connectors/instagram.ts exactly (previously this path
  // summed only likes+comments, undercounting engagement vs. the dedicated
  // /instagram page for the same account and period).
  type IgAggPost = { id: string; platform: "instagram"; message: string; thumbnail?: string; timestamp: string; likes: number; comments: number; reach: number; engagement: number };
  let allPosts: IgAggPost[] = [];
  try {
    const postsData = await metaGet(
      `/${igId}/media?fields=caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,insights.metric(reach,saved,shares)&limit=50`,
      token
    );
    const mapped: IgAggPost[] = (postsData.data ?? []).map((post: Record<string, unknown>) => {
      const insightMap: Record<string, number> = {};
      const insights = post.insights as { data?: Array<{ name: string; values?: Array<{ value: number }> }> } | undefined;
      for (const i of insights?.data ?? []) insightMap[i.name] = i.values?.[0]?.value ?? 0;
      const likes = Number(post.like_count ?? 0);
      const comments = Number(post.comments_count ?? 0);
      const saved = insightMap["saved"] ?? 0;
      const shares = insightMap["shares"] ?? 0;
      return {
        id: String(post.id ?? ""), platform: "instagram" as const,
        message: (post.caption as string | undefined)?.slice(0, 80) ?? "",
        thumbnail: (post.thumbnail_url || post.media_url) as string | undefined,
        timestamp: String(post.timestamp ?? ""),
        likes, comments,
        reach: insightMap["reach"] ?? 0,
        engagement: likes + comments + saved + shares,
      };
    });
    allPosts = mapped.filter((p) => withinWindow(p.timestamp, w));
  } catch { /* */ }

  const topPosts = [...allPosts].sort((a, b) => b.reach - a.reach).slice(0, 5);
  const postReachSum = allPosts.reduce((acc, p) => acc + (p.reach || 0), 0);
  const postEngSum   = allPosts.reduce((acc, p) => acc + (p.engagement || 0), 0);

  const reach = metrics["reach"] || postReachSum;
  const accountsEngaged = postEngSum;
  return {
    reach,
    // Real, independently-fetched values as of this fix — previously
    // `impressions` was hardcoded to equal `reach` and `profileViews` was
    // actually the follower count (see the account-insights fetch above).
    impressions, profileViews,
    followers,
    accountsEngaged, engagementRate: computeEngagementRate(accountsEngaged, reach),
    topPosts,
  };
}

export async function getAllMetaInsights(userId: string, workspaceId?: string, window?: DateWindow) {
  const w = window ?? trailingWindow(7);
  const { token, selectedPageId } = await getMetaConn(userId, workspaceId);

  // Discover the Page (and its linked IG account) at runtime
  let pages: Array<{ id: string; name: string; access_token?: string; instagram_business_account?: { id: string } }> = [];
  try {
    const acct = await metaGet(`/me/accounts?fields=id,name,access_token,instagram_business_account`, token);
    pages = acct.data ?? [];
  } catch { /* */ }

  if (pages.length === 0) {
    let userName = "";
    try { userName = (await metaGet(`/me?fields=name`, token))?.name ?? ""; } catch { /* */ }
    return {
      noPage: true as const,
      userName,
      facebook: emptyFb, instagram: emptyIg,
      combinedReach: 0, combinedEngagement: 0, source: "live" as const,
    };
  }

  // Use the page the user picked in Configure; fall back to the first.
  const page = pages.find((p) => p.id === selectedPageId) ?? pages[0];
  const pageToken = page.access_token || token;
  const igId = page.instagram_business_account?.id;

  const [facebook, instagram] = await Promise.all([
    facebookInsights(page.id, pageToken, w),
    igId ? instagramInsights(igId, pageToken, w) : Promise.resolve(emptyIg),
  ]);

  return {
    noPage: false as const,
    pageName: page.name,
    igConnected: !!igId,
    facebook, instagram,
    combinedReach: (facebook.reach ?? 0) + (instagram.reach ?? 0),
    combinedEngagement: (facebook.engagedUsers ?? 0) + (instagram.accountsEngaged ?? 0),
    source: "live" as const,
  };
}
