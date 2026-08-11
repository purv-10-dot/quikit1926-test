import { Queue } from "bullmq";
import { getQueueRedis, isRedisEnabled } from "@/lib/db/redis";
import type { SyncOrigin } from "@/lib/services/leadsquared/loop-guard";
import { incr, logSync } from "@/lib/services/leadsquared/telemetry";

const ENQUEUE_TIMEOUT = Symbol("enqueue-timeout");

/**
 * Job data for the outbound QuikCRM -> LeadSquared push.
 *
 * We deliberately store only the LEAD ID (not a snapshot of the row): the
 * processor re-reads the current QcfLead, so retries and coalesced bursts
 * always push the latest state, and the job payload stays tiny.
 *
 * `origin` is always "crm" — this queue exists solely for CRM-authored pushes.
 * Inbound LeadSquared webhooks (Phase 3) MUST NOT enqueue here; feeding a
 * leadsquared-origin change back through the push path would re-trigger the
 * echo loop the loop guard is there to prevent.
 */
export interface LeadSquaredSyncJobData {
  orgId: string;
  crmLeadId: string;
  origin: SyncOrigin;
}

const QUEUE_NAME = "leadsquared-sync";

let _queue: Queue<LeadSquaredSyncJobData> | null = null;

export function getLeadSquaredQueue(): Queue<LeadSquaredSyncJobData> {
  if (_queue) return _queue;
  _queue = new Queue<LeadSquaredSyncJobData>(QUEUE_NAME, {
    connection: getQueueRedis(),
    defaultJobOptions: {
      // Reliable: retry transient LSQ/network failures with back-off. The loop
      // guard makes a re-run cheap (unchanged payload -> no API call).
      attempts: 5,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 86_400, count: 5_000 },
      removeOnFail: { age: 7 * 86_400 },
    },
  });
  return _queue;
}

/**
 * Enqueue a CRM-origin outbound push. No custom jobId: every enqueue is its own
 * job so a later edit always pushes again; redundant jobs are cheap no-ops via
 * the loop guard. Throws if Redis is unreachable — callers should use the
 * *Safe wrapper on the request path.
 */
export async function enqueueLeadSquaredSync(input: {
  orgId: string;
  crmLeadId: string;
}): Promise<string> {
  const queue = getLeadSquaredQueue();
  const data: LeadSquaredSyncJobData = {
    orgId: input.orgId,
    crmLeadId: input.crmLeadId,
    origin: "crm", // hardcoded — this queue only ever pushes CRM-authored changes
  };
  const job = await queue.add("push", data);
  return String(job.id);
}

/**
 * Enqueue WITHOUT ever blocking or throwing into the caller. Returns the job
 * id, or null if Redis is unset, unreachable, or slow.
 *
 * The lead write is the source of truth and must never fail or stall because of
 * LeadSquared. When REDIS_URL is set but the daemon is down, ioredis queues the
 * command on its offline queue and `queue.add` hangs indefinitely (it never
 * throws) — so a plain try/catch is not enough. We bound it with a timeout and
 * let the orphaned attempt settle in the background (its rejection is
 * swallowed). Mirrors `enqueueImportSafe`.
 */
export async function enqueueLeadSquaredSyncSafe(
  input: { orgId: string; crmLeadId: string },
  opts: { timeoutMs?: number } = {},
): Promise<string | null> {
  // Redis off → outbound sync cannot run. Fail LOUDLY (not silently) so a dropped
  // lead is visible; a reconciliation/backfill can then re-sync it.
  if (!isRedisEnabled()) {
    logSync("warn", "outbound.enqueue.dropped", {
      orgId: input.orgId,
      crmLeadId: input.crmLeadId,
      reason: "redis-disabled",
    });
    incr("outbound.enqueue.dropped");
    return null;
  }
  const attempt = enqueueLeadSquaredSync(input).catch((err: unknown) => {
    logSync("error", "outbound.enqueue.error", {
      crmLeadId: input.crmLeadId,
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
    logSync("warn", "outbound.enqueue.dropped", {
      orgId: input.orgId,
      crmLeadId: input.crmLeadId,
      reason: raced === ENQUEUE_TIMEOUT ? "timeout" : "error",
    });
    incr("outbound.enqueue.dropped");
    return null;
  }
  incr("outbound.enqueue.ok");
  return jobId;
}

export const LEADSQUARED_SYNC_QUEUE_NAME = QUEUE_NAME;
