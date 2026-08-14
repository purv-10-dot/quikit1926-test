/**
 * Scheduler tick — fires every due WfSchedule. Kept as a plain function (no
 * BullMQ coupling) so it can be unit-tested directly. For each row whose
 * `nextRunAt <= now`, it enqueues a TARGETED `schedule.tick` event (carrying
 * `workflowId`) and advances `nextRunAt` to the next occurrence.
 *
 * Idempotency: the event dedupeKey uses the schedule's INTENDED fire time
 * (`nextRunAt`), not `now`, so a late or double tick collapses to one run.
 */
import { db } from "@/lib/db";
import { enqueueEvent } from "@/lib/queue/queue";
import { computeNextRun } from "@/lib/schedule/cron";

export async function runSchedulerTick(now: Date = new Date()): Promise<{ fired: number }> {
  const due = await db.wfSchedule.findMany({
    where: { nextRunAt: { lte: now } },
    select: { id: true, orgId: true, workflowId: true, cron: true, nextRunAt: true },
  });

  let fired = 0;
  for (const s of due) {
    const intended = (s.nextRunAt ?? now).toISOString();
    try {
      await enqueueEvent({
        app: "quikflow",
        event: "schedule.tick",
        orgId: s.orgId,
        dedupeKey: `schedule.tick:${s.workflowId}:${intended}`,
        data: { workflowId: s.workflowId, scheduledAt: intended },
        occurredAt: intended,
      });
      fired += 1;
    } catch {
      // Enqueue failure shouldn't stop advancing other schedules.
    }
    // Advance to the next occurrence (strictly after now) so we don't refire.
    const next = computeNextRun(s.cron, now, "UTC");
    await db.wfSchedule.update({ where: { id: s.id }, data: { nextRunAt: next } });
  }
  return { fired };
}
