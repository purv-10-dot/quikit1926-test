/**
 * Which platforms can answer for a PAST window — and which merely can't.
 *
 * THE POINT OF THIS FILE. Several connectors return a point-in-time snapshot:
 * the current follower count, the current open pipeline. Asked about last week,
 * they return this week's number again. If we fed that through the delta maths
 * we would compute exactly 0% and render "no change" — a fabricated finding
 * indistinguishable from a real flat week. So capability is declared explicitly
 * here, and anything not comparable reports `null`, never `0`.
 *
 * Keep this in sync when a connector gains a date parameter.
 */

export type PeriodSupport =
  /** One API call returns both windows (GA4's two named dateRanges). */
  | "dual-range"
  /** Accepts an explicit window; a comparison costs one extra call. */
  | "windowed"
  /** Snapshot only — cannot answer for a past window at any price. */
  | "fixed";

export const PERIOD_SUPPORT: Record<string, PeriodSupport> = {
  // Tier A — free comparison.
  ga4: "dual-range",

  // Tier B — one extra call each.
  gsc: "windowed",
  googleAds: "windowed",
  metaAds: "windowed",
  youtube: "windowed",

  // Tier C — snapshot APIs, no historical window.
  meta: "fixed",
  linkedin: "fixed",
  gbp: "fixed",
  hubspot: "fixed",
  salesforce: "fixed",
  dynamics: "fixed",
  zoho: "fixed",
  quikcrm: "fixed",
  mailchimp: "fixed",
};

export function supportFor(platform: string): PeriodSupport {
  return PERIOD_SUPPORT[platform] ?? "fixed";
}

/** True when this platform can produce a real baseline. */
export function isComparable(platform: string): boolean {
  return supportFor(platform) !== "fixed";
}

/** True when the baseline costs an extra HTTP call (used to budget the fan-out). */
export function needsSecondCall(platform: string): boolean {
  return supportFor(platform) === "windowed";
}

export const COMPARABLE_PLATFORMS: ReadonlySet<string> = new Set(
  Object.keys(PERIOD_SUPPORT).filter(isComparable),
);
