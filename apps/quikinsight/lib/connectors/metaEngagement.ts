/**
 * Shared date-window + engagement-rate helpers for the Meta connectors
 * (instagram.ts, facebook.ts, metaConnector.ts).
 *
 * WHY THIS EXISTS. Before this existed, three call sites each computed their
 * own engagement-rate formula — instagram.ts summed likes+comments+saved+
 * shares, metaConnector.ts's Instagram path summed only likes+comments
 * (missing saved/shares) — so the "Eng. Rate" shown on /instagram and the
 * "Engagement" card on /overview could disagree for the exact same connected
 * account and period. Separately, instagram.ts and metaConnector.ts each had
 * their own near-identical windowToUnixRange/withinWindow pair, and
 * facebook.ts had a third, differently-shaped variant. One set of helpers,
 * one place to change any of it.
 */
import { parseISODate } from "@/lib/period/resolve";
import type { DateWindow } from "@/lib/period/types";

/** Engaged-users basis (Facebook: engaged users; Instagram: likes+comments+saved+shares). */
export function computeEngagementRate(engaged: number, reach: number): string {
  return reach > 0 ? ((engaged / reach) * 100).toFixed(1) : "0";
}

/**
 * Inclusive [start 00:00, end 23:59:59] as unix seconds, for the Graph API's
 * since/until account-insights parameters. Uses parseISODate (not raw
 * `new Date(w.start)`) so a malformed window falls back to "now" instead of
 * silently producing NaN timestamps.
 */
export function windowToUnixRange(w: DateWindow): { since: number; until: number } {
  const start = parseISODate(w.start) ?? new Date();
  const end = parseISODate(w.end) ?? new Date();
  const since = Math.floor(start.getTime() / 1000);
  const until = Math.floor(end.getTime() / 1000) + 24 * 60 * 60 - 1; // end of day
  return { since, until };
}

/**
 * Whether a post's ISO timestamp falls within the inclusive window. Used to
 * client-side filter Facebook/Instagram posts, since neither Graph API edge
 * (/posts, /media) accepts a date-range query parameter.
 */
export function withinWindow(timestamp: string, w: DateWindow): boolean {
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) return false;
  const { since, until } = windowToUnixRange(w);
  const sec = Math.floor(t / 1000);
  return sec >= since && sec <= until;
}
