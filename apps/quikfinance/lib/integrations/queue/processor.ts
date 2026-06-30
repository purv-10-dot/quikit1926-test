import type { PrismaClient } from "@prisma/client";
import { IntegrationRepository } from "../repository";
import { SyncEngine } from "../engines/sync-engine";
import { MigrationEngine } from "../engines/migration-engine";
import type { SyncOptions } from "../types";

/**
 * Background queue processor. Designed to be invoked by a scheduled trigger
 * (Vercel Cron / external scheduler) hitting /api/v1/integrations/queue/process,
 * or inline for dev. Claims jobs with SKIP LOCKED so multiple invocations act as
 * parallel workers without double-processing. Handles retry with exponential
 * backoff and routes exhausted jobs to the dead-letter queue.
 */

export type ProcessResult = { claimed: number; succeeded: number; failed: number; requeued: number; dead: number };

export async function processQueue(prisma: PrismaClient, orgId: string, worker: string, limit = 5): Promise<ProcessResult> {
  const repo = new IntegrationRepository(prisma, orgId);
  const jobs = await repo.claimJobs(worker, limit);
  const out: ProcessResult = { claimed: jobs.length, succeeded: 0, failed: 0, requeued: 0, dead: 0 };

  for (const job of jobs) {
    const jobId = job.id as string;
    const connectionId = job.connection_id as string;
    try {
      await repo.log(jobId, "info", `Processing ${job.type} job`, { entity: job.entity });
      let result: Record<string, unknown> = {};

      if (job.type === "sync" || job.type === "pull" || job.type === "push") {
        const engine = new SyncEngine(prisma, orgId);
        const options = (job.payload as { options?: SyncOptions })?.options;
        const res = await engine.runConnectionSync(connectionId, options, jobId);
        result = { entities: res };
      } else if (job.type === "migration") {
        const engine = new MigrationEngine(prisma, orgId);
        const sessionId = (job.payload as { sessionId?: string })?.sessionId;
        if (!sessionId) throw new Error("migration job missing sessionId");
        result = await engine.import(sessionId);
      } else if (job.type === "token_refresh") {
        const ctx = await repo.buildProviderContext(connectionId);
        const { getProvider } = await import("../registry");
        const conn = await repo.getConnection(connectionId);
        const provider = getProvider(conn!.provider_key as string, ctx);
        const tokens = await provider.refreshToken();
        await repo.saveTokens(connectionId, tokens);
        result = { refreshed: true };
      }

      await repo.finishJob(jobId, "succeeded", result);
      out.succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "job failed";
      await repo.log(jobId, "error", message);
      await repo.finishJob(jobId, "failed", undefined, message);
      const disposition = await repo.requeueOrDeadLetter({ ...job, error: message });
      out.failed += 1;
      if (disposition === "requeued") out.requeued += 1;
      else out.dead += 1;
    }
  }

  return out;
}
