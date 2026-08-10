import { fmtShort, fmtCurrency } from "@/lib/data/formatters";
import type { DashboardData } from "@/lib/types";
import type {
  InsightsReport,
  ReportSection,
  PlatformBlock,
  MetricCard,
  SectionKey,
} from "@/lib/insights/types";

// ─── Grouping: which Prisma platform enums belong to which report section ─────

export const SECTION_PLATFORMS: Record<SectionKey, string[]> = {
  seo: ["GOOGLE_ANALYTICS", "GOOGLE_SEARCH_CONSOLE", "GOOGLE_BUSINESS_PROFILE"],
  social: ["LINKEDIN", "META_FACEBOOK", "META_INSTAGRAM", "YOUTUBE"],
  sales: [
    "HUBSPOT",
    "SALESFORCE",
    "ZOHO",
    "DYNAMICS",
    "QUIKCRM",
    "PIPEDRIVE",
    "MAILCHIMP",
  ],
};

const SECTION_META: Record<SectionKey, { title: string; emoji: string; accent: string }> = {
  seo: { title: "SEO Team Performance", emoji: "🔍", accent: "#4285F4" },
  social: { title: "Social Media Team Performance", emoji: "📣", accent: "#7F77DD" },
  sales: { title: "Sales & CRM Performance", emoji: "💼", accent: "#1D9E75" },
};

// ─── Small formatting helpers ─────────────────────────────────────────────────

function pct(n: number): string {
  return `${n % 1 === 0 ? n : n.toFixed(1)}%`;
}

function fmtDelta(percent: number | undefined | null): {
  delta: string | null;
  deltaDirection: MetricCard["deltaDirection"];
} {
  if (percent === undefined || percent === null || percent === 0) {
    return { delta: percent === 0 ? "0%" : null, deltaDirection: "flat" };
  }
  const dir = percent > 0 ? "up" : "down";
  const sign = percent > 0 ? "+" : "";
  return { delta: `${sign}${percent % 1 === 0 ? percent : percent.toFixed(1)}%`, deltaDirection: dir };
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

// ─── SEO ──────────────────────────────────────────────────────────────────────

function buildSeoBlocks(data: DashboardData, connected: Set<string>): PlatformBlock[] {
  const p = data.platforms ?? {};
  const blocks: PlatformBlock[] = [];

  if (connected.has("GOOGLE_ANALYTICS")) {
    const ga4 = p.ga4;
    if (ga4) {
      const d = fmtDelta(ga4.deltaPercent);
      blocks.push({
        platform: "Google Analytics 4",
        cards: [
          { label: "Sessions", value: fmtShort(ga4.totalSessions), delta: d.delta, deltaDirection: d.deltaDirection, hint: "vs. previous period" },
          { label: "Users", value: fmtShort(ga4.totalUsers) },
          { label: "New Users", value: fmtShort(ga4.newUsers ?? 0) },
          { label: "Avg. Engagement", value: `${Math.round(ga4.avgEngagementTime ?? 0)}s`, hint: "per active user" },
        ],
      });
    } else {
      blocks.push({ platform: "Google Analytics 4", dataUnavailable: true, note: "Connected, but no analytics returned — pick a GA4 property with traffic under Connections → Configure.", cards: [] });
    }
  }

  if (connected.has("GOOGLE_SEARCH_CONSOLE")) {
    const gsc = p.gsc;
    if (gsc) {
      blocks.push({
        platform: "Google Search Console",
        cards: [
          { label: "Clicks", value: fmtShort(gsc.clicks) },
          { label: "Impressions", value: fmtShort(gsc.impressions) },
          { label: "CTR", value: pct(num(gsc.ctr)) },
          { label: "Avg. Position", value: num(gsc.avgPosition).toFixed(1), hint: "lower is better" },
        ],
      });
    } else {
      blocks.push({ platform: "Google Search Console", dataUnavailable: true, note: "Connected, but Search Console returned no data for the selected site.", cards: [] });
    }
  }

  if (connected.has("GOOGLE_BUSINESS_PROFILE")) {
    const gbp = p.gbp;
    if (gbp) {
      blocks.push({
        platform: "Google Business Profile",
        cards: [
          { label: "Searches", value: fmtShort(gbp.searches) },
          { label: "Calls", value: fmtShort(gbp.calls) },
          { label: "Reviews", value: String(gbp.reviews) },
          { label: "Rating", value: gbp.rating ? gbp.rating.toFixed(1) : "—", hint: "out of 5" },
        ],
      });
    }
  }

  return blocks;
}

function seoSummary(data: DashboardData, blocks: PlatformBlock[]): { summary: string; suggestions: string[] } {
  const p = data.platforms ?? {};
  const parts: string[] = [];
  const suggestions: string[] = [];

  if (p.ga4) {
    const dir = (p.ga4.deltaPercent ?? 0) >= 0 ? "up" : "down";
    parts.push(`Website traffic is ${dir} ${pct(Math.abs(p.ga4.deltaPercent ?? 0))} with ${fmtShort(p.ga4.totalSessions)} sessions.`);
    if (p.ga4.totalSessions === 0) suggestions.push("GA4 shows zero sessions — confirm the correct property is selected and tracking is live.");
    else if ((p.ga4.deltaPercent ?? 0) < -10) suggestions.push("Traffic dropped notably vs. the previous period — review recent content or technical changes.");
  }
  if (p.gsc) {
    parts.push(`Search Console recorded ${fmtShort(p.gsc.clicks)} clicks from ${fmtShort(p.gsc.impressions)} impressions (CTR ${pct(num(p.gsc.ctr))}).`);
    const topQuery = p.gsc.topQueries?.[0]?.query;
    if (topQuery) suggestions.push(`Double down on "${topQuery}" — it's your top-performing query this period.`);
    if (num(p.gsc.avgPosition) > 10) suggestions.push("Average search position is outside the first page — prioritise on-page SEO for near-page-1 keywords.");
    if (num(p.gsc.ctr) < 2 && p.gsc.impressions > 0) suggestions.push("CTR is low relative to impressions — refresh title tags and meta descriptions on top pages.");
  }
  if (p.gbp && p.gbp.reviews === 0) suggestions.push("No new Google Business reviews this period — ask recent customers for a review.");

  const summary = parts.length ? parts.join(" ") : "SEO channels are connected — metrics will populate as data syncs.";
  return { summary, suggestions };
}

// ─── Social ─────────────────────────────────────────────────────────────────────

function buildSocialBlocks(data: DashboardData, connected: Set<string>): PlatformBlock[] {
  const p = data.platforms ?? {};
  const blocks: PlatformBlock[] = [];

  if (connected.has("LINKEDIN")) {
    const li = p.linkedin;
    if (li && (li.impressions > 0 || li.followers > 0)) {
      blocks.push({
        platform: "LinkedIn",
        note: li.impressions === 0 ? "No post activity in this period — figures reflect the company page." : null,
        cards: [
          { label: "Followers", value: fmtShort(li.followers) },
          { label: "Impressions", value: fmtShort(li.impressions) },
          { label: "Engagements", value: fmtShort(li.engagements) },
          { label: "Engagement Rate", value: pct(num(li.engagementRate)) },
        ],
      });
    } else {
      // LinkedIn's org/page analytics require Community Management API approval;
      // until then only profile-level access is granted and no page stats return.
      blocks.push({
        platform: "LinkedIn",
        dataUnavailable: true,
        note: "Connected, but company-page analytics aren't available yet — LinkedIn's Community Management API access is required. Follower & impression data will appear once approved.",
        cards: [],
      });
    }
  }

  if (connected.has("META_FACEBOOK") || connected.has("META_INSTAGRAM")) {
    const meta = p.meta;
    if (meta) {
      if (connected.has("META_FACEBOOK")) {
        const fb = meta.facebook;
        const quiet = fb.reach === 0 && (fb.topPosts?.length ?? 0) === 0;
        blocks.push({
          platform: "Facebook",
          note: quiet ? "No new posts published in this period." : null,
          cards: [
            { label: "Reach", value: fmtShort(fb.reach) },
            { label: "Engaged Users", value: fmtShort(fb.engagedUsers) },
            { label: "Engagement Rate", value: pct(num(fb.engagementRate)) },
            { label: "Page Fans", value: fmtShort(fb.fans) },
          ],
        });
      }
      if (connected.has("META_INSTAGRAM")) {
        const ig = meta.instagram;
        const quiet = ig.reach === 0 && (ig.topPosts?.length ?? 0) === 0;
        blocks.push({
          platform: "Instagram",
          note: quiet ? "No new posts published in this period." : null,
          cards: [
            { label: "Reach", value: fmtShort(ig.reach) },
            { label: "Accounts Engaged", value: fmtShort(ig.accountsEngaged) },
            { label: "Engagement Rate", value: pct(num(ig.engagementRate)) },
            { label: "Profile Views", value: fmtShort(ig.profileViews) },
          ],
        });
      }
    } else {
      blocks.push({ platform: "Meta (Facebook / Instagram)", dataUnavailable: true, note: "Connected, but Meta returned no insights — confirm a Page/Business account is selected.", cards: [] });
    }
  }

  if (connected.has("YOUTUBE")) {
    const yt = p.youtube;
    if (yt) {
      const quiet = yt.analytics.views === 0;
      const d = fmtDelta(yt.analytics.viewsDeltaPercent);
      blocks.push({
        platform: "YouTube",
        note: quiet ? "No views recorded in this period — no new uploads or promotion." : null,
        cards: [
          { label: "Views", value: fmtShort(yt.analytics.views), delta: d.delta, deltaDirection: d.deltaDirection },
          { label: "Watch Time", value: `${fmtShort(Math.round(yt.analytics.watchMinutes))} min` },
          { label: "Subscribers Gained", value: fmtShort(yt.analytics.subscribersGained) },
          { label: "Total Subscribers", value: fmtShort(yt.channelStats.subscribers) },
        ],
      });
    } else {
      blocks.push({ platform: "YouTube", dataUnavailable: true, note: "Connected, but YouTube analytics returned no data for this channel.", cards: [] });
    }
  }

  return blocks;
}

function socialSummary(data: DashboardData, connected: Set<string>): { summary: string; suggestions: string[] } {
  const p = data.platforms ?? {};
  const parts: string[] = [];
  const suggestions: string[] = [];

  let totalReach = 0;
  let anyActivity = false;

  if (p.meta) {
    totalReach += p.meta.combinedReach ?? 0;
    if ((p.meta.combinedReach ?? 0) > 0) anyActivity = true;
  }
  if (p.linkedin) {
    totalReach += p.linkedin.impressions ?? 0;
    if ((p.linkedin.impressions ?? 0) > 0) anyActivity = true;
  }
  if (p.youtube) {
    totalReach += p.youtube.analytics.views ?? 0;
    if ((p.youtube.analytics.views ?? 0) > 0) anyActivity = true;
  }

  if (anyActivity) {
    parts.push(`Social channels reached ${fmtShort(totalReach)} people this period.`);
  } else {
    // Explicitly handle the "no posting happened" case without alarming language.
    parts.push("No new social activity was published in this period, so reach and engagement are flat — this is expected on weeks without posts.");
    suggestions.push("Schedule at least one post per active channel to keep reach and engagement momentum.");
  }

  if (p.meta) {
    const fbEr = num(p.meta.facebook.engagementRate);
    const igEr = num(p.meta.instagram.engagementRate);
    const best = igEr >= fbEr ? "Instagram" : "Facebook";
    if (fbEr > 0 || igEr > 0) suggestions.push(`${best} is your stronger Meta channel by engagement rate — prioritise it for the next campaign.`);
    const topPost = [...(p.meta.facebook.topPosts ?? []), ...(p.meta.instagram.topPosts ?? [])].sort((a, b) => b.reach - a.reach)[0];
    if (topPost?.message) suggestions.push(`Repurpose your top post ("${topPost.message.slice(0, 60)}…") into other formats.`);
  }
  if (connected.has("LINKEDIN") && !p.linkedin) {
    suggestions.push("Request LinkedIn Community Management API access to unlock company-page analytics in this report.");
  }
  if (p.youtube && p.youtube.analytics.subscribersGained > 0) {
    parts.push(`YouTube added ${fmtShort(p.youtube.analytics.subscribersGained)} subscribers.`);
  }

  return { summary: parts.join(" "), suggestions };
}

// ─── Sales & CRM ─────────────────────────────────────────────────────────────

function buildSalesBlocks(data: DashboardData, connected: Set<string>): PlatformBlock[] {
  const p = data.platforms ?? {};
  const blocks: PlatformBlock[] = [];

  if (connected.has("HUBSPOT")) {
    const hs = p.hubspot;
    if (hs) {
      blocks.push({
        platform: "HubSpot",
        cards: [
          { label: "New Leads", value: String(hs.leads) },
          { label: "Pipeline", value: fmtCurrency(hs.pipeline) },
          { label: "Revenue Won", value: fmtCurrency(hs.revenue) },
          { label: "Win Rate", value: pct(hs.winRate) },
        ],
      });
    } else {
      blocks.push({ platform: "HubSpot", dataUnavailable: true, note: "Connected, but HubSpot returned no CRM data.", cards: [] });
    }
  }

  if (connected.has("SALESFORCE")) {
    const sf = p.salesforce;
    if (sf) {
      blocks.push({
        platform: "Salesforce",
        cards: [
          { label: "Open Opportunities", value: String(sf.opportunities ?? 0) },
          { label: "Pipeline", value: fmtCurrency(sf.pipeline) },
          { label: "Revenue Won", value: fmtCurrency(sf.revenue) },
        ],
      });
    }
  }

  if (connected.has("ZOHO")) {
    const z = p.zoho;
    if (z) {
      blocks.push({
        platform: "Zoho CRM",
        cards: [
          { label: "Leads", value: String(z.leads ?? 0) },
          { label: "Pipeline", value: fmtCurrency(z.pipeline) },
          { label: "Revenue Won", value: fmtCurrency(z.revenue) },
        ],
      });
    }
  }

  if (connected.has("DYNAMICS")) {
    const d = p.dynamics;
    if (d) {
      blocks.push({
        platform: "Dynamics 365",
        cards: [
          { label: "Accounts", value: String(d.totalAccounts) },
          { label: "Open Opportunities", value: String(d.openOpportunities) },
          { label: "Pipeline", value: fmtCurrency(d.pipeline) },
          { label: "Revenue Won", value: fmtCurrency(d.revenue) },
        ],
      });
    }
  }

  if (connected.has("QUIKCRM")) {
    const q = p.quikcrm;
    if (q) {
      blocks.push({
        platform: "QuikCRM",
        cards: [
          { label: "New Leads", value: String(q.leads) },
          { label: "Pipeline", value: fmtCurrency(q.pipeline) },
          { label: "Revenue Won", value: fmtCurrency(q.revenue) },
          { label: "Deals Won", value: String(q.wonDeals) },
        ],
      });
    }
  }

  if (connected.has("MAILCHIMP")) {
    const mc = p.mailchimp;
    if (mc) {
      blocks.push({
        platform: "Mailchimp (Email Marketing)",
        cards: [
          { label: "Subscribers", value: fmtShort(mc.subscribers) },
          { label: "Open Rate", value: pct(mc.openRate) },
          { label: "Click Rate", value: pct(mc.clickRate) },
          { label: "Campaigns", value: String(mc.campaigns) },
        ],
      });
    }
  }

  return blocks;
}

function salesSummary(data: DashboardData): { summary: string; suggestions: string[] } {
  const p = data.platforms ?? {};
  const suggestions: string[] = [];

  const leads = (p.hubspot?.leads ?? 0) + (p.zoho?.leads ?? 0) + (p.quikcrm?.leads ?? 0) + (p.dynamics?.openOpportunities ?? 0);
  const pipeline = (p.hubspot?.pipeline ?? 0) + (p.salesforce?.pipeline ?? 0) + (p.zoho?.pipeline ?? 0) + (p.dynamics?.pipeline ?? 0) + (p.quikcrm?.pipeline ?? 0);
  const revenue = (p.hubspot?.revenue ?? 0) + (p.salesforce?.revenue ?? 0) + (p.zoho?.revenue ?? 0) + (p.dynamics?.revenue ?? 0) + (p.quikcrm?.revenue ?? 0);

  const summary = `Sales generated ${leads} new lead${leads === 1 ? "" : "s"}, ${fmtCurrency(pipeline)} in open pipeline, and ${fmtCurrency(revenue)} in won revenue this period.`;

  if (leads === 0) suggestions.push("No new leads landed this period — review lead-gen campaigns and top-of-funnel sources.");
  if (pipeline > 0 && revenue === 0) suggestions.push("Pipeline is building but nothing has closed — prioritise the deals nearest to close.");
  if (p.hubspot && p.hubspot.winRate > 0 && p.hubspot.winRate < 20) suggestions.push("Win rate is under 20% — qualify leads more tightly before they enter the pipeline.");
  if (p.mailchimp && p.mailchimp.openRate > 0 && p.mailchimp.openRate < 15) suggestions.push("Email open rate is below 15% — test subject lines and send times.");

  return { summary, suggestions };
}

// ─── Public API ─────────────────────────────────────────────────────────────

const SECTION_BUILDERS: Record<
  SectionKey,
  {
    blocks: (d: DashboardData, c: Set<string>) => PlatformBlock[];
    summary: (d: DashboardData, c: Set<string>, b: PlatformBlock[]) => { summary: string; suggestions: string[] };
  }
> = {
  seo: { blocks: buildSeoBlocks, summary: (d, _c, b) => seoSummary(d, b) },
  social: { blocks: buildSocialBlocks, summary: (d, c) => socialSummary(d, c) },
  sales: { blocks: buildSalesBlocks, summary: (d) => salesSummary(d) },
};

export interface GenerateOptions {
  periodLabel: string;
  frequencyLabel: string;
  generatedAt: string;
}

/**
 * Turn one aggregated dashboard payload into a structured, rule-based report.
 * Pure and synchronous — no network, no AI. Only sections whose platform group
 * has at least one connected platform are included.
 */
export function generateInsights(
  data: DashboardData,
  connected: Set<string>,
  opts: GenerateOptions
): InsightsReport {
  const sections: ReportSection[] = [];

  for (const key of ["seo", "social", "sales"] as SectionKey[]) {
    const anyConnected = SECTION_PLATFORMS[key].some((pl) => connected.has(pl));
    if (!anyConnected) continue;

    const builder = SECTION_BUILDERS[key];
    const blocks = builder.blocks(data, connected);
    const { summary, suggestions } = builder.summary(data, connected, blocks);
    const meta = SECTION_META[key];

    sections.push({
      key,
      title: meta.title,
      emoji: meta.emoji,
      accent: meta.accent,
      blocks,
      summary,
      suggestions,
    });
  }

  const overallSummary = sections.length
    ? `This ${opts.frequencyLabel.toLowerCase()} report covers ${sections.map((s) => s.title.replace(" Team Performance", "").replace(" Performance", "")).join(", ")} for ${opts.periodLabel}.`
    : "No platforms are connected yet, so there is nothing to report.";

  return {
    periodLabel: opts.periodLabel,
    frequencyLabel: opts.frequencyLabel,
    generatedAt: opts.generatedAt,
    sections,
    overallSummary,
    empty: sections.length === 0,
  };
}
