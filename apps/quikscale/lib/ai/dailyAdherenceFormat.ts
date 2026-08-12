/**
 * Deterministic formatting/diffing helpers for the DAILY Adherence report.
 *
 * Kept out of the AI prompt on purpose: real transcript metadata (meeting
 * date, duration, prior attendance) must never be re-derived/guessed by the
 * model when we already have it — these are pure functions over that real
 * data, shared by the on-screen report and the PDF export so the two never
 * disagree.
 */

import { MEETING_TZ } from "@/lib/services/meetingTranscriptMatch";

/** "Friday, 05 June 2026" */
export function formatMeetingDateLabel(date: Date, tz: string = MEETING_TZ): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** "Approximately 6 minutes" — null when duration is unknown. */
export function formatDurationLabel(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const rounded = Math.round(minutes);
  return `Approximately ${rounded} minute${rounded === 1 ? "" : "s"}`;
}

/** Buckets a real timestamp into a Morning/Afternoon/Evening label, in `tz`. */
export function inferTimeOfDay(date: Date, tz: string = MEETING_TZ): "Morning" | "Afternoon" | "Evening" {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit" }).format(date),
  );
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

const normalizeName = (s: string) => s.trim().toLowerCase();

/**
 * Names present at the prior huddle but not at today's — case-insensitive,
 * trimmed set difference. Order follows `previousPresentNames`.
 */
export function diffAttendance(previousPresentNames: string[], todayPresentNames: string[]): string[] {
  const today = new Set(todayPresentNames.map(normalizeName));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of previousPresentNames) {
    const trimmed = name.trim();
    const key = normalizeName(trimmed);
    if (today.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export interface AdherenceSummary {
  full: number;
  good: number;
  partial: number;
  poor: number;
  total: number;
}

/** Groups adherence rows by normalized `rating` text for the summary tiles. */
export function summarizeAdherence(rows: { rating?: string | null }[]): AdherenceSummary {
  const summary: AdherenceSummary = { full: 0, good: 0, partial: 0, poor: 0, total: rows.length };
  for (const row of rows) {
    const rating = (row.rating ?? "").trim().toLowerCase();
    if (rating === "full") summary.full += 1;
    else if (rating === "good") summary.good += 1;
    else if (rating === "partial") summary.partial += 1;
    else if (rating === "poor") summary.poor += 1;
  }
  return summary;
}
