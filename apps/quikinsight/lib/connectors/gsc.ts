import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import type { GoogleMetadata } from "@/lib/types/connections";
import { trailingWindow } from "@/lib/period/resolve";
import type { DateWindow } from "@/lib/period/types";

async function getGSCClient(userId: string, workspaceId?: string) {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "GOOGLE_SEARCH_CONSOLE", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn || conn.status !== "CONNECTED") throw new Error("Google Search Console not connected");

  const oauth2 = new google.auth.OAuth2(
    process.env.QUIKINSIGHT_GOOGLE_CLIENT_ID,
    process.env.QUIKINSIGHT_GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    access_token:  conn.accessToken,
    refresh_token: conn.refreshToken ?? undefined,
    // expiry_date lets googleapis know when to auto-refresh; without it the
    // stale access token is reused and the API 401s once it expires (~1h).
    expiry_date:   conn.tokenExpiresAt?.getTime(),
  });

  // Persist refreshed tokens so subsequent calls stay authenticated.
  oauth2.on("tokens", async (tokens) => {
    await prisma.platformConnection.update({
      where: { id: conn.id },
      data: {
        accessToken:    tokens.access_token ?? conn.accessToken,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    }).catch(() => {});
  });

  return {
    oauth2,
    metadata: (conn.metadata ?? {}) as GoogleMetadata,
  };
}

/**
 * @param range Either a trailing day count (legacy) or an explicit window.
 *   An explicit window is what makes period comparison possible — a trailing
 *   count can only ever describe a window ending today.
 */
export async function getSearchConsoleData(
  userId: string,
  range: number | DateWindow = 28,
  workspaceId?: string,
) {
  const { oauth2, metadata } = await getGSCClient(userId, workspaceId);
  if (!metadata.siteUrl) throw new Error("Search Console site not set");

  const webmasters = google.webmasters({ version: "v3", auth: oauth2 });

  const w = typeof range === "number" ? trailingWindow(range) : range;
  const startDate = w.start;
  const endDate   = w.end;

  const base = { siteUrl: metadata.siteUrl, requestBody: { startDate, endDate } };

  // Fan out all dimension queries concurrently
  const [queryRes, pageRes, countryRes, deviceRes, dateRes] = await Promise.all([
    webmasters.searchanalytics.query({
      ...base,
      requestBody: { ...base.requestBody, dimensions: ["query"],   rowLimit: 25 },
    }),
    webmasters.searchanalytics.query({
      ...base,
      requestBody: { ...base.requestBody, dimensions: ["page"],    rowLimit: 25 },
    }),
    webmasters.searchanalytics.query({
      ...base,
      requestBody: { ...base.requestBody, dimensions: ["country"], rowLimit: 10 },
    }),
    webmasters.searchanalytics.query({
      ...base,
      requestBody: { ...base.requestBody, dimensions: ["device"],  rowLimit: 10 },
    }),
    webmasters.searchanalytics.query({
      ...base,
      requestBody: { ...base.requestBody, dimensions: ["date"],    rowLimit: 500 },
    }),
  ]);

  // Totals from query rows (most accurate aggregate)
  let totalClicks = 0, totalImpressions = 0, totalPosition = 0, positionCount = 0;
  for (const row of queryRes.data.rows ?? []) {
    totalClicks      += row.clicks      ?? 0;
    totalImpressions += row.impressions ?? 0;
    if ((row.position ?? 0) > 0) { totalPosition += row.position!; positionCount++; }
  }
  const ctr         = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : "0";
  const avgPosition = positionCount > 0 ? (totalPosition / positionCount).toFixed(1) : "â€”";

  const topQueries = (queryRes.data.rows ?? []).map((r) => ({
    query:       r.keys?.[0] ?? "",
    clicks:      r.clicks      ?? 0,
    impressions: r.impressions ?? 0,
    ctr:         r.ctr         != null ? (r.ctr * 100).toFixed(1) : "0",
    position:    r.position    != null ? r.position.toFixed(1)    : "â€”",
  }));

  const topPages = (pageRes.data.rows ?? []).map((r) => ({
    page:        r.keys?.[0] ?? "",
    clicks:      r.clicks      ?? 0,
    impressions: r.impressions ?? 0,
    ctr:         r.ctr         != null ? (r.ctr * 100).toFixed(1) : "0",
    position:    r.position    != null ? r.position.toFixed(1)    : "â€”",
  }));

  const topCountries = (countryRes.data.rows ?? []).map((r) => ({
    country:     r.keys?.[0] ?? "",
    clicks:      r.clicks      ?? 0,
    impressions: r.impressions ?? 0,
    ctr:         r.ctr         != null ? (r.ctr * 100).toFixed(1) : "0",
    position:    r.position    != null ? r.position.toFixed(1)    : "â€”",
  }));

  const topDevices = (deviceRes.data.rows ?? []).map((r) => ({
    device:      r.keys?.[0] ?? "",
    clicks:      r.clicks      ?? 0,
    impressions: r.impressions ?? 0,
    ctr:         r.ctr         != null ? (r.ctr * 100).toFixed(1) : "0",
    position:    r.position    != null ? r.position.toFixed(1)    : "â€”",
  }));

  const dailyTrend = (dateRes.data.rows ?? []).map((r) => ({
    date:        r.keys?.[0] ?? "",
    clicks:      r.clicks      ?? 0,
    impressions: r.impressions ?? 0,
  }));

  return {
    clicks:      totalClicks,
    impressions: totalImpressions,
    ctr,
    avgPosition,
    topQueries,
    topPages,
    topCountries,
    topDevices,
    dailyTrend,
    siteUrl: metadata.siteUrl,
  };
}

