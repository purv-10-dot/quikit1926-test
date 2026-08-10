/**
 * Queue-health + delivery-visibility surface for the LeadSquared sync.
 * Read by the admin health route (and usable from scripts). Safe to call with
 * Redis disabled — it returns a clear "inactive" note instead of throwing.
 */
import { isRedisEnabled } from "@/lib/db/redis";
import { getLeadSquaredQueue } from "@/lib/queue/leadsquared-queue";
import { getLeadSquaredInboundQueue } from "@/lib/queue/leadsquared-inbound-queue";
import { getCounters } from "@/lib/services/leadsquared/telemetry";

export interface QueueHealth {
  name: string;
  counts: Record<string, number>;
  /** Up to 10 most-recent dead-lettered jobs, ids + reason only (no payloads). */
  deadLetter: { id: string; failedReason: string | null; attemptsMade: number }[];
}

export interface LeadSquaredHealth {
  redisEnabled: boolean;
  counters: Record<string, number>;
  queues: QueueHealth[];
  note?: string;
}

export async function getLeadSquaredHealth(): Promise<LeadSquaredHealth> {
  const counters = getCounters();
  if (!isRedisEnabled()) {
    return {
      redisEnabled: false,
      counters,
      queues: [],
      note: "Redis disabled — outbound queue inactive; inbound processed inline. Provision REDIS_URL + the worker for durable delivery.",
    };
  }

  const queues: QueueHealth[] = [];
  const targets = [
    ["leadsquared-sync", getLeadSquaredQueue()] as const,
    ["leadsquared-inbound", getLeadSquaredInboundQueue()] as const,
  ];
  for (const [name, q] of targets) {
    const counts = await q.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
    );
    const failed = await q.getFailed(0, 9);
    queues.push({
      name,
      counts,
      deadLetter: failed.map((j) => ({
        id: String(j.id),
        failedReason: j.failedReason ?? null,
        attemptsMade: j.attemptsMade,
      })),
    });
  }
  return { redisEnabled: true, counters, queues };
}
