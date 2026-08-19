/**
 * ⚠️ DEMO DATA — the v15 UI preview's numbers, not the workspace's real data.
 *
 * The preview's dashboard sections (health score, AI daily brief, channel
 * glance, budget pacing, campaigns, lead funnel) have NO API behind them in
 * this app. These figures were ported verbatim from the preview so the page
 * matches the design today.
 *
 * EVERY VALUE HERE IS FICTIONAL AND IS SHOWN TO REAL USERS AS THOUGH IT WERE
 * THEIRS. Replace each export with a fetch as the corresponding endpoint lands;
 * the page reads only from this module, so no component needs to change.
 *
 * Live sections (KPI strip on the "All performance" tab, recommendations,
 * activity) still come from lib/api/* — this file does not touch them.
 */

export type PerformanceView = "all" | "paid" | "organic" | "email";

/** Marketing health score shown in the gauge, 0-100. */
export const HEALTH_SCORE = { value: 78, rating: "Strong", delta: "↗ +6 this week" };

/** AI daily brief bullets. */
export const DAILY_BRIEF = [
  "Content and SEO pipeline efficiency is up 22% after the March refresh — your most efficient channel right now.",
  "CAC in paid search has climbed for three straight weeks, driven by bid inflation on 4 keywords.",
  "Paid social spend is up 9% with flat pipeline — the budget reallocation window closes Friday.",
];

export const BRIEF_ACTION_QUESTION =
  "Why is CAC rising in paid search and what should we do about it?";

export const KPI_BASE = { pipeline: 4.82, revenue: 1.31, cac: 412, roas: 3.8 };

/** Scales the demo figures with the selected date range. */
export const RANGE_MULTIPLIER: Record<number, number> = { 7: 0.24, 30: 1, 90: 2.9, 365: 11.4 };

const MULT_POINTS: Array<[number, number]> = [[7, 0.24], [30, 1], [90, 2.9], [365, 11.4]];

/**
 * Multiplier for an arbitrary day count, interpolating between the presets.
 *
 * The plain RANGE_MULTIPLIER lookup returns 1 for anything that isn't exactly
 * 7/30/90/365, so a 200-day custom range would render 30-day figures. Custom
 * ranges make that reachable, hence the interpolation.
 */
export function rangeMultiplier(days: number): number {
  const d = Math.max(1, days);
  const exact = RANGE_MULTIPLIER[d];
  if (exact !== undefined) return exact;

  const first = MULT_POINTS[0];
  const last = MULT_POINTS[MULT_POINTS.length - 1];
  if (d <= first[0]) return (d / first[0]) * first[1];
  if (d >= last[0]) return (d / last[0]) * last[1];

  for (let i = 0; i < MULT_POINTS.length - 1; i++) {
    const [x0, y0] = MULT_POINTS[i];
    const [x1, y1] = MULT_POINTS[i + 1];
    if (d >= x0 && d <= x1) return y0 + ((d - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 1;
}

/**
 * Fictional period-over-period movement per metric, in percent.
 *
 * FIXED CONSTANTS, never random and never derived from the range multiplier:
 * a re-render must not reshuffle the demo story, and two people looking at the
 * same demo must see the same numbers. One constant per metric — varying them
 * by comparison mode would be inventing a trend shape rather than a data point.
 *
 * Every surface rendering these must still carry <MockBadge /> — the delta is
 * part of the fabricated payload, not a real finding.
 */
export const MOCK_DELTAS: Record<string, number> = {
  pipeline: 12.4,
  revenue: 8.1,
  cac: -4.6,
  roas: 5.2,
  leads: 9.3,
  reach: 14.8,
  engagement: -2.4,
  emailSends: 3.9,
  emailOpenRate: -1.2,
  emailClickRate: 2.7,
  contentPipeline: 22.0,
  healthScore: 6.0,
};

/**
 * The baseline that produces MOCK_DELTAS[key] against `current`.
 *
 * Derived from current rather than stored, so the stated delta stays true no
 * matter how `current` was scaled by rangeMultiplier.
 */
export function mockPrevious(current: number, key: string): number {
  const pct = MOCK_DELTAS[key] ?? 0;
  if (pct <= -100) return 0;
  return current / (1 + pct / 100);
}

/** Pre-formatted mock delta, matching the arrow style used for live KPIs. */
export function mockDeltaLabel(key: string): { delta: string; trend: "up" | "down" | "flat" } {
  const pct = MOCK_DELTAS[key];
  if (pct === undefined || pct === 0) return { delta: "0%", trend: "flat" };
  return { delta: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`, trend: pct > 0 ? "up" : "down" };
}

export const CHANNELS = [
  { name: "Search", color: "#6C5CE0", spend: 420, pipeline: 1400, type: "paid" },
  { name: "Social", color: "#E8A33D", spend: 310, pipeline: 890, type: "paid" },
  { name: "Content", color: "#16A34A", spend: 180, pipeline: 1100, type: "organic" },
  { name: "Events", color: "#8B5CF6", spend: 260, pipeline: 780, type: "paid" },
  { name: "Email", color: "#DC2626", spend: 40, pipeline: 650, type: "organic" },
] as const;

export const ORGANIC_PLATFORMS: Record<string, { followers: number; engagement: number; reach: number }> = {
  Facebook: { followers: 42000, engagement: 3.8, reach: 210000 },
  Instagram: { followers: 68000, engagement: 5.6, reach: 340000 },
  "LinkedIn Company Page": { followers: 15400, engagement: 4.9, reach: 52000 },
  "X (Twitter)": { followers: 8200, engagement: 2.1, reach: 38000 },
};

export const EMAIL_STATS = { sends: 42000, openRate: 28.4, clickRate: 4.1, unsubRate: 0.3, pipeline: 0.62 };

export const EMAIL_CAMPAIGNS = [
  { name: "Monthly product newsletter — July", sends: 18400, openRate: 31.2, clickRate: 5.4 },
  { name: "Lifecycle nurture — trial signups", sends: 9200, openRate: 26.8, clickRate: 4.1 },
  { name: "Re-engagement — dormant leads", sends: 6100, openRate: 19.4, clickRate: 2.6 },
  { name: "Webinar invite — Q3 pipeline series", sends: 5300, openRate: 34.7, clickRate: 7.2 },
  { name: "Customer win-back — churn risk", sends: 3000, openRate: 22.1, clickRate: 3.3 },
];

export const CAMPAIGNS = [
  { id: "c1", name: "Q3 Content refresh", channel: "Content", spend: 42, pipeline: 310, roas: 7.4 },
  { id: "c2", name: "Brand search — core", channel: "Search", spend: 88, pipeline: 260, roas: 3.0 },
  { id: "c3", name: "LinkedIn ABM — Enterprise", channel: "Social", spend: 61, pipeline: 190, roas: 3.1 },
  { id: "c4", name: "Retargeting — all traffic", channel: "Social", spend: 29, pipeline: 74, roas: 2.5 },
  { id: "c5", name: "Field marketing — regional events", channel: "Events", spend: 54, pipeline: 132, roas: 2.4 },
  { id: "c6", name: "Lifecycle nurture — email", channel: "Email", spend: 9, pipeline: 88, roas: 9.8 },
  { id: "c7", name: "Competitor conquest — search", channel: "Search", spend: 73, pipeline: 158, roas: 2.2 },
  { id: "c8", name: "Instagram Reels — brand awareness", channel: "Social", spend: 38, pipeline: 96, roas: 2.5 },
  { id: "c9", name: "Webinar series — Q3 pipeline gen", channel: "Events", spend: 31, pipeline: 142, roas: 4.6 },
  { id: "c10", name: "SEO cluster — comparison pages", channel: "Content", spend: 18, pipeline: 205, roas: 11.4 },
  { id: "c11", name: "Re-engagement — dormant leads", channel: "Email", spend: 6, pipeline: 54, roas: 9.0 },
];

export const LEAD_FUNNEL = [
  { label: "Visitors", value: 248000 },
  { label: "MQLs", value: 6420 },
  { label: "SQLs", value: 1180 },
  { label: "Opportunities", value: 312 },
  { label: "Closed won", value: 64 },
];

export const BUDGET_PACING = {
  spent: "$1.56M",
  remaining: "$0.44M",
  caption: "78% of $2.0M plan",
  percent: 78,
};

/** The preview labels both trend charts by week, not month. */
export const WEEK_LABELS = ["Wk1", "Wk2", "Wk3", "Wk4", "Wk5", "Wk6"];
export const FOLLOWER_TREND = [118, 121, 124, 126, 127, 128.4];
export const EMAIL_SENDS_TREND = [31.0, 33.5, 36.2, 38.8, 40.5, 42.0];
export const PIPELINE_TREND = [3.1, 3.4, 3.9, 4.1, 4.5, 4.82];
export const LEADS_BY_DAY = { Mon: 210, Tue: 340, Wed: 260, Thu: 190, Fri: 380, Sat: 90, Sun: 70 };

/** Connector ids the Email Marketing card offers to connect. */
export const EMAIL_CONNECTOR_IDS = ["mailchimp", "klaviyo", "instantly"];

export const ENGAGEMENT_BY_DAY = { Mon: 3.8, Tue: 4.9, Wed: 4.1, Thu: 4.4, Fri: 5.6, Sat: 3.0, Sun: 2.6 };
export const EMAIL_OPEN_BY_DAY = { Mon: 24.1, Tue: 29.4, Wed: 27.8, Thu: 30.2, Fri: 33.6, Sat: 18.2, Sun: 15.4 };

/** Fallback activity feed with the preview's icons/colours. */
export const ACTIVITY_FALLBACK = [
  { text: "Meta Ads token expired — sync paused", time: "2 hrs ago", icon: "⚠", color: "#DC2626" },
  { text: 'Daniel Osei updated the "Brand search — core" budget', time: "5 hrs ago", icon: "✎", color: "#6C5CE0" },
  { text: "Weekly exec report sent to 3 recipients", time: "Yesterday", icon: "✔", color: "#16A34A" },
  { text: "New anomaly detected: CAC drift in paid search", time: "3 days ago", icon: "⚠", color: "#E8A33D" },
  { text: "Sam Torres published 2 new SEO content pieces", time: "4 days ago", icon: "✎", color: "#6C5CE0" },
  { text: "LinkedIn Ads campaign crossed 3x ROAS threshold", time: "5 days ago", icon: "✔", color: "#16A34A" },
  { text: "New integration connected: Google Search Console", time: "6 days ago", icon: "🔗", color: "#4285F4" },
];

export const RECOMMENDATIONS_FALLBACK = [
  {
    id: "r1",
    label: "Budget reallocation opportunity",
    body: "Paid social spend +9% with flat pipeline. Shifting $80K to content is projected to add $260K in pipeline this quarter.",
    suggestedQuestion: "Model a budget reallocation from paid social to content",
  },
  {
    id: "r2",
    label: "CAC risk in paid search",
    body: "CAC has climbed for three straight weeks due to bid inflation on 4 keywords — worth a bid review this week.",
    suggestedQuestion: "Why is CAC rising in paid search?",
  },
  {
    id: "r3",
    label: "Repurpose a winner",
    body: '"Q3 Content refresh" is returning 7.4x ROAS. Repurposing it into a LinkedIn carousel could extend its reach cheaply.',
    suggestedQuestion: "How should we repurpose the Q3 Content refresh campaign?",
  },
];
