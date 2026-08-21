/**
 * Builds the full QuikInsight email report — the same one the /reports page
 * sends from its "Send" button.
 *
 * Extracted from app/api/insights/send/route.ts so the manual send and the
 * Monday-morning cron (app/api/cron/weekly-report) render from ONE code path.
 * Two copies of this assembly would drift the moment a metric is added to one
 * and not the other, and the scheduled email is the one nobody is watching.
 *
 * Returns null when the user has no connected platform — callers should treat
 * that as "skip", not as an error.
 */

import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { getGA4Data } from "@/lib/connectors/google";
import { getSearchConsoleData } from "@/lib/connectors/gsc";
import { getHubSpotCRMStats } from "@/lib/connectors/hubspot";
import { getAggregatedDashboard } from "@/lib/data/aggregator";
import { getAiInsights } from "@/lib/insights/ai";
import { db as _db } from "@quikit/database";
import { renderInsightsEmail } from "@/lib/insights/emailTemplate";
import type {
  EmailGA4Data, EmailGSCData, EmailCrmData,
  EmailKpi, EmailOrganicPlatform, EmailGooglePlatform, EmailInsight, EmailTimesheetRow,
} from "@/lib/insights/emailTemplate";

const db = _db as any;

/** Window the report covers, in days. */
export const REPORT_DAYS = 30;

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

async function fetchTimesheetForEmail(orgId: string): Promise<Array<{ date: string; user: string; avatar: string; hours: number }>> {
  try {
    const since = new Date();
    since.setMonth(since.getMonth() - 6);

    const marketingTeam = await db.qtTeam.findFirst({
      where: { orgId, isDeleted: false, name: { equals: "Marketing", mode: "insensitive" } },
      select: { id: true },
    });

    let marketingUserIds: string[] | null = null;
    if (marketingTeam) {
      const members = await db.qtTeamMember.findMany({
        where: { teamId: marketingTeam.id, isDeleted: false },
        select: { userId: true },
      });
      marketingUserIds = members.map((m: any) => m.userId);
    }

    const entries = await db.qtTimesheetEntry.findMany({
      where: {
        orgId, isDeleted: false, entryDate: { gte: since },
        ...(marketingUserIds
          ? { userId: { in: marketingUserIds } }
          : { issue: { project: { name: { equals: "Marketing", mode: "insensitive" } } } }),
      },
      select: { entryDate: true, hours: true, userId: true },
      orderBy: { entryDate: "desc" },
    });

    if (!entries?.length) return [];

    const userIds = [...new Set(entries.map((e: any) => e.userId))] as string[];
    const users: Array<{ id: string; firstName: string; lastName: string }> =
      await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      }).catch(() => []);

    const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    return entries.map((e: any) => {
      const name = userMap.get(e.userId) ?? e.userId;
      return {
        date: (e.entryDate as Date).toISOString().slice(0, 10),
        user: name,
        avatar: name.split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase(),
        hours: e.hours,
      };
    });
  } catch {
    return [];
  }
}

export interface BuiltEmailReport {
  subject: string;
  html: string;
}

/**
 * Gather every section the /reports page shows and render it to email HTML.
 * Returns null when nothing is connected.
 */
export async function buildEmailReport(opts: {
  userId: string;
  orgId: string;
  recipientName?: string | null;
}): Promise<BuiltEmailReport | null> {
  const { userId, orgId, recipientName = null } = opts;

  const workspaceId = await getActiveWorkspaceId(userId, orgId);

  // Every source is allowed to fail independently — one dead connector must not
  // cost the recipient the whole report.
  const [dashRaw, ga4Raw, gscRaw, crmRaw, insightsRaw, tsRaw] = await Promise.allSettled([
    getAggregatedDashboard(userId, REPORT_DAYS, workspaceId),
    getGA4Data(userId, REPORT_DAYS, workspaceId),
    getSearchConsoleData(userId, REPORT_DAYS, workspaceId),
    getHubSpotCRMStats(userId, workspaceId),
    getAiInsights(userId, orgId),
    fetchTimesheetForEmail(orgId),
  ]);

  const dash   = dashRaw.status     === "fulfilled" ? dashRaw.value     : null;
  const ga4    = ga4Raw.status      === "fulfilled" ? ga4Raw.value      : null;
  const gsc    = gscRaw.status      === "fulfilled" ? gscRaw.value      : null;
  const crm    = crmRaw.status      === "fulfilled" ? crmRaw.value      : null;
  const aiIns  = insightsRaw.status === "fulfilled" ? insightsRaw.value : null;
  const tsRows = tsRaw.status       === "fulfilled" ? tsRaw.value       : [];

  if (!(dash || ga4 || gsc || crm)) return null;

  const kpis: EmailKpi[] = (dash?.kpis ?? []).map((k: any) => ({
    label: k.label,
    value: k.value,
    delta: k.delta ? `${k.deltaDirection === "up" ? "▲" : "▼"} ${Math.abs(k.delta)}%` : undefined,
    trend: (k.delta ? k.deltaDirection : "flat") as string,
    sub: "vs. previous period",
  }));

  const organicPlatforms: EmailOrganicPlatform[] = [];
  const p = dash?.platforms ?? {};
  if (p.meta) {
    organicPlatforms.push({ name: "Facebook",  followers: p.meta.facebook.fans ?? 0,  engagement: Number(p.meta.facebook.engagementRate) || 0,  reach: p.meta.facebook.reach ?? 0 });
    organicPlatforms.push({ name: "Instagram", followers: 0,                          engagement: Number(p.meta.instagram.engagementRate) || 0, reach: p.meta.instagram.reach ?? 0 });
  }
  if (p.linkedin) organicPlatforms.push({ name: "LinkedIn", followers: p.linkedin.followers ?? 0, engagement: Number(p.linkedin.engagementRate) || 0, reach: p.linkedin.reach ?? 0 });
  if (p.youtube)  organicPlatforms.push({ name: "YouTube",  followers: p.youtube.channelStats.subscribers ?? 0, engagement: 0, reach: p.youtube.analytics.views ?? 0 });

  const googlePlatforms: EmailGooglePlatform[] = [];
  if (p.ga4) googlePlatforms.push({ id: "ga4", name: "Google Analytics 4", metrics: [
    { label: "Sessions",    value: fmt(p.ga4.totalSessions ?? 0) },
    { label: "Users",       value: fmt(p.ga4.totalUsers ?? 0) },
    { label: "Bounce rate", value: (ga4 as any)?.bounceRate != null ? `${((ga4 as any).bounceRate * 100).toFixed(1)}%` : "—" },
  ]});
  if (p.gsc) googlePlatforms.push({ id: "gsc", name: "Search Console", metrics: [
    { label: "Impressions", value: fmt(p.gsc.impressions ?? 0) },
    { label: "Clicks",      value: fmt(p.gsc.clicks ?? 0) },
    { label: "CTR",         value: p.gsc.ctr != null ? `${Number(p.gsc.ctr).toFixed(1)}%` : "—" },
  ]});
  if (p.youtube) googlePlatforms.push({ id: "youtube", name: "YouTube", metrics: [
    { label: "Views",       value: fmt(p.youtube.analytics.views ?? 0) },
    { label: "Subscribers", value: fmt(p.youtube.channelStats.subscribers ?? 0) },
    { label: "Likes",       value: fmt(p.youtube.analytics.likes ?? 0) },
  ]});

  const ga4Data: EmailGA4Data | undefined = ga4 ? {
    connected: true,
    totalSessions: ga4.totalSessions, totalUsers: ga4.totalUsers,
    newUsers: ga4.newUsers, eventCount: ga4.eventCount,
    keyEvents: ga4.keyEvents, avgEngagementTime: ga4.avgEngagementTime,
    channelBreakdown: ga4.channelBreakdown,
    topPages: ga4.topPages,
  } : undefined;

  const gscData: EmailGSCData | undefined = gsc ? {
    connected: true,
    clicks: gsc.clicks, impressions: gsc.impressions,
    ctr: gsc.ctr, avgPosition: gsc.avgPosition,
    siteUrl: gsc.siteUrl,
    topQueries: gsc.topQueries,
  } : undefined;

  const crmData: EmailCrmData | undefined = crm ? { connected: true, ...crm } : undefined;

  const insights: EmailInsight[] = (aiIns?.insights ?? []).slice(0, 6).map((i: any) => ({
    id: i.id, title: i.title, meta: i.meta ?? "", status: i.status ?? "positive",
  }));

  const timesheet: EmailTimesheetRow[] = (tsRows as any[]).map((r) => ({
    user: r.user, avatar: r.avatar, hours: r.hours,
    month: new Date(r.date).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
  }));

  return renderInsightsEmail({
    kpis, ga4: ga4Data, gsc: gscData,
    organicPlatforms, googlePlatforms,
    crm: crmData, insights, timesheet,
    periodLabel: `Last ${REPORT_DAYS} days · ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
    generatedAt: new Date().toISOString(),
  }, {
    recipientName,
    appUrl: process.env.NEXTAUTH_URL ?? "http://localhost:3015",
  });
}

/** Resolve a user's orgId without a session — the cron has no request context. */
export async function resolveOrgId(userId: string): Promise<string> {
  const conn = await prisma.platformConnection.findFirst({
    where: { userId },
    select: { orgId: true },
  });
  return conn?.orgId ?? "";
}
