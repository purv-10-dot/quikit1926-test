import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import type { GoogleMetadata } from "@/lib/types/connections";
import type {
  GA4DataResult,
  WeekOverWeekResult,
} from "@/lib/connectors/ga4";

import { resolvePeriod, trailingWindow, windowToDays } from "@/lib/period/resolve";
import type { DateWindow, PeriodSelection } from "@/lib/period/types";
import { NoConnectionError } from "./errors";

// Re-export so the aggregator can use a single import
export type { GA4DataResult, WeekOverWeekResult };

type GooglePlatform = "GOOGLE_ANALYTICS" | "YOUTUBE" | "GOOGLE_SEARCH_CONSOLE";

async function getClient(userId: string, platform: GooglePlatform = "GOOGLE_ANALYTICS", workspaceId?: string) {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform, ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn) throw new NoConnectionError();
  if (conn.status !== "CONNECTED") throw new Error(`${platform} not connected`);

  const oauth2 = new google.auth.OAuth2(
    process.env.QUIKINSIGHT_GOOGLE_CLIENT_ID,
    process.env.QUIKINSIGHT_GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    access_token:  conn.accessToken,
    refresh_token: conn.refreshToken ?? undefined,
    expiry_date:   conn.tokenExpiresAt?.getTime(),
  });

  // Persist refreshed tokens automatically
  oauth2.on("tokens", async (tokens) => {
    await prisma.platformConnection.update({
      where: { id: conn.id },
      data: {
        accessToken:    tokens.access_token ?? conn.accessToken,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    });
  });

  const metadata = (conn.metadata ?? {}) as GoogleMetadata;
  return { oauth2, metadata, connId: conn.id };
}

// Pick the GA4 property that actually has traffic. Tries the configured
// property first; if it has zero sessions, scans the other properties the
// account can access and switches to the one with the most recent sessions.
async function resolveBestProperty(
  analyticsData: ReturnType<typeof google.analyticsdata>,
  metadata: GoogleMetadata,
  connId: string,
): Promise<string> {
  const configured = metadata.propertyId ?? "";
  let candidates: { id: string; name: string }[] = [];
  try {
    candidates = metadata.allProperties ? JSON.parse(metadata.allProperties) : [];
  } catch { candidates = []; }
  if (candidates.length === 0 && configured) candidates = [{ id: configured, name: "" }];
  if (candidates.length <= 1) return configured || candidates[0]?.id || "";

  // Query 28-day sessions per property; pick the max.
  const counts = await Promise.all(
    candidates.map(async (c) => {
      try {
        const r = await analyticsData.properties.runReport({
          property: `properties/${c.id}`,
          requestBody: {
            dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
            metrics:    [{ name: "sessions" }],
          },
        });
        const sessions = Number(r.data.rows?.[0]?.metricValues?.[0]?.value ?? 0);
        return { id: c.id, name: c.name, sessions };
      } catch {
        return { id: c.id, name: c.name, sessions: -1 };
      }
    })
  );
  counts.sort((a, b) => b.sessions - a.sessions);
  const best = counts[0];

  // If the configured property has no traffic but another does, switch + persist.
  const configuredCount = counts.find((c) => c.id === configured)?.sessions ?? 0;
  if (best && best.sessions > configuredCount && best.id !== configured) {
    await prisma.platformConnection.update({
      where: { id: connId },
      data:  { metadata: { ...metadata, propertyId: best.id, propertyName: best.name } as object },
    }).catch(() => {});
    return best.id;
  }
  return configured || best?.id || "";
}

// â”€â”€â”€ GA4 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getGA4Data(
  userId: string,
  range: number | DateWindow = 28,
  workspaceId?: string,
): Promise<GA4DataResult> {
  const days = typeof range === "number" ? range : windowToDays(range);
  const win = typeof range === "number" ? trailingWindow(range) : range;
  const { oauth2, metadata, connId } = await getClient(userId, "GOOGLE_ANALYTICS", workspaceId);

  const analyticsData = google.analyticsdata({ version: "v1beta", auth: oauth2 });
  const propertyId = await resolveBestProperty(analyticsData, metadata, connId);
  if (!propertyId) throw new Error("GA4 property not set");

  // Absolute dates, so an explicit comparison window is honoured and every
  // connector in one aggregation agrees on the period even across midnight UTC.
  const RANGE = { startDate: win.start, endDate: win.end };
  const prevWin = resolvePeriod({
    preset: "custom", customStart: win.start, customEnd: win.end, compare: "previous",
  }).previous!;
  const PREV_RANGE = { startDate: prevWin.start, endDate: prevWin.end };
  const property = `properties/${propertyId}`;
  const runReport = (requestBody: object) =>
    analyticsData.properties.runReport({ property, requestBody });

  // Fire every report concurrently; tolerate individual failures so one
  // unsupported metric (e.g. keyEvents on an older property) can't blank the page.
  const [
    channelRes, trendRes, prevTrendRes, summaryRes,
    countryRes, pageRes, eventRes, realtimeRes, realtimeMinRes,
  ] = await Promise.allSettled([
    runReport({
      dateRanges:  [RANGE],
      dimensions:  [{ name: "sessionDefaultChannelGroup" }],
      metrics:     [
        { name: "sessions" }, { name: "totalUsers" },
        { name: "newUsers" }, { name: "bounceRate" },
      ],
    }),
    runReport({
      dateRanges: [RANGE],
      dimensions: [{ name: "date" }],
      metrics:    [{ name: "activeUsers" }, { name: "eventCount" }, { name: "newUsers" }],
      orderBys:   [{ dimension: { dimensionName: "date" }, desc: false }],
    }),
    runReport({
      dateRanges: [PREV_RANGE],
      dimensions: [{ name: "date" }],
      metrics:    [{ name: "activeUsers" }],
      orderBys:   [{ dimension: { dimensionName: "date" }, desc: false }],
    }),
    runReport({
      dateRanges: [RANGE],
      metrics: [
        { name: "activeUsers" }, { name: "newUsers" },
        { name: "eventCount" }, { name: "keyEvents" },
        { name: "userEngagementDuration" },
      ],
    }),
    runReport({
      dateRanges: [RANGE],
      dimensions: [{ name: "country" }],
      metrics:    [{ name: "activeUsers" }],
      orderBys:   [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit:      8,
    }),
    runReport({
      dateRanges: [RANGE],
      dimensions: [{ name: "pageTitle" }],
      metrics:    [{ name: "screenPageViews" }],
      orderBys:   [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit:      8,
    }),
    runReport({
      dateRanges: [RANGE],
      dimensions: [{ name: "eventName" }],
      metrics:    [{ name: "eventCount" }],
      orderBys:   [{ metric: { metricName: "eventCount" }, desc: true }],
      limit:      8,
    }),
    analyticsData.properties.runRealtimeReport({
      property,
      requestBody: { dimensions: [{ name: "country" }], metrics: [{ name: "activeUsers" }], limit: "5" },
    }),
    analyticsData.properties.runRealtimeReport({
      property,
      requestBody: { dimensions: [{ name: "minutesAgo" }], metrics: [{ name: "activeUsers" }] },
    }),
  ]);

  // If EVERY report failed there is no data here, only zeros — and zeros are
  // indistinguishable from a genuinely quiet week. Surfacing them as real
  // numbers told users they had no traffic when in fact the OAuth grant was
  // dead. Fail loudly instead so the route can report needsReauth and the page
  // stamps the section as sample data.
  const ga4Settled = [channelRes, trendRes, summaryRes, countryRes, pageRes, eventRes];
  if (ga4Settled.every((r) => r.status === "rejected")) {
    throw (ga4Settled.find((r) => r.status === "rejected") as PromiseRejectedResult).reason;
  }

  const rows = (r: PromiseSettledResult<{ data: { rows?: unknown[] } }>) =>
    (r.status === "fulfilled" ? r.value.data.rows ?? [] : []) as Array<{
      dimensionValues?: Array<{ value?: string | null }>;
      metricValues?: Array<{ value?: string | null }>;
    }>;
  const dim = (row: { dimensionValues?: Array<{ value?: string | null }> }, i = 0) =>
    row.dimensionValues?.[i]?.value ?? "";
  const num = (row: { metricValues?: Array<{ value?: string | null }> }, i = 0) =>
    Number(row.metricValues?.[i]?.value ?? 0);

  // Channels
  let totalSessions = 0, totalUsers = 0;
  const channelBreakdown = [];
  for (const row of rows(channelRes)) {
    const sessions = num(row, 0), users = num(row, 1);
    totalSessions += sessions;
    totalUsers    += users;
    channelBreakdown.push({
      channel: dim(row) || "Unknown", sessions, users,
      newUsers: num(row, 2), bounceRate: num(row, 3),
    });
  }
  channelBreakdown.sort((a, b) => b.sessions - a.sessions);

  // Session-weighted average bounce rate across all channels
  const bounceRate = totalSessions > 0
    ? channelBreakdown.reduce((sum, ch) => sum + ch.bounceRate * ch.sessions, 0) / totalSessions
    : null;

  // Daily trends
  const dailyTrend = rows(trendRes).map((row) => ({
    date:        dim(row),
    activeUsers: num(row, 0),
    eventCount:  num(row, 1),
    newUsers:    num(row, 2),
  }));
  const weeklyTrend = dailyTrend.map((d) => ({ date: d.date, sessions: d.activeUsers }));
  const prevDailyTrend = rows(prevTrendRes).map((row) => ({
    date: dim(row), activeUsers: num(row, 0),
  }));

  // Summary
  const sRow = rows(summaryRes)[0];
  const activeUsers  = sRow ? num(sRow, 0) : totalUsers;
  const newUsers     = sRow ? num(sRow, 1) : 0;
  const eventCount   = sRow ? num(sRow, 2) : 0;
  const keyEvents    = sRow ? num(sRow, 3) : 0;
  const engagementDuration = sRow ? num(sRow, 4) : 0;
  const avgEngagementTime  = activeUsers > 0 ? engagementDuration / activeUsers : 0;

  // Breakdowns
  const topCountries = rows(countryRes).map((row) => ({ country: dim(row) || "(not set)", activeUsers: num(row) }));
  const topPages     = rows(pageRes).map((row) => ({ title: dim(row) || "(not set)", views: num(row) }));
  const topEvents    = rows(eventRes).map((row) => ({ name: dim(row) || "(not set)", value: num(row) }));

  // Realtime
  const rtCountryRows = rows(realtimeRes);
  const rtByCountry = rtCountryRows.map((row) => ({ country: dim(row) || "(not set)", activeUsers: num(row) }));
  const perMinute = new Array(30).fill(0);
  for (const row of rows(realtimeMinRes)) {
    const idx = Number(dim(row)); // minutesAgo: 0 = now
    if (idx >= 0 && idx < 30) perMinute[29 - idx] = num(row);
  }
  const realtimeActive = rtByCountry.reduce((s, c) => s + c.activeUsers, 0);

  return {
    totalSessions, totalUsers, channelBreakdown, weeklyTrend,
    activeUsers, newUsers, eventCount, keyEvents, avgEngagementTime, bounceRate,
    dailyTrend, prevDailyTrend, topCountries, topPages, topEvents,
    realtime: { activeUsers: realtimeActive, byCountry: rtByCountry, perMinute },
  };
}

export interface RangeComparison {
  current: number;
  previous: number | null;
}

/**
 * Compare arbitrary metrics across two windows in ONE GA4 request.
 *
 * GA4 is the only connector that can do this for free: passing two named
 * `dateRanges` returns both periods in a single call, so a comparison costs no
 * extra quota. Everything else has to be fetched twice.
 *
 * RESPONSE SHAPE. With multiple dateRanges the API appends an implicit
 * `dateRange` dimension and returns ONE ROW PER RANGE, each carrying one
 * metricValue per requested metric. Rows are therefore keyed by their trailing
 * dimension value ("date_range_0" / "date_range_1") — NOT by reading
 * `metricValues[0]` and `metricValues[1]` off a single row, which is what the
 * previous implementation did and why it always reported a zero delta.
 */
export async function getGA4Comparison(
  userId: string,
  period: PeriodSelection,
  workspaceId?: string,
  metrics: string[] = ["sessions"],
): Promise<Record<string, RangeComparison>> {
  const { oauth2, metadata, connId } = await getClient(userId, "GOOGLE_ANALYTICS", workspaceId);

  const analyticsData = google.analyticsdata({ version: "v1beta", auth: oauth2 });
  const propertyId = await resolveBestProperty(analyticsData, metadata, connId);
  if (!propertyId) throw new Error("GA4 property not set");

  const dateRanges = [
    { startDate: period.current.start, endDate: period.current.end, name: "current" },
    ...(period.previous
      ? [{ startDate: period.previous.start, endDate: period.previous.end, name: "previous" }]
      : []),
  ];

  const report = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: { dateRanges, metrics: metrics.map((name) => ({ name })) },
  });

  const headers = (report.data.metricHeaders ?? []).map((h) => h.name ?? "");
  const totals: Record<string, { current: number; previous: number }> = {};
  for (const m of metrics) totals[m] = { current: 0, previous: 0 };

  for (const row of report.data.rows ?? []) {
    // The dateRange marker is the LAST dimension value on the row.
    const dims = row.dimensionValues ?? [];
    const marker = dims[dims.length - 1]?.value ?? "date_range_0";
    const bucket = marker === "date_range_1" ? "previous" : "current";

    (row.metricValues ?? []).forEach((mv, i) => {
      const name = headers[i] ?? metrics[i];
      if (!name || !totals[name]) return;
      totals[name][bucket] += Number(mv.value ?? 0);
    });
  }

  const out: Record<string, RangeComparison> = {};
  for (const m of metrics) {
    out[m] = {
      current: totals[m].current,
      previous: period.previous ? totals[m].previous : null,
    };
  }
  return out;
}

/**
 * @deprecated Use getGA4Comparison. Kept so existing callers keep compiling.
 *
 * The previous implementation was wrong three ways: it compared the older HALF
 * of the current window against a FULL prior window, it read both periods off
 * `metricValues[0]`/`[1]` of one row (so `previousSessions` was always 0 and the
 * delta always 0), and it opened the GOOGLE_SEARCH_CONSOLE connection to query
 * GA4. Fixing it makes the Web Traffic KPI show a real number for the first time.
 */
export async function getGA4WeekOverWeek(userId: string, days = 28, workspaceId?: string): Promise<WeekOverWeekResult> {
  const w = trailingWindow(days);
  const period = resolvePeriod({
    preset: "custom",
    customStart: w.start,
    customEnd: w.end,
    compare: "previous",
  });
  const cmp = await getGA4Comparison(userId, period, workspaceId, ["sessions"]);
  const currentSessions = cmp.sessions?.current ?? 0;
  const previousSessions = cmp.sessions?.previous ?? 0;

  return {
    currentSessions,
    previousSessions,
    deltaPercent: previousSessions > 0
      ? ((currentSessions - previousSessions) / previousSessions) * 100
      : 0,
  };
}

// â”€â”€â”€ YouTube â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getYouTubeData(
  userId: string,
  range: number | DateWindow = 28,
  workspaceId?: string,
) {
  const win = typeof range === "number" ? trailingWindow(range) : range;
  const { oauth2, metadata, connId } = await getClient(userId, "YOUTUBE", workspaceId);
  const yt = google.youtube({ version: "v3", auth: oauth2 });
  const yta = google.youtubeAnalytics({ version: "v2", auth: oauth2 });

  // channelId is written during OAuth callback; if missing, fetch and persist it now
  let channelId = metadata.channelId;
  if (!channelId) {
    const mineRes = await yt.channels.list({ part: ["id", "snippet"], mine: true });
    const ch = mineRes.data.items?.[0];
    if (!ch?.id) throw new Error("No YouTube channel found for this account");
    channelId = ch.id;
    // Persist so future calls skip this lookup
    await prisma.platformConnection.update({
      where: { id: connId },
      data: { metadata: { ...metadata, channelId, channelTitle: ch.snippet?.title ?? "" } as never },
    });
  }

  const startDate = win.start;
  const endDate   = win.end;
  // Previous period of the same length, for the built-in delta.
  const prevWin = resolvePeriod({
    preset: "custom", customStart: win.start, customEnd: win.end, compare: "previous",
  }).previous!;
  const prevStartDate = prevWin.start;
  const prevEndDate   = prevWin.end;

  const _yt = await Promise.allSettled([
    yt.channels.list({ part: ["statistics"], id: [channelId] }),
    yta.reports.query({
      ids: `channel==${channelId}`, startDate, endDate,
      metrics: "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,likes,comments",
    }),
    yta.reports.query({
      ids: `channel==${channelId}`, startDate, endDate,
      metrics: "views,estimatedMinutesWatched,likes,averageViewDuration",
      dimensions: "video", sort: "-views", maxResults: 10,
    }),
    // Daily views trend for the chart
    yta.reports.query({
      ids: `channel==${channelId}`, startDate, endDate,
      metrics: "views,estimatedMinutesWatched",
      dimensions: "day", sort: "day",
    }),
    // Traffic sources
    yta.reports.query({
      ids: `channel==${channelId}`, startDate, endDate,
      metrics: "views",
      dimensions: "insightTrafficSourceType", sort: "-views",
    }),
    // Previous period â€” for viewsDeltaPercent
    yta.reports.query({
      ids: `channel==${channelId}`, startDate: prevStartDate, endDate: prevEndDate,
      metrics: "views",
    }),
  ]);

  // Public channel stats (statsRes) succeed for any channel; the per-channel
  // analytics reports require manager access, so degrade gracefully to zeros
  // instead of failing the whole YouTube page for a managed channel.
  // Same rule as GA4: all-rejected means no data, not a channel with zero views.
  if (_yt.every((r) => r.status === "rejected")) {
    throw (_yt.find((r) => r.status === "rejected") as PromiseRejectedResult).reason;
  }

  const _pick = (i: number): any => (_yt[i].status === "fulfilled" ? (_yt[i] as PromiseFulfilledResult<any>).value : { data: {} });
  const statsRes = _pick(0), analyticsRes = _pick(1), topVideosRes = _pick(2), dailyRes = _pick(3), sourcesRes = _pick(4), prevAnalyticsRes = _pick(5);

  const stats   = statsRes.data.items?.[0]?.statistics;
  const curRow  = (analyticsRes.data.rows as number[][] | null | undefined)?.[0] ?? [];
  const [views = 0, watchMins = 0, avgDur = 0, subs = 0, likes = 0, comments = 0] = curRow;

  const prevRow  = (prevAnalyticsRes.data.rows as number[][] | null | undefined)?.[0] ?? [];
  const [prevViews = 0] = prevRow;
  const viewsDeltaPercent = Number(prevViews) > 0
    ? Math.round(((Number(views) - Number(prevViews)) / Number(prevViews)) * 100)
    : 0;

  const videoRows   = (topVideosRes.data.rows as (string | number)[][] | null | undefined) ?? [];
  const videoIds    = videoRows.map((r) => r[0] as string).filter(Boolean);
  let topVideos: { id: string; title: string; thumbnail: string; publishedAt: string; views: number; watchMinutes: number; likes: number; avgViewDuration: number; comments: number }[] = [];

  if (videoIds.length > 0) {
    const detailsRes = await yt.videos.list({ part: ["snippet", "statistics"], id: videoIds });
    topVideos = (detailsRes.data.items ?? []).map((v, i) => ({
      id:              v.id ?? "",
      title:           v.snippet?.title ?? "",
      thumbnail:       v.snippet?.thumbnails?.medium?.url ?? "",
      publishedAt:     v.snippet?.publishedAt ?? "",
      views:           Number(videoRows[i]?.[1] ?? v.statistics?.viewCount ?? 0),
      watchMinutes:    Number(videoRows[i]?.[2] ?? 0),
      likes:           Number(v.statistics?.likeCount ?? 0),
      avgViewDuration: Number(videoRows[i]?.[3] ?? 0),
      comments:        Number(v.statistics?.commentCount ?? 0),
    }));
  }

  // Daily trend
  const dailyRows = (dailyRes.data.rows as (string | number)[][] | null | undefined) ?? [];
  const dailyTrend = dailyRows.map((r) => ({
    date:        String(r[0]).slice(0, 10), // YYYY-MM-DD
    views:       Number(r[1] ?? 0),
    watchMinutes:Number(r[2] ?? 0),
  }));

  // Traffic sources
  const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
    "YT_SEARCH":            "YouTube search",
    "EXT_URL":              "External",
    "RELATED_VIDEO":        "Suggested videos",
    "SUBSCRIBER":           "Subscriptions",
    "CHANNEL":              "Channel pages",
    "DIRECT_OR_UNKNOWN":    "Direct or unknown",
    "BROWSE_FEATURES":      "Browse features",
    "NOTIFICATION":         "Notifications",
    "PLAYLIST":             "Playlists",
    "OTHER":                "Others",
    "NO_LINK_OTHER":        "Others",
  };
  const sourceRows = (sourcesRes.data.rows as (string | number)[][] | null | undefined) ?? [];
  const totalSourceViews = sourceRows.reduce((s, r) => s + Number(r[1] ?? 0), 0) || 1;
  const trafficSources = sourceRows.map((r) => ({
    source:  TRAFFIC_SOURCE_LABELS[String(r[0])] ?? String(r[0]),
    views:   Number(r[1] ?? 0),
    percent: Math.round((Number(r[1] ?? 0) / totalSourceViews) * 1000) / 10,
  }));

  return {
    channelStats: {
      subscribers: Number(stats?.subscriberCount ?? 0),
      totalViews:  Number(stats?.viewCount ?? 0),
      videoCount:  Number(stats?.videoCount ?? 0),
    },
    analytics: {
      views:                  Number(views),
      watchMinutes:           Number(watchMins),
      avgViewDurationSeconds: Number(avgDur),
      subscribersGained:      Number(subs),
      likes:                  Number(likes),
      comments:               Number(comments),
      viewsDeltaPercent,
    },
    topVideos,
    dailyTrend,
    trafficSources,
  };
}
