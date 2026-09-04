// Facebook connector â€” fetches page insights using the META_FACEBOOK connection
import { prisma } from "@/lib/prisma";
import { NoConnectionError } from "./errors";
import { computeEngagementRate, withinWindow } from "./metaEngagement";
import { trailingWindow } from "@/lib/period/resolve";
import type { DateWindow } from "@/lib/period/types";

const BASE = "https://graph.facebook.com/v19.0";

async function getMetaConn(userId: string, workspaceId?: string): Promise<{ token: string; pageId: string; pageName: string }> {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "META_FACEBOOK", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn) throw new NoConnectionError();
  if (conn.status !== "CONNECTED") throw new Error("Meta not connected");
  const md = (conn.metadata ?? {}) as Record<string, string>;
  const pageId = md.selectedPageId ?? md.pageId ?? "";
  const pageName = md.pageName ?? md.selectedPageName ?? "";
  return { token: conn.accessToken ?? "", pageId, pageName };
}

async function metaGet(path: string, token: string) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}access_token=${token}`);
  if (!res.ok) throw new Error(`Meta API ${path} â†’ ${res.status}`);
  return res.json();
}

export async function getFacebookStats(userId: string, workspaceId?: string, window?: DateWindow) {
  const w = window ?? trailingWindow(7);
  const { token, pageId, pageName } = await getMetaConn(userId, workspaceId);
  if (!pageId) throw new Error("No Facebook page selected");

  // Get page token (long-lived page token)
  let pageToken = token;
  try {
    const accounts = await metaGet(`/me/accounts?fields=id,name,access_token`, token);
    const page = (accounts.data ?? []).find((p: Record<string, string>) => p.id === pageId);
    if (page?.access_token) pageToken = page.access_token;
  } catch (err) {
    console.error("[facebook] page token lookup failed, falling back to user token:", err instanceof Error ? err.message : err);
  }

  // Fan count
  let fans = 0;
  let resolvedPageName = pageName;
  try {
    const pg = await metaGet(`/${pageId}?fields=fan_count,followers_count,name`, pageToken);
    fans = Number(pg.fan_count ?? pg.followers_count ?? 0);
    resolvedPageName = pg.name ?? pageName;
  } catch (err) {
    console.error("[facebook] fan count fetch failed:", err instanceof Error ? err.message : err);
  }

  // Posts with insights
  type FbPost = { id: string; message: string; thumbnail?: string; timestamp: string; reach: number; engagement: number; clicks: number };
  let topPosts: FbPost[] = [];
  try {
    // No native date filter on this edge — Graph API always returns the most
    // recent posts regardless of range, so the selected window is applied
    // client-side below (`withinWindow`) rather than as a query param here.
    const postsData = await metaGet(
      `/${pageId}/posts?fields=message,created_time,full_picture,insights.metric(post_impressions,post_engaged_users,post_clicks)&limit=50`,
      pageToken,
    );
    const allPosts: FbPost[] = (postsData.data ?? []).map((post: Record<string, unknown>) => {
      const insightMap: Record<string, number> = {};
      const insights = post.insights as { data?: Array<{ name: string; values?: Array<{ value: number }> }> } | undefined;
      for (const i of insights?.data ?? []) insightMap[i.name] = i.values?.[0]?.value ?? 0;
      return {
        id: String(post.id ?? ""),
        message: (post.message as string | undefined)?.slice(0, 100) ?? "",
        thumbnail: post.full_picture as string | undefined,
        timestamp: String(post.created_time ?? ""),
        reach: insightMap["post_impressions"] ?? 0,
        engagement: insightMap["post_engaged_users"] ?? 0,
        clicks: insightMap["post_clicks"] ?? 0,
      };
    });
    const inWindow = allPosts.filter((p) => withinWindow(p.timestamp, w));
    topPosts = inWindow.sort((a, b) => b.reach - a.reach).slice(0, 10);
  } catch (err) {
    console.error("[facebook] posts/insights fetch failed:", err instanceof Error ? err.message : err);
  }

  // reach/engagedUsers are derived from the SAME window-filtered post list, so
  // the engagement rate's numerator and denominator always share one period.
  const reach = topPosts.reduce((s, p) => s + p.reach, 0);
  const engagedUsers = topPosts.reduce((s, p) => s + p.engagement, 0);
  const postEngagements = engagedUsers;
  const impressions = reach;

  return {
    pageName: resolvedPageName,
    fans,
    reach,
    impressions,
    engagedUsers,
    postEngagements,
    engagementRate: computeEngagementRate(engagedUsers, reach),
    topPosts,
    period: w,
  };
}
