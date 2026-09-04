// Instagram connector â€” fetches IG business account insights via META_FACEBOOK connection
import { prisma } from "@/lib/prisma";
import { NoConnectionError } from "./errors";
import { computeEngagementRate, windowToUnixRange, withinWindow } from "./metaEngagement";
import { trailingWindow } from "@/lib/period/resolve";
import type { DateWindow } from "@/lib/period/types";

const BASE = "https://graph.facebook.com/v19.0";

async function metaGet(path: string, token: string) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}access_token=${token}`);
  if (!res.ok) throw new Error(`Meta API ${path} â†’ ${res.status}`);
  return res.json();
}

async function getMetaConn(userId: string, workspaceId?: string) {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "META_FACEBOOK", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn) throw new NoConnectionError();
  if (conn.status !== "CONNECTED") throw new Error("Meta not connected");
  const md = (conn.metadata ?? {}) as Record<string, string>;
  return { token: conn.accessToken ?? "", pageId: md.selectedPageId ?? md.pageId ?? "" };
}

export async function getInstagramStats(userId: string, workspaceId?: string, window?: DateWindow) {
  const w = window ?? trailingWindow(7);
  const { token, pageId } = await getMetaConn(userId, workspaceId);
  if (!pageId) throw new Error("No Facebook page selected");

  // Get page token
  let pageToken = token;
  let igId = "";
  let username = "";
  try {
    const accounts = await metaGet(`/me/accounts?fields=id,access_token`, token);
    const page = (accounts.data ?? []).find((p: Record<string, string>) => p.id === pageId);
    if (page?.access_token) pageToken = page.access_token;
  } catch { /* */ }

  // Get IG business account linked to the page
  try {
    const pageData = await metaGet(`/${pageId}?fields=instagram_business_account`, pageToken);
    igId = pageData.instagram_business_account?.id ?? "";
  } catch { /* */ }

  if (!igId) throw new Error("No Instagram business account linked to page");

  // Followers + username
  let followers = 0;
  try {
    const acc = await metaGet(`/${igId}?fields=followers_count,username`, pageToken);
    followers = Number(acc.followers_count ?? 0);
    username = acc.username ?? "";
  } catch { /* */ }

  // Account insights
  let reach = 0;
  let impressions = 0;
  let profileViews = 0;
  let accountsEngaged = 0;
  const { since, until } = windowToUnixRange(w);
  try {
    // `impressions` was deprecated on this account-level endpoint; `views`
    // is Meta's replacement. `reach` and `profile_views` are unaffected.
    // Metric names/scopes: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/insights
    const ins = await metaGet(
      `/${igId}/insights?metric=reach,views,profile_views&period=day&since=${since}&until=${until}`,
      pageToken,
    );
    for (const item of ins.data ?? []) {
      const total = (item.values ?? []).reduce((acc: number, v: { value: number }) => acc + (Number(v.value) || 0), 0);
      if (item.name === "reach") reach = total;
      else if (item.name === "views") impressions = total;
      else if (item.name === "profile_views") profileViews = total;
    }
  } catch (err) {
    console.error("[instagram] account insights fetch failed:", err instanceof Error ? err.message : err);
  }

  // Recent media
  type IgPost = { id: string; message: string; thumbnail?: string; timestamp: string; reach: number; engagement: number; mediaType?: string };
  let topPosts: IgPost[] = [];
  try {
    // `engagement` was deprecated as a per-media insights metric; Meta split
    // it into likes/comments/saved/shares. `impressions` is similarly
    // deprecated per-media in favor of `views` for many accounts/media types.
    // No native date filter on this edge — Graph API always returns the most
    // recent posts regardless of range, so the selected window is applied
    // client-side below (`withinWindow`) rather than as a query param here.
    const media = await metaGet(
      `/${igId}/media?fields=id,caption,media_type,thumbnail_url,media_url,timestamp,insights.metric(views,reach,likes,comments,saved,shares)&limit=50`,
      pageToken,
    );
    const allPosts: IgPost[] = (media.data ?? []).map((post: Record<string, unknown>) => {
      const insightMap: Record<string, number> = {};
      const insights = post.insights as { data?: Array<{ name: string; values?: Array<{ value: number }> }> } | undefined;
      for (const i of insights?.data ?? []) insightMap[i.name] = i.values?.[0]?.value ?? 0;
      const eng = (insightMap["likes"] ?? 0) + (insightMap["comments"] ?? 0) + (insightMap["saved"] ?? 0) + (insightMap["shares"] ?? 0);
      return {
        id: String(post.id ?? ""),
        message: (post.caption as string | undefined)?.slice(0, 100) ?? "",
        thumbnail: (post.thumbnail_url ?? post.media_url) as string | undefined,
        timestamp: String(post.timestamp ?? ""),
        reach: insightMap["views"] ?? insightMap["reach"] ?? 0,
        engagement: eng,
        mediaType: post.media_type as string | undefined,
      };
    });
    // Engagement is summed only from posts within the SAME window as `reach`
    // (the account-insights denominator above) so the rate isn't a mix of a
    // 7-day reach against an unbounded post history.
    const inWindow = allPosts.filter((p) => withinWindow(p.timestamp, w));
    accountsEngaged = inWindow.reduce((s, p) => s + p.engagement, 0);
    topPosts = inWindow.sort((a, b) => b.reach - a.reach).slice(0, 10);
  } catch (err) {
    console.error("[instagram] media insights fetch failed:", err instanceof Error ? err.message : err);
  }

  if (reach === 0) reach = topPosts.reduce((s, p) => s + p.reach, 0);
  if (impressions === 0) impressions = reach;

  return {
    username,
    followers,
    reach,
    impressions,
    profileViews,
    accountsEngaged,
    engagementRate: computeEngagementRate(accountsEngaged, reach),
    topPosts,
    period: w,
  };
}
