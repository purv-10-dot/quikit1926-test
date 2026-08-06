import { Queue } from "bullmq";
import { getQueueRedis } from "@/lib/db/redis";

export interface ImportJobData {
  tenantId: string;
  jobId: string; // LeadImportJob.id (Postgres)
  entityType: "leads" | "activities" | "workflows" | "sla";
  batchId?: string;
}

const QUEUE_NAME = "imports";

/** BullMQ rejects custom job ids containing `:`. */
export function buildImportBullJobId(entityType: string, jobId: string): string {
  return `${entityType}-${jobId}`;
}

let _queue: Queue<ImportJobData> | null = null;

export function getImportQueue(): Queue<ImportJobData> {
  if (_queue) return _queue;
  _queue = new Queue<ImportJobData>(QUEUE_NAME, {
    connection: getQueueRedis(),
    defaultJobOptions: {
      attempts: 1, // we manage retry counters ourselves to mirror legacy semantics
      removeOnComplete: { age: 7 * 86_400, count: 5_000 },
      removeOnFail: { age: 30 * 86_400 },
    },
  });
  return _queue;
}

export async function enqueueImport(data: ImportJobData, opts: { delayMs?: number } = {}): Promise<string> {
  const q = getImportQueue();
  const job = await q.add("process", data, {
    jobId: buildImportBullJobId(data.entityType, data.jobId),
    delay: opts.delayMs,
  });
  return String(job.id);
}

/**
 * Enqueue WITHOUT ever blocking the caller. Returns the BullMQ job id, or null
 * if Redis is unset, unreachable, or slow to answer.
 *
 * Critical for the import path: the inline executeImportJob is the real
 * persistence source of truth, so enqueue must never stall it. When REDIS_URL
 * is set but the daemon is down, ioredis queues the command on its offline
 * queue and `q.add` hangs indefinitely (it never throws) — so a plain
 * try/catch is not enough. We bound it with a timeout and let the orphaned
 * attempt settle in the background (its rejection is already swallowed).
 */
export async function enqueueImportSafe(
  data: ImportJobData,
  opts: { delayMs?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  const attempt = enqueueImport(data, { delayMs: opts.delayMs }).catch(() => null);
  const timeout = new Promise<null>((resolve) => {
    const t = setTimeout(() => resolve(null), opts.timeoutMs ?? 2500);
    if (typeof t.unref === "function") t.unref();
  });
  return Promise.race([attempt, timeout]);
}

export const IMPORT_QUEUE_NAME = QUEUE_NAME;
