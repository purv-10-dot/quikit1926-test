/**
 * Pulling Teams attendance into QuikScale, and keeping it.
 *
 * The Graph call itself lives in QuikFlow (that is where the OAuth connection
 * and the calendar link are), so this is an HTTP hop over the shared internal
 * secret — the same seam `client-meetings/calendar/route.ts` uses. QuikScale
 * deliberately does not read `app_quikflow` tables directly.
 *
 * WHY WE CACHE RATHER THAN QUERY EACH TIME
 * ----------------------------------------
 * Microsoft's retention of attendance reports is limited: a report we do not
 * keep is eventually gone for good, and with it the only evidence that could
 * ever prove who missed a huddle. So the first successful fetch is persisted to
 * `ClientMeetingAttendance` and every later read comes from there.
 *
 * Failure is never fatal. No connection, no report yet, a tenant that needs to
 * reconnect — all degrade to "no Teams evidence", and the attendance ladder
 * falls back to transcript rungs. A missing integration must not stop a report
 * from being generated.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** How the sync went, for the UI. `synced` counts occurrences newly persisted. */
export interface AttendanceSyncResult {
  synced: number;
  skipped: number;
  /** The first actionable failure reason, if any — drives the UI's hint. */
  reason: string | null;
  message: string | null;
}

interface AttendanceApiResponse {
  available: boolean;
  reason?: string;
  message?: string;
  meetingStart?: string | null;
  meetingEnd?: string | null;
  records?: unknown[];
  invited?: unknown[];
}

/**
 * A Teams attendance report is generated after the meeting ends, not during it.
 * Asking too early gets a confident "no report" for a meeting that will produce
 * one in a few minutes, and that answer would be cached.
 */
const REPORT_LAG_MS = 15 * 60_000;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** The stored shape: Graph's records plus the invite that gives them meaning. */
const recordsJson = (payload: AttendanceApiResponse): Prisma.InputJsonValue =>
  ({ records: payload.records ?? [], invited: payload.invited ?? [] }) as Prisma.InputJsonValue;

/**
 * Fetch and persist Teams attendance for the given dates of one client.
 *
 * Occurrences already stored are skipped — the stored copy is the record of
 * truth once written, and re-fetching risks replacing a good report with a
 * "not found" once Microsoft ages it out.
 */
export async function syncTeamsAttendance(input: {
  orgId: string;
  clientId: string;
  kind: "daily" | "weekly";
  /** Occurrence dates to sync, `YYYY-MM-DD`. */
  dates: string[];
  /** Planned end time "HH:mm", used to apply the report lag. */
  plannedEndTime?: string | null;
  now?: Date;
}): Promise<AttendanceSyncResult> {
  const { orgId, clientId, kind, dates } = input;
  const now = input.now ?? new Date();

  const base = process.env.QUIKFLOW_URL;
  const secret = process.env.INTERNAL_SECRET;
  if (!base || !secret) {
    return { synced: 0, skipped: dates.length, reason: "not-configured", message: null };
  }

  const existing = await db.clientMeetingAttendance.findMany({
    where: { orgId, clientId, kind },
    select: { meetingDate: true },
  });
  const have = new Set(existing.map((r) => ymd(r.meetingDate)));

  let synced = 0;
  let skipped = 0;
  let reason: string | null = null;
  let message: string | null = null;

  for (const date of dates) {
    if (have.has(date)) {
      skipped += 1;
      continue;
    }
    if (!reportIsDue(date, input.plannedEndTime ?? null, now)) {
      skipped += 1;
      // Not a failure worth surfacing — the meeting simply has not settled yet.
      continue;
    }

    const qs = new URLSearchParams({ orgId, refType: "clientMaster", refId: clientId, kind, date });
    let payload: AttendanceApiResponse | null = null;
    try {
      const res = await fetch(`${base}/api/internal/teams/attendance?${qs.toString()}`, {
        headers: { "x-internal-secret": secret },
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: AttendanceApiResponse }
        | null;
      payload = res.ok && json?.success ? json.data ?? null : null;
    } catch {
      payload = null; // QuikFlow unreachable — degrade, do not throw.
    }

    if (!payload?.available) {
      skipped += 1;
      // Report the first reason a human could act on. "not-ready"/"not-found"
      // are normal states and must not shout at anybody.
      if (
        !reason &&
        payload?.reason &&
        payload.reason !== "not-ready" &&
        payload.reason !== "not-found"
      ) {
        reason = payload.reason;
        message = payload.message ?? null;
      }
      continue;
    }

    await db.clientMeetingAttendance.upsert({
      where: {
        orgId_clientId_meetingDate_kind: {
          orgId,
          clientId,
          meetingDate: new Date(`${date}T00:00:00.000Z`),
          kind,
        },
      },
      create: {
        orgId,
        clientId,
        kind,
        meetingDate: new Date(`${date}T00:00:00.000Z`),
        source: "teams",
        meetingStart: payload.meetingStart ? new Date(payload.meetingStart) : null,
        meetingEnd: payload.meetingEnd ? new Date(payload.meetingEnd) : null,
        records: recordsJson(payload),
      },
      update: {
        meetingStart: payload.meetingStart ? new Date(payload.meetingStart) : null,
        meetingEnd: payload.meetingEnd ? new Date(payload.meetingEnd) : null,
        records: recordsJson(payload),
        fetchedAt: now,
      },
    });
    synced += 1;
  }

  return { synced, skipped, reason, message };
}

/**
 * Has enough time passed since this occurrence ended for a report to exist?
 *
 * Without a planned end time we can only place the meeting on its date, so the
 * whole day plus the lag has to pass — conservative, but "no report" is cached
 * and a wrong "no" is worse than a late "yes".
 */
export function reportIsDue(date: string, plannedEndTime: string | null, now: Date): boolean {
  const end = plannedEndTime && /^\d{1,2}:\d{2}$/.test(plannedEndTime)
    ? new Date(`${date}T${plannedEndTime.padStart(5, "0")}:00.000Z`)
    : new Date(`${date}T23:59:59.000Z`);
  return now.getTime() >= end.getTime() + REPORT_LAG_MS;
}
