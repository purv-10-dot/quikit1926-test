import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAggregatedDashboard } from "@/lib/data/aggregator";
import { getActiveWorkspaceId } from "@/lib/workspace";
import type { PlatformCard } from "@/lib/api/overview";

export const runtime = "nodejs";
export const maxDuration = 60;

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId  = session.user.id;
  const orgId   = (session.user.orgId as string) ?? "";
  const days    = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 30), 1), 365);
  const workspaceId = await getActiveWorkspaceId(userId, orgId);

  const connectedCount = await prisma.platformConnection.count({
    where: { userId, workspaceId, status: "CONNECTED" },
  }).catch(() => 0);

  if (connectedCount === 0) {
    return NextResponse.json({ connected: false, kpis: [], organicPlatforms: [], googlePlatforms: [], paidPlatforms: [], crmPlatforms: [], emailPlatforms: [], localPlatforms: [] });
  }

  const data = await getAggregatedDashboard(userId, days, workspaceId);

  const kpis = (data.kpis ?? []).map((k) => ({
    label: k.label,
    value: k.value,
    delta: k.delta ? `${k.deltaDirection === "up" ? "▲" : "▼"} ${Math.abs(k.delta)}%` : "",
    trend: (k.delta ? k.deltaDirection : "flat") as "up" | "down" | "flat",
    sub: "vs. previous period",
  }));

  const p = data.platforms ?? {};

  // ── Google organic ───────────────────────────────────────────────────────────
  const googlePlatforms: PlatformCard[] = [];

  if (p.ga4) {
    const ga4 = p.ga4;
    googlePlatforms.push({
      id: "ga4", name: "Google Analytics 4", color: "#4285F4",
      metrics: [
        { label: "Sessions",    value: fmt(ga4.totalSessions ?? 0) },
        { label: "Users",       value: fmt(ga4.totalUsers    ?? 0) },
        { label: "Bounce rate", value: ga4.bounceRate != null ? `${(ga4.bounceRate * 100).toFixed(1)}%` : "—" },
        { label: "Avg. session",value: ga4.avgSessionDuration != null ? `${Math.round(ga4.avgSessionDuration)}s` : "—" },
      ],
    });
  }

  if (p.gsc) {
    const gsc = p.gsc;
    googlePlatforms.push({
      id: "gsc", name: "Search Console", color: "#34A853",
      metrics: [
        { label: "Clicks",      value: fmt(gsc.clicks      ?? 0) },
        { label: "Impressions", value: fmt(gsc.impressions ?? 0) },
        { label: "Avg. CTR",    value: gsc.ctr != null ? `${Number(gsc.ctr).toFixed(1)}%` : "—" },
        { label: "Avg. pos.",   value: gsc.avgPosition != null ? Number(gsc.avgPosition).toFixed(1) : "—" },
      ],
    });
  }

  if (p.youtube) {
    const yt = p.youtube;
    googlePlatforms.push({
      id: "youtube", name: "YouTube", color: "#FF0000",
      metrics: [
        { label: "Views",       value: fmt(yt.analytics.views         ?? 0) },
        { label: "Subscribers", value: fmt(yt.channelStats.subscribers ?? 0) },
        { label: "Likes",       value: fmt(yt.analytics.likes         ?? 0) },
        { label: "Comments",    value: fmt(yt.analytics.comments      ?? 0) },
      ],
    });
  }

  // ── Organic social ───────────────────────────────────────────────────────────
  const organicPlatforms: PlatformCard[] = [];

  if (p.meta) {
    const fb = (p.meta as any).facebook;
    const ig = (p.meta as any).instagram;
    if (fb) organicPlatforms.push({
      id: "facebook", name: "Facebook", color: "#1877F2",
      metrics: [
        { label: "Fans",        value: fmt(fb.fans        ?? 0) },
        { label: "Reach",       value: fmt(fb.reach       ?? 0) },
        { label: "Engagement",  value: `${Number(fb.engagementRate ?? 0).toFixed(1)}%` },
        { label: "Page views",  value: fmt(fb.pageViews   ?? 0) },
      ],
    });
    if (ig) organicPlatforms.push({
      id: "instagram", name: "Instagram", color: "#E1306C",
      metrics: [
        { label: "Followers",   value: fmt(ig.followers      ?? 0) },
        { label: "Reach",       value: fmt(ig.reach          ?? 0) },
        { label: "Engagement",  value: `${Number(ig.engagementRate ?? 0).toFixed(1)}%` },
        { label: "Impressions", value: fmt(ig.impressions    ?? 0) },
      ],
    });
  }

  if (p.linkedin) {
    const li = p.linkedin;
    organicPlatforms.push({
      id: "linkedin", name: "LinkedIn", color: "#0A66C2",
      metrics: [
        { label: "Followers",  value: fmt((li as any).followers     ?? 0) },
        { label: "Reach",      value: fmt((li as any).reach         ?? 0) },
        { label: "Engagement", value: `${Number((li as any).engagementRate ?? 0).toFixed(1)}%` },
      ],
    });
  }

  // ── Paid advertising ─────────────────────────────────────────────────────────
  const paidPlatforms: PlatformCard[] = [];

  if ((p as any).googleAds) {
    const ga = (p as any).googleAds;
    paidPlatforms.push({
      id: "google_ads", name: "Google Ads", color: "#FBBC04",
      metrics: [
        { label: "Spend",        value: fmtMoney(ga.spend        ?? 0) },
        { label: "Clicks",       value: fmt(ga.clicks            ?? 0) },
        { label: "Impressions",  value: fmt(ga.impressions       ?? 0) },
        { label: "Conversions",  value: fmt(ga.conversions       ?? 0) },
        { label: "CTR",          value: `${Number(ga.ctr ?? 0).toFixed(1)}%` },
        { label: "ROAS",         value: `${Number(ga.roas ?? 0).toFixed(2)}x` },
      ],
    });
  }

  if ((p as any).metaAds) {
    const ma = (p as any).metaAds;
    paidPlatforms.push({
      id: "meta_ads", name: "Meta Ads", color: "#0668E1",
      metrics: [
        { label: "Spend",       value: fmtMoney(ma.spend      ?? 0) },
        { label: "Clicks",      value: fmt(ma.clicks          ?? 0) },
        { label: "Impressions", value: fmt(ma.impressions     ?? 0) },
        { label: "Conversions", value: fmt(ma.conversions     ?? 0) },
        { label: "CTR",         value: `${Number(ma.ctr ?? 0).toFixed(1)}%` },
        { label: "ROAS",        value: `${Number(ma.roas ?? 0).toFixed(2)}x` },
      ],
    });
  }

  // ── CRM / Leads ──────────────────────────────────────────────────────────────
  const crmPlatforms: PlatformCard[] = [];

  if (p.hubspot) {
    const hs = p.hubspot;
    const leads = (hs as any).leads ?? {};
    crmPlatforms.push({
      id: "hubspot", name: "HubSpot", color: "#FF7A59",
      metrics: [
        { label: "New leads",   value: fmt(leads.newLeads        ?? 0) },
        { label: "Open deals",  value: fmt(leads.openDeals       ?? 0) },
        { label: "Won deals",   value: fmt(leads.wonDeals        ?? 0) },
        { label: "Pipeline",    value: fmtMoney(leads.pipelineValue ?? 0) },
      ],
    });
  }

  if (p.salesforce) {
    const sf = p.salesforce;
    crmPlatforms.push({
      id: "salesforce", name: "Salesforce", color: "#00A1E0",
      metrics: [
        { label: "Opportunities", value: fmt((sf as any).opportunities ?? 0) },
        { label: "Pipeline",      value: fmtMoney((sf as any).pipeline ?? 0) },
        { label: "Revenue",       value: fmtMoney((sf as any).revenue  ?? 0) },
      ],
    });
  }

  if (p.dynamics) {
    const dy = p.dynamics;
    crmPlatforms.push({
      id: "dynamics", name: "Dynamics 365", color: "#0078D4",
      metrics: [
        { label: "Leads",     value: fmt((dy as any).leads        ?? 0) },
        { label: "Opps",      value: fmt((dy as any).opportunities ?? 0) },
        { label: "Revenue",   value: fmtMoney((dy as any).revenue ?? 0) },
      ],
    });
  }

  if (p.zoho) {
    const zo = p.zoho;
    crmPlatforms.push({
      id: "zoho", name: "Zoho CRM", color: "#E42527",
      metrics: [
        { label: "Leads",     value: fmt((zo as any).leads       ?? 0) },
        { label: "Contacts",  value: fmt((zo as any).contacts    ?? 0) },
        { label: "Deals",     value: fmt((zo as any).deals       ?? 0) },
      ],
    });
  }

  if (p.quikcrm) {
    const qc = p.quikcrm;
    crmPlatforms.push({
      id: "quikcrm", name: "QuikCRM", color: "#6366F1",
      metrics: [
        { label: "Leads",     value: fmt((qc as any).leads    ?? 0) },
        { label: "Contacts",  value: fmt((qc as any).contacts ?? 0) },
        { label: "Deals",     value: fmt((qc as any).deals    ?? 0) },
      ],
    });
  }

  // ── Email marketing ──────────────────────────────────────────────────────────
  const emailPlatforms: PlatformCard[] = [];

  if (p.mailchimp) {
    const mc = p.mailchimp;
    emailPlatforms.push({
      id: "mailchimp", name: "Mailchimp", color: "#FFE01B",
      metrics: [
        { label: "Subscribers", value: fmt((mc as any).subscribers ?? 0) },
        { label: "Open rate",   value: `${Number((mc as any).openRate  ?? 0).toFixed(1)}%` },
        { label: "Click rate",  value: `${Number((mc as any).clickRate ?? 0).toFixed(1)}%` },
        { label: "Campaigns",   value: fmt((mc as any).campaigns ?? 0) },
      ],
    });
  }

  // ── Local / GBP ──────────────────────────────────────────────────────────────
  const localPlatforms: PlatformCard[] = [];

  if (p.gbp) {
    const gbp = p.gbp;
    localPlatforms.push({
      id: "gbp", name: "Google Business Profile", color: "#4285F4",
      metrics: [
        { label: "Searches",  value: fmt(gbp.searches       ?? 0) },
        { label: "Calls",     value: fmt(gbp.calls          ?? 0) },
        { label: "Directions",value: fmt(gbp.directions     ?? 0) },
        { label: "Reviews",   value: fmt(gbp.reviews        ?? 0) },
        { label: "Rating",    value: gbp.rating ? Number(gbp.rating).toFixed(1) : "—" },
      ],
    });
  }

  return NextResponse.json({ connected: true, kpis, googlePlatforms, organicPlatforms, paidPlatforms, crmPlatforms, emailPlatforms, localPlatforms });
}
