/**
 * Report snapshot writes — Phase 2 of the report snapshot/comparison feature
 * (see PHASE_LOG.md). Upserts a QiReportSnapshot row on (reportId, snapshotDate)
 * so same-day regeneration overwrites rather than accumulates.
 *
 * ADDITIVE ONLY. Every call site wraps this in its own try/catch and ignores
 * the result — a snapshot failure must never affect the report the user
 * actually sees or receives. This module itself never throws to its caller;
 * see saveReportSnapshot's own try/catch below as the last line of defense.
 */

import { db } from "@/lib/db";
import type { DateWindow } from "@/lib/period/types";

/** Today's date, UTC, as the DATE-only value snapshotDate expects. */
function todaySnapshotDate(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Upsert today's snapshot for one report. `data` should be whatever was
 * already computed for the report being generated/sent — never re-fetched
 * here, so this never issues a new connector call and never risks the Meta
 * 28-day account-insights cap (lib/connectors/instagram.ts, facebook.ts
 * already clamp their own fetches; this function is downstream of that).
 *
 * Swallows all errors and logs via console.error, matching this app's
 * established fire-and-forget pattern (see fetchTimesheetForEmail in
 * buildEmailReport.ts for the same shape).
 */
export async function saveReportSnapshot(opts: {
  reportId: string;
  window: DateWindow;
  data: unknown;
  now?: Date;
}): Promise<void> {
  try {
    const { reportId, window, data, now = new Date() } = opts;
    const snapshotDate = todaySnapshotDate(now);

    await (db as any).qiReportSnapshot.upsert({
      where: { reportId_snapshotDate: { reportId, snapshotDate } },
      create: {
        reportId,
        snapshotDate,
        windowStart: new Date(`${window.start}T00:00:00.000Z`),
        windowEnd: new Date(`${window.end}T00:00:00.000Z`),
        data: data as any,
      },
      update: {
        windowStart: new Date(`${window.start}T00:00:00.000Z`),
        windowEnd: new Date(`${window.end}T00:00:00.000Z`),
        data: data as any,
        generatedAt: now,
      },
    });
  } catch (err) {
    console.error("[reports/snapshot] failed to save report snapshot:", err);
  }
}
