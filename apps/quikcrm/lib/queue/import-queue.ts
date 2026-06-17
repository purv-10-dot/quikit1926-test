import { Queue } from "bullmq";
import { getQueueRedis } from "@/lib/db/redis";

export interface ImportJobData {
  orgId: string;
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

export const IMPORT_QUEUE_NAME = QUEUE_NAME;
