/**
 * Per-platform metric groups for the Phase 3 snapshot comparison feature —
 * an ADDITIVE extension alongside the original 6-KPI comparison (see
 * PHASE_LOG.md). Adapts each platform's raw fields (from DashboardData.
 * platforms, the same shape a manual-view/scheduled-send snapshot already
 * stores — see lib/data/aggregator.ts / lib/types.ts) into the same
 * SnapshotKpi shape lib/reports/compare.ts's computeKpiDeltas already
 * expects, so the delta math is reused verbatim rather than reimplemented —
 * computeKpiDeltas itself is untouched by this file.
 *
 * Never fetches anything — reads only the already-stored `platforms` object
 * on a snapshot's frozen `data`.
 */

import { computeKpiDeltas, type ComparisonKpiRow, type SnapshotKpi } from "@/lib/reports/compare";
import { fmtShort } from "@/lib/data/formatters";

export type PlatformGroupKey = "ga4" | "gsc" | "facebook" | "instagram" | "youtube";

export interface PlatformGroup {
  key: PlatformGroupKey;
  title: string;
  rows: ComparisonKpiRow[];
}

/** `n` parsed as a real number, or `null` for anything unusable (NaN, "—", missing). Distinct from 0 — a genuine zero must still compare, but "—" (unavailable) must not silently become 0%. */
function num(n: unknown): number | null {
  if (n == null) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function pctString(n: number | null): string {
  return n == null ? "—" : `${n.toFixed(1)}%`;
}

/** One metric, adapted into computeKpiDeltas' SnapshotKpi shape. `rawValue: null` on either side means "not available" — computeKpiDeltas already skips any label that doesn't appear on both sides by matching on `label` in its Map lookup, so pairing this metric only when BOTH snapshots have a real number for it reuses that exact same skip behavior instead of adding a parallel null-check path. */
function kpi(label: string, value: number | null, unit: SnapshotKpi["unit"], display?: (n: number) => string): SnapshotKpi | null {
  if (value == null) return null;
  return { label, value: display ? display(value) : fmtShort(value), rawValue: value, unit };
}

/**
 * Builds the five additive platform-metric SnapshotKpi lists for one
 * snapshot's `data.platforms`. Returns an empty array for a metric whose
 * source field is missing/unavailable in this snapshot (e.g. platform not
 * connected, or an older snapshot predating a field) — never a fabricated
 * zero.
 */
export function extractPlatformMetrics(platforms: any): Record<PlatformGroupKey, SnapshotKpi[]> {
  const p = platforms ?? {};

  const ga4 = p.ga4
    ? [
        kpi("Sessions", num(p.ga4.totalSessions), "shortNumber"),
        kpi("Users", num(p.ga4.totalUsers), "shortNumber"),
        // bounceRate is a 0–1 ratio (or null when there were no sessions to
        // weight — lib/types.ts's own doc comment on GA4Analytics.bounceRate
        // says render an em-dash, not 0%, for that case; num() already
        // returns null for a stored `null`, so pctString does that for free).
        kpi("Bounce Rate", p.ga4.bounceRate != null ? num(p.ga4.bounceRate)! * 100 : null, "number", pctString),
      ].filter((k): k is SnapshotKpi => k !== null)
    : [];

  const gsc = p.gsc
    ? [
        kpi("Clicks", num(p.gsc.clicks), "shortNumber"),
        kpi("Impressions", num(p.gsc.impressions), "shortNumber"),
        // ctr/avgPosition are already-scaled strings from the connector
        // (e.g. "3.2", or "—" when unavailable) — num() returns null for the
        // em-dash case rather than NaN.
        kpi("CTR", num(p.gsc.ctr), "number", pctString),
        kpi("Avg. Position", num(p.gsc.avgPosition), "number", (n) => n.toFixed(1)),
      ].filter((k): k is SnapshotKpi => k !== null)
    : [];

  const facebook = p.meta?.facebook
    ? [
        kpi("Reach", num(p.meta.facebook.reach), "shortNumber"),
        kpi("Engagement Rate", num(p.meta.facebook.engagementRate), "number", pctString),
        kpi("Page Fans", num(p.meta.facebook.fans), "shortNumber"),
      ].filter((k): k is SnapshotKpi => k !== null)
    : [];

  // `followers` exists on the real runtime Instagram payload (see
  // lib/connectors/metaConnector.ts's instagramInsights()) but is missing
  // from InstagramData's declared type (lib/types.ts) — the same known gap
  // app/api/overview/route.ts already reads around via an `any` cast for
  // this exact field. Matched here rather than guessing a different name.
  const instagram = p.meta?.instagram
    ? [
        kpi("Reach", num(p.meta.instagram.reach), "shortNumber"),
        kpi("Followers", num((p.meta.instagram as any).followers), "shortNumber"),
        kpi("Engagement Rate", num(p.meta.instagram.engagementRate), "number", pctString),
      ].filter((k): k is SnapshotKpi => k !== null)
    : [];

  const youtube = p.youtube
    ? [
        kpi("Views", num(p.youtube.analytics?.views), "shortNumber"),
        kpi("Subscribers", num(p.youtube.channelStats?.subscribers), "shortNumber"),
        kpi("Watch Time", num(p.youtube.analytics?.watchMinutes), "shortNumber", (n) => `${fmtShort(n)} min`),
      ].filter((k): k is SnapshotKpi => k !== null)
    : [];

  return { ga4, gsc, facebook, instagram, youtube };
}

const GROUP_TITLES: Record<PlatformGroupKey, string> = {
  ga4: "Google Analytics 4",
  gsc: "Search Console",
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
};

/**
 * Builds every additive platform group's comparison rows for a pair of
 * snapshots, reusing computeKpiDeltas (unchanged) per group — same delta
 * math as the original 6-KPI table, just applied to more metric lists. A
 * group with zero rows (platform not connected/no data in either snapshot)
 * is omitted entirely rather than rendered as an empty section.
 */
export function computePlatformGroupDeltas(platformsA: any, platformsB: any): PlatformGroup[] {
  const a = extractPlatformMetrics(platformsA);
  const b = extractPlatformMetrics(platformsB);

  return (Object.keys(GROUP_TITLES) as PlatformGroupKey[])
    .map((key) => ({ key, title: GROUP_TITLES[key], rows: computeKpiDeltas(a[key], b[key]) }))
    .filter((g) => g.rows.length > 0);
}
