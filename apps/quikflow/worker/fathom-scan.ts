/**
 * Fathom scan — polls connected Fathom.ai accounts for newly-transcribed
 * meetings and enqueues a `fathom.meeting.transcribed` event per new recording.
 * Runs on the scheduler tick (~60s), mirroring mail-scan. BullMQ-free so it's
 * unit-testable.
 *
 * The per-org poll watermark ("cursor") lives in Redis; on a cold cache it's
 * seeded to "now" so QuikFlow never backfills the entire Fathom history.
 *
 * Idempotency: dedupeKey = `fathom:<recordingId>`, so a recording that reappears
 * in an overlapping poll window collapses to a single run. Client/type/date
 * matching happens later, in QuikScale's save-transcript endpoint.
 */
import { db } from "@/lib/db";
import { enqueueEvent, getRedis } from "@/lib/queue/queue";
import { getFathomKey } from "@/lib/connectors";
import { listMeetingsSince, meetingToEventData } from "@/lib/connectors/fathom";
import { FATHOM_APP_SLUG, FATHOM_EVENT_TRANSCRIBED } from "@/lib/catalog/fathom";

const CURSOR_PREFIX = "fathom:cursor:";

/** Orgs with at least one Active workflow triggering on a Fathom meeting. */
async function orgsWithFathomWorkflows(): Promise<Set<string>> {
  const workflows = await db.wfWorkflow.findMany({
    where: { status: "Active" },
    select: { orgId: true, trigger: true },
  });
  const orgs = new Set<string>();
  for (const wf of workflows) {
    const t = (wf.trigger ?? {}) as Record<string, unknown>;
    if (t.app === FATHOM_APP_SLUG) orgs.add(wf.orgId);
  }
  return orgs;
}

export async function runFathomScan(): Promise<{ fired: number }> {
  const orgs = await orgsWithFathomWorkflows();
  if (orgs.size === 0) return { fired: 0 };

  const redis = getRedis();
  let fired = 0;

  for (const orgId of orgs) {
    const conn = await getFathomKey(orgId);
    if (!conn) continue;

    const cursorKey = `${CURSOR_PREFIX}${orgId}`;
    const cursor = await redis.get(cursorKey);

    let result: Awaited<ReturnType<typeof listMeetingsSince>>;
    try {
      result = await listMeetingsSince(conn.apiKey, cursor);
    } catch {
      // Rate limit / transient API error — try again next tick.
      continue;
    }

    for (const m of result.meetings) {
      try {
        await enqueueEvent({
          app: FATHOM_APP_SLUG,
          event: FATHOM_EVENT_TRANSCRIBED,
          orgId,
          dedupeKey: `fathom:${m.recordingId}`,
          data: meetingToEventData(m),
          occurredAt: m.startedAt ?? undefined,
        });
        fired += 1;
      } catch {
        // A single bad enqueue shouldn't abort the whole scan.
      }
    }

    if (result.nextCursor && result.nextCursor !== cursor) {
      await redis.set(cursorKey, result.nextCursor);
    }
  }

  return { fired };
}
