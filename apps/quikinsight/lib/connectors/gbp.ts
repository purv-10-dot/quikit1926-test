import axios from "axios";
import { prisma } from "@/lib/prisma";
import type { GbpMetadata } from "@/lib/types/connections";
import { NoConnectionError } from "./errors";

export interface GbpStats {
  searches:      number;
  calls:         number;
  reviews:       number;
  directions:    number;
  rating:        number;
  websiteClicks: number;
}

async function getClient(userId: string, workspaceId?: string) {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "GOOGLE_BUSINESS_PROFILE", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn) throw new NoConnectionError();
  if (conn.status !== "CONNECTED") throw new Error("GBP not connected");

  let token = conn.accessToken ?? "";
  // Refresh if expired
  if (conn.tokenExpiresAt && conn.tokenExpiresAt < new Date() && conn.refreshToken) {
    const res = await axios.post<{ access_token: string; expires_in: number }>(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        grant_type:    "refresh_token",
        client_id:     process.env.QUIKINSIGHT_GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.QUIKINSIGHT_GOOGLE_CLIENT_SECRET ?? "",
        refresh_token: conn.refreshToken,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    token = res.data.access_token;
    await prisma.platformConnection.update({
      where: { id: conn.id },
      data:  { accessToken: token, tokenExpiresAt: new Date(Date.now() + res.data.expires_in * 1000) },
    });
  }

  return { token, metadata: (conn.metadata ?? {}) as GbpMetadata };
}

export async function getGbpStats(userId: string, workspaceId?: string): Promise<GbpStats> {
  const { token, metadata } = await getClient(userId, workspaceId);
  if (!metadata.locationId) throw new Error("GBP location not set");

  const headers = { Authorization: `Bearer ${token}` };
  const end   = new Date();
  const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dateParam = (d: Date) =>
    `year=${d.getUTCFullYear()}&month=${d.getUTCMonth() + 1}&day=${d.getUTCDate()}`;

  // Business Profile Performance API â€” multi-metric daily time series
  const metrics = [
    "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
    "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
    "CALL_CLICKS",
    "BUSINESS_DIRECTION_REQUESTS",
    "WEBSITE_CLICKS",
  ];
  const qs =
    metrics.map((m) => `dailyMetrics=${m}`).join("&") +
    `&dailyRange.start_date.${dateParam(start).replace(/&/g, "&dailyRange.start_date.")}` +
    `&dailyRange.end_date.${dateParam(end).replace(/&/g, "&dailyRange.end_date.")}`;

  const url = `https://businessprofileperformance.googleapis.com/v1/locations/${metadata.locationId}:fetchMultiDailyMetricsTimeSeries?${qs}`;

  const res = await axios.get(url, { headers });
  const series = res.data?.multiDailyMetricTimeSeries ?? [];

  const sum = (name: string) => {
    let total = 0;
    for (const block of series) {
      for (const dm of block.dailyMetricTimeSeries ?? []) {
        if (dm.dailyMetric !== name) continue;
        for (const pt of dm.timeSeries?.datedValues ?? []) {
          total += Number(pt.value ?? 0);
        }
      }
    }
    return total;
  };

  const searches =
    sum("BUSINESS_IMPRESSIONS_DESKTOP_SEARCH") + sum("BUSINESS_IMPRESSIONS_MOBILE_SEARCH");

  // Reviews + rating come from the account-management API
  let reviews = 0, rating = 0;
  try {
    const accountName = metadata.accountId ? `accounts/${metadata.accountId}` : "";
    const rv = await axios.get(
      `https://mybusiness.googleapis.com/v4/${accountName}/locations/${metadata.locationId}/reviews`,
      { headers }
    );
    reviews = Number(rv.data?.totalReviewCount ?? 0);
    rating  = Number(rv.data?.averageRating ?? 0);
  } catch { /* reviews are best-effort */ }

  return {
    searches,
    calls:         sum("CALL_CLICKS"),
    reviews,
    directions:    sum("BUSINESS_DIRECTION_REQUESTS"),
    rating,
    websiteClicks: sum("WEBSITE_CLICKS"),
  };
}
