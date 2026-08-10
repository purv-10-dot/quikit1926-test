// Instagram connector â€” fetches IG business account insights via META_FACEBOOK connection
import { prisma } from "@/lib/prisma";

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
  if (!conn || conn.status !== "CONNECTED") throw new Error("Meta not connected");
  const md = (conn.metadata ?? {}) as Record<string, string>;
  return { token: conn.accessToken ?? "", pageId: md.selectedPageId ?? md.pageId ?? "" };
}

export async function getInstagramStats(userId: string, workspaceId?: string) {
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
  const since = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  const until = Math.floor(Date.now() / 1000);
  try {
    const ins = await metaGet(
      `/${igId}/insights?metric=reach,impressions,profile_views&period=day&since=${since}&until=${until}`,
      pageToken,
    );
    for (const item of ins.data ?? []) {
      const total = (item.values ?? []).reduce((acc: number, v: { value: number }) => acc + (Number(v.value) || 0), 0);
      if (item.name === "reach") reach = total;
      else if (item.name === "impressions") impressions = total;
      else if (item.name === "profile_views") profileViews = total;
    }
  } catch { /* */ }

  // Recent media
  type IgPost = { id: string; message: string; thumbnail?: string; timestamp: string; reach: number; engagement: number; mediaType?: string };
  let topPosts: IgPost[] = [];
  try {
    const media = await metaGet(
      `/${igId}/media?fields=id,caption,media_type,thumbnail_url,media_url,timestamp,insights.metric(impressions,reach,engagement)&limit=20`,
      pageToken,
    );
    topPosts = (media.data ?? []).map((post: Record<string, unknown>) => {
      const insightMap: Record<string, number> = {};
      const insights = post.insights as { data?: Array<{ name: string; values?: Array<{ value: number }> }> } | undefined;
      for (const i of insights?.data ?? []) insightMap[i.name] = i.values?.[0]?.value ?? 0;
      const eng = insightMap["engagement"] ?? 0;
      accountsEngaged += eng;
      return {
        id: String(post.id ?? ""),
        message: (post.caption as string | undefined)?.slice(0, 100) ?? "",
        thumbnail: (post.thumbnail_url ?? post.media_url) as string | undefined,
        timestamp: String(post.timestamp ?? ""),
        reach: insightMap["reach"] ?? 0,
        engagement: eng,
        mediaType: post.media_type as string | undefined,
      };
    }).sort((a: IgPost, b: IgPost) => b.reach - a.reach).slice(0, 10);
  } catch { /* */ }

  if (reach === 0) reach = topPosts.reduce((s, p) => s + p.reach, 0);
  if (impressions === 0) impressions = reach;

  return {
    username,
    followers,
    reach,
    impressions,
    profileViews,
    accountsEngaged,
    engagementRate: reach > 0 ? ((accountsEngaged / reach) * 100).toFixed(1) : "0",
    topPosts,
  };
}
