/**
 * Dead-letter queue helpers. Jobs that exhaust all retries land in BullMQ's
 * "failed" set — that IS our DLQ. These functions expose it per-org and allow a
 * replay. Complements the failed-RUN retry (/api/runs/[id]/retry): this covers
 * jobs that failed BEFORE producing a WfRun (dispatch/infra errors), which have
 * no run row to retry.
 *
 * Tenant isolation is enforced on `job.data.orgId` — a caller only ever sees or
 * replays jobs for their own org.
 */
import type { Job } from "bullmq";
import { getQueue } from "./queue";
import type { EngineEvent } from "@/lib/engine/types";

/** How many failed jobs to scan from Redis before per-org filtering. */
const SCAN_WINDOW = 200;

export interface DeadLetter {
  id: string;
  event: string;
  app: string;
  dedupeKey: string;
  attemptsMade: number;
  failedReason: string | null;
  timestamp: number;
}

function orgOf(job: Job): string | undefined {
  return (job.data as Partial<EngineEvent> | undefined)?.orgId;
}

/** Failed jobs for one org, newest-scanned first, capped at `limit`. */
export async function listDeadLetters(orgId: string, limit = 50): Promise<DeadLetter[]> {
  const jobs = await getQueue().getFailed(0, SCAN_WINDOW - 1);
  return jobs
    .filter((j) => orgOf(j) === orgId)
    .slice(0, limit)
    .map((j) => {
      const d = (j.data ?? {}) as Partial<EngineEvent>;
      return {
        id: j.id ?? "",
        event: d.event ?? "unknown",
        app: d.app ?? "unknown",
        dedupeKey: d.dedupeKey ?? "",
        attemptsMade: j.attemptsMade,
        failedReason: j.failedReason ?? null,
        timestamp: j.timestamp,
      };
    });
}

/**
 * Replay one failed job — re-runs it through the normal pipeline. Returns false
 * when the job is missing or belongs to another org (tenant isolation).
 */
export async function replayDeadLetter(orgId: string, jobId: string): Promise<boolean> {
  const job = await getQueue().getJob(jobId);
  if (!job || orgOf(job) !== orgId) return false;
  await job.retry();
  return true;
}
