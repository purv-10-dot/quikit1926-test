import { NextResponse } from "next/server";
import { getCache } from "@/lib/dashboardCache";

type SourceStatus = "ok" | "not_configured" | "error";

function checkGA4(): SourceStatus {
  return process.env.GA4_PROPERTY_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
    ? "ok"
    : "not_configured";
}

function checkGoogleSheets(): SourceStatus {
  return process.env.GOOGLE_SHEETS_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
    ? "ok"
    : "not_configured";
}

function checkMeta(): SourceStatus {
  return process.env.META_ACCESS_TOKEN &&
    process.env.META_PAGE_ID &&
    process.env.META_IG_ACCOUNT_ID
    ? "ok"
    : "not_configured";
}

function checkYouTube(): SourceStatus {
  return process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REFRESH_TOKEN &&
    process.env.YOUTUBE_CHANNEL_ID
    ? "ok"
    : "not_configured";
}

export async function GET() {
  const cached = getCache();
  const now    = Date.now();

  // Cross-reference last fetch's dataSources to see which actually succeeded
  const lastSources = cached?.data.dataSources;

  const sources: Record<string, SourceStatus> = {
    ga4:          lastSources ? (lastSources.webTraffic === "ga4"      ? "ok" : checkGA4())          : checkGA4(),
    googleSheets: lastSources ? (lastSources.kpis === "google_sheets"  ? "ok" : checkGoogleSheets()) : checkGoogleSheets(),
    meta:         lastSources ? (lastSources.facebook === "meta"       ? "ok" : checkMeta())          : checkMeta(),
    youtube:      lastSources ? (lastSources.youtube  === "youtube"    ? "ok" : checkYouTube())       : checkYouTube(),
  };

  return NextResponse.json({
    status:    "ok",
    sources,
    cacheAge:  cached ? now - cached.ts : null,
    lastFetch: cached ? new Date(cached.ts).toISOString() : null,
  });
}
