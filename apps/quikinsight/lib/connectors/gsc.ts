import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import type { GoogleMetadata } from "@/lib/types/connections";
import { trailingWindow } from "@/lib/period/resolve";
import type { DateWindow } from "@/lib/period/types";
import { NoConnectionError } from "./errors";

async function getGSCClient(userId: string, workspaceId?: string) {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "GOOGLE_SEARCH_CONSOLE", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn) throw new NoConnectionError();
  if (conn.status !== "CONNECTED") throw new Error("Google Search Console not connected");

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

  // KNOWN LIMITATION (documented, not fixed): the Search Console API caps
  // each searchanalytics.query response at 50,000 rows per site/search type.
  // A wide window (e.g. 90 days or a year on a high-traffic property) can
  // silently hit that cap â€” the API returns its top rows by clicks and
  // simply omits the rest, with no error or truncation flag. Totals below
  // are summed only from whatever rows come back, so a truncated response
  // understates the true total rather than throwing. Not paginated around
  // here; see PHASE_LOG.md discussion of platform date-range constraints.
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

  // Site-wide totals: a SEPARATE, dimensionless request. Summing the
  // query-dimensioned rows above (rowLimit: 25) would badly undercount —
  // that request only returns the top 25 queries by clicks, so long-tail
  // queries that contribute heavily to impressions (but rarely convert to
  // clicks) are excluded entirely, which also skews avgPosition optimistic
  // (top-clicking queries tend to rank better) and inflates CTR. A request
  // with NO `dimensions` field returns exactly one row: the true site-wide
  // aggregate for the period, with no row limit to worry about.
  let totalClicks: number, totalImpressions: number, ctr: string, avgPosition: string;
  try {
    const totalsRes = await webmasters.searchanalytics.query({ ...base });
    const totalsRow = totalsRes.data.rows?.[0];
    if (!totalsRow) throw new Error("no totals row returned");
    totalClicks      = totalsRow.clicks      ?? 0;
    totalImpressions = totalsRow.impressions ?? 0;
    ctr         = totalsRow.ctr      != null ? (totalsRow.ctr * 100).toFixed(1) : "0";
    avgPosition = totalsRow.position != null ? totalsRow.position.toFixed(1)   : "â€”";
  } catch (err) {
    console.error(
      "[search-console] dimensionless totals request failed, falling back to summed top-25-query totals (less accurate):",
      err instanceof Error ? err.message : err,
    );
    // Fallback: the old (less accurate) approach — sum from the top-25 query rows.
    let fallbackClicks = 0, fallbackImpressions = 0, fallbackPosition = 0, positionCount = 0;
    for (const row of queryRes.data.rows ?? []) {
      fallbackClicks      += row.clicks      ?? 0;
      fallbackImpressions += row.impressions ?? 0;
      if ((row.position ?? 0) > 0) { fallbackPosition += row.position!; positionCount++; }
    }
    totalClicks      = fallbackClicks;
    totalImpressions = fallbackImpressions;
    ctr         = fallbackImpressions > 0 ? ((fallbackClicks / fallbackImpressions) * 100).toFixed(1) : "0";
    avgPosition = positionCount > 0 ? (fallbackPosition / positionCount).toFixed(1) : "â€”";
  }

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

