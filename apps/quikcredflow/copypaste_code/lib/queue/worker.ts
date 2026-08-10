/**
 * BullMQ worker entrypoint.
 * Run with `npm run worker`. Spawns workers for both the `automation` and
 * `imports` queues — they share the Prisma + Redis connections but do not
 * share concurrency.
 *
 * In dev, use a separate terminal. In Docker, the `worker` service runs this.
 * UI lead imports also run inline in the API route; the worker handles retries
 * and imports queued without inline processing.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { Worker, type Job } from "bullmq";
import { getQueueRedis, isRedisEnabled } from "@/lib/db/redis";
import { prisma } from "@/lib/db/prisma";
import { runFrom } from "@/lib/services/automation/workflow-engine";
import { AUTOMATION_QUEUE_NAME, type AutomationJobData } from "@/lib/queue/automation-queue";
import { IMPORT_QUEUE_NAME, type ImportJobData } from "@/lib/queue/import-queue";
import { executeImportJob } from "@/lib/services/import/execute-import-job";

async function processAutomationJob(job: Job<AutomationJobData>) {
  const { tenantId, workflowId, leadId, startNodeId, step, pendingStepId } = job.data;
  if (pendingStepId) {
    await prisma.crmAutomationPendingStep
      .update({
        where: { id: pendingStepId },
        data: { status: "processing" },
      })
      .catch(() => undefined);
  }
  try {
    await runFrom(tenantId, workflowId, leadId, startNodeId, step ?? 0);
    if (pendingStepId) {
      await prisma.crmAutomationPendingStep
        .update({ where: { id: pendingStepId }, data: { status: "completed" } })
        .catch(() => undefined);
    }
  } catch (err) {
    if (pendingStepId) {
      await prisma.crmAutomationPendingStep
        .update({
          where: { id: pendingStepId },
          data: { status: "failed", failedReason: err instanceof Error ? err.message : "unknown" },
        })
        .catch(() => undefined);
    }
    throw err;
  }
}

async function processImportJob(job: Job<ImportJobData>) {
  const result = await executeImportJob(job.data);
  if (result.outcome === "finished") {
    console.log(
      `[import] ${job.data.entityType} ${job.data.jobId} → ${result.status} (${result.importedCount}/${result.totalRows})`,
    );
  }
}

async function main() {
  if (!isRedisEnabled()) {
    console.error(
      "[worker] REDIS_URL is not set — the BullMQ worker cannot start.\n" +
        "        Set REDIS_URL in .env (or .env.local) to enable workflow + import processing.",
    );
    process.exit(1);
  }
  const connection = getQueueRedis();

  const automationWorker = new Worker<AutomationJobData>(AUTOMATION_QUEUE_NAME, processAutomationJob, {
    connection,
    concurrency: Number(process.env.AUTOMATION_CONCURRENCY ?? "10"),
  });
  automationWorker.on("ready", () => console.log("[worker] automation queue: ready"));
  automationWorker.on("failed", (job, err) =>
    console.error(`[worker] automation job ${job?.id} failed:`, err?.message),
  );

  const importWorker = new Worker<ImportJobData>(IMPORT_QUEUE_NAME, processImportJob, {
    connection,
    concurrency: Number(process.env.IMPORT_CONCURRENCY ?? "4"),
  });
  importWorker.on("ready", () => console.log("[worker] imports queue: ready"));
  importWorker.on("failed", (job, err) =>
    console.error(`[worker] import job ${job?.id} failed:`, err?.message),
  );

  console.log("[worker] running. Ctrl+C to stop.");

  const shutdown = async () => {
    console.log("[worker] shutting down…");
    await Promise.all([automationWorker.close(), importWorker.close()]);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
