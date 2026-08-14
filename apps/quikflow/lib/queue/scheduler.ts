import { Queue, type ConnectionOptions } from "bullmq";
import { connection } from "./queue";

/**
 * Scheduler queue — a single BullMQ *repeatable* job ticks every 60s and drives
 * time-based triggers (schedule.tick). Kept separate from the events queue so
 * the two job shapes don't mix; both share one Redis connection.
 */
export const SCHEDULER_QUEUE = "quikflow-scheduler";
export const TICK_JOB = "scheduler-tick";
/** Fixed repeat key so re-adding on every worker boot doesn't stack duplicates. */
export const TICK_REPEAT_MS = 60_000;

let queue: Queue | null = null;

export function getSchedulerQueue(): Queue {
  if (queue) return queue;
  queue = new Queue(SCHEDULER_QUEUE, { connection: connection() as ConnectionOptions });
  return queue;
}

/** Register (idempotently) the every-60s repeatable tick. */
export async function ensureSchedulerTick(): Promise<void> {
  await getSchedulerQueue().add(
    TICK_JOB,
    {},
    { repeat: { every: TICK_REPEAT_MS }, jobId: TICK_JOB, removeOnComplete: true, removeOnFail: 100 },
  );
}
