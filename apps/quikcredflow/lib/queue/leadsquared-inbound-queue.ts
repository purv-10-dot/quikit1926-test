import { Queue } from "bullmq";
import { getQueueRedis, isRedisEnabled } from "@/lib/db/redis";
import { incr, logSync } from "@/lib/services/leadsquared/telemetry";

const ENQUEUE_TIMEOUT = Symbol("enqueue-timeout");

/**
 * Job data for inbound LeadSquared webhook processing.
 *
 * Unlike the outbound queue (which stores only an id and re-reads the lead),
 * the inbound payload IS the source of truth, so we carry it in the job.
 * `tenantId` is resolved from env at enqueue time (single-client setup).
 */
export interface LeadSquaredInboundJobData {
  orgId: string;
  payload: unknown;
}

const QUEUE_NAME = "leadsquared-inbound";

let _queue: Queue<LeadSquaredInboundJobData> | null = null;

export function getLeadSquaredInboundQueue(): Queue<LeadSquaredInboundJobData> {
  if (_queue) return _queue;
  _queue = new Queue<LeadSquaredInboundJobData>(QUEUE_NAME, {
    connection: getQueueRedis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 86_400, count: 5_000 },
      removeOnFail: { age: 7 * 86_400 },
    },
  });
  return _queue;
}

export async function enqueueLeadSquaredInbound(
  data: LeadSquaredInboundJobData,
): Promise<string> {
  const job = await getLeadSquaredInboundQueue().add("inbound", data);
  return String(job.id);
}

/**
 * Enqueue without ever blocking or throwing into the webhook handler. Returns
 * the job id, or null if Redis is unset, unreachable, or slow — the route then
 * falls back to inline processing. Mirrors `enqueueLeadSquaredSyncSafe`.
 */
export async function enqueueLeadSquaredInboundSafe(
  data: LeadSquaredInboundJobData,
  opts: { timeoutMs?: number } = {},
): Promise<string | null> {
  if (!isRedisEnabled()) return null; // caller (route) falls back to inline processing
  const attempt = enqueueLeadSquaredInbound(data).catch((err: unknown) => {
    logSync("error", "inbound.enqueue.error", {
      orgId: data.orgId,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  });
  const timeout = new Promise<typeof ENQUEUE_TIMEOUT>((resolve) => {
    const t = setTimeout(() => resolve(ENQUEUE_TIMEOUT), opts.timeoutMs ?? 2500);
    if (typeof t.unref === "function") t.unref();
  });
  const raced = await Promise.race([attempt, timeout]);
  const jobId = typeof raced === "string" ? raced : null;
  if (!jobId) {
    logSync("warn", "inbound.enqueue.dropped", {
      orgId: data.orgId,
      reason: raced === ENQUEUE_TIMEOUT ? "timeout" : "error",
    });
    incr("inbound.enqueue.dropped");
    return null;
  }
  incr("inbound.enqueue.ok");
  return jobId;
}

export const LEADSQUARED_INBOUND_QUEUE_NAME = QUEUE_NAME;
