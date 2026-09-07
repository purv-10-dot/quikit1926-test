import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { getYouTubeData } from "@/lib/connectors/google";
import { connectorErrorResponse } from "@/lib/connectors/errors";
import { markExpiredIfAuthError } from "@/lib/connectors/reauth";
import { decodePeriod, resolvePeriod } from "@/lib/period/resolve";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Accepts ?start/&end (from PeriodPicker via encodePeriod) and the legacy
  // ?days=N. No params at all -> undefined, so getYouTubeData falls back to
  // its own 28-day default — preserving this endpoint's pre-existing
  // behaviour for any caller that doesn't pass a range.
  const sp = new URL(req.url).searchParams;
  const window = sp.size > 0 ? resolvePeriod(decodePeriod(sp)).current : undefined;
  const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user as any).orgId ?? "");
  try {
    const data = await getYouTubeData(session.user.id, window ?? 28, workspaceId);
    // getYouTubeData returns a nested { channelStats, analytics, ... } shape —
    // lib/data/aggregator.ts reads that nested shape directly (yt.analytics.views,
    // etc.), so it stays as-is. The YouTube page/lib/api/youtube.ts instead expects
    // flat top-level fields, so remap here rather than changing the connector.
    return NextResponse.json({
      connected: true,
      subscribers:     data.channelStats.subscribers,
      totalViews:      data.channelStats.totalViews,
      // Period-scoped views (from the Analytics API's date-bound report),
      // distinct from totalViews (channels.list' all-time lifetime count,
      // which is intentionally NOT period-bound and must not change here).
      viewsInPeriod:   data.analytics.views,
      totalVideos:     data.channelStats.videoCount,
      watchTimeHours:  Math.round((data.analytics.watchMinutes / 60) * 10) / 10,
      avgViewDuration: data.analytics.avgViewDurationSeconds,
      topVideos:       data.topVideos,
      dailyTrend:      data.dailyTrend,
      trafficSources:  data.trafficSources,
    });
  } catch (err) {
    // A dead grant is terminal — record it so Integrations offers a reconnect
    // instead of silently retrying a doomed refresh on every page load.
    await markExpiredIfAuthError(err, session.user.id, "YOUTUBE", workspaceId);
    const { body, status } = connectorErrorResponse("youtube", err);
    return NextResponse.json(body, { status });
  }
}
