/**
 * A saved report's scope — what it covers and which numbers it shows.
 *
 * SHARED ON PURPOSE. Both the on-screen document (/reports/generated) and the
 * scheduled email read from here. Duplicating this logic is the specific bug to
 * avoid: an email that shows different sections from the page it claims to
 * mirror is worse than not sending at all, and the drift is invisible until a
 * client points it out.
 */

/** The subset of QiReport this module needs. */
export interface ReportScope {
  name: string;
  type: string;
  dateRange: string;
  channels: string[];
  customSummary: string | null;
  customMetrics: string[];
}

export type ReportChannel = "paid" | "organic" | "email" | "leads";

export const ALL_CHANNELS: ReportChannel[] = ["paid", "organic", "email", "leads"];

/** Which report channel each custom metric belongs to. */
export const METRIC_CHANNEL: Record<string, ReportChannel> = {
  paid_pipeline: "paid", paid_roas: "paid", paid_spend: "paid",
  organic_followers: "organic", organic_engagement: "organic", organic_reach: "organic",
  email_sends: "email", email_open: "email", email_click: "email",
  leads_total: "leads", leads_qualified: "leads",
};

/**
 * KPI labels each custom metric maps onto in the overview KPI strip.
 *
 * Several spellings per metric because the label comes from live API data and
 * has varied ("Reach" vs "Total Reach"). A metric whose label never matches
 * simply contributes no KPI rather than throwing.
 */
export const METRIC_KPI_LABELS: Record<string, string[]> = {
  organic_reach: ["Total Reach", "Reach"],
  organic_engagement: ["Engagement", "Engagement rate"],
  organic_followers: ["Followers"],
  paid_spend: ["Spend", "Paid spend"],
  paid_pipeline: ["Pipeline", "Paid pipeline"],
  paid_roas: ["ROAS", "Paid ROAS"],
  email_sends: ["Emails sent", "Sends"],
  email_open: ["Open rate"],
  email_click: ["Click rate"],
  leads_total: ["Leads", "Total leads"],
  leads_qualified: ["Qualified leads"],
};

/**
 * Channels a report actually covers.
 *
 * A CUSTOM report's scope is implied by the metric groups it picked, never by
 * its stored `channels`: the editor hides the channel checkboxes on custom, so
 * a leftover "all channels" selection would otherwise scope a report the author
 * never configured that way.
 *
 * `null` scope means the unscoped document — everything.
 */
export function activeChannels(scope: ReportScope | null | undefined): Set<ReportChannel> {
  if (!scope) return new Set(ALL_CHANNELS);
  if (scope.type === "custom") {
    return new Set(
      scope.customMetrics
        .map((m) => METRIC_CHANNEL[m])
        .filter((c): c is ReportChannel => Boolean(c)),
    );
  }
  return new Set(scope.channels.filter((c): c is ReportChannel =>
    (ALL_CHANNELS as string[]).includes(c)));
}

/**
 * Narrow a KPI list to what a custom report asked for. Any other report type
 * keeps every KPI.
 */
export function filterKpis<T extends { label: string }>(
  kpis: T[],
  scope: ReportScope | null | undefined,
): T[] {
  if (!scope || scope.type !== "custom") return kpis;
  return kpis.filter((k) =>
    scope.customMetrics.some((m) =>
      (METRIC_KPI_LABELS[m] ?? []).some((label) => label.toLowerCase() === k.label.toLowerCase()),
    ),
  );
}

/** Days a report's stored dateRange represents. Falls back to 30. */
export function rangeDays(scope: ReportScope | null | undefined): number {
  const n = Number(scope?.dateRange);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/**
 * Report frequency → the Frequency the report builder understands.
 * "none" has no cadence and never reaches the builder.
 */
export function toBuilderFrequency(frequency: string): "DAILY" | "WEEKLY" | "MONTHLY" {
  if (frequency === "daily") return "DAILY";
  if (frequency === "monthly") return "MONTHLY";
  return "WEEKLY";
}

/** Milliseconds that must elapse before a report of this cadence is due again. */
export const DUE_AFTER_MS: Record<string, number> = {
  // Slightly under the nominal window so cron jitter never delays a send by a
  // whole cycle.
  daily: 23 * 60 * 60 * 1000,
  weekly: (7 * 24 - 2) * 60 * 60 * 1000,
  monthly: (30 * 24 - 12) * 60 * 60 * 1000,
};

/**
 * The report's current local hour (0-23) in `timezone`, at instant `now`.
 * Returns `null` if `timezone` is missing or not a recognized IANA zone —
 * callers must treat `null` as "can't evaluate the preferred-hour check,"
 * never as hour 0, so a bad timezone value degrades to skipping the check
 * (same as not setting one) rather than silently misfiring at midnight.
 */
function localHourIn(timezone: string, now: number): number | null {
  try {
    const hourStr = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(new Date(now));
    // "24" is what some ICU implementations format midnight as with
    // hour12:false; normalise to 0 so the comparison below is a plain 0-23 range.
    const h = Number(hourStr) % 24;
    return Number.isFinite(h) ? h : null;
  } catch {
    return null; // invalid IANA zone string
  }
}

/**
 * @param preferredHour Best-effort local send hour (0-23), or null/undefined
 *   for "no preference." Only takes effect when `timezone` is ALSO set —
 *   either alone is ignored, matching schema.prisma's doc comment on
 *   QiReport.preferredHour/timezone. Additive: every existing caller (and
 *   every report that has never set these fields) passes neither argument,
 *   so `preferredHour`/`timezone` are both `undefined`, the `if` below is
 *   never entered, and this function executes exactly the same two lines it
 *   always has — same cadence window, same lastSentAt dedup, zero behavior
 *   change.
 * @param timezone IANA zone (e.g. "Asia/Kolkata") preferredHour is read in.
 */
export function isDue(
  frequency: string,
  lastSentAt: Date | null,
  now: number,
  preferredHour?: number | null,
  timezone?: string | null,
): boolean {
  const window = DUE_AFTER_MS[frequency];
  if (!window) return false;      // "none" is never due
  const cadenceDue = !lastSentAt || now - lastSentAt.getTime() >= window;
  if (!cadenceDue) return false;

  // Best-effort preferred-hour gate — only when BOTH fields are set. Hobby
  // plan's cron runs once daily, so this can only guarantee the report never
  // sends BEFORE this local hour on a given day; it may still send up to
  // ~24h later, on whichever daily run first lands at/after it. See
  // PHASE_LOG.md for the full tradeoff.
  if (preferredHour != null && timezone) {
    const localHour = localHourIn(timezone, now);
    if (localHour !== null && localHour < preferredHour) return false;
  }

  return true;
}
