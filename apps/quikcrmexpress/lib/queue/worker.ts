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
import { isRedisEnabled } from "@/lib/db/redis";
import { queueConnection } from "@/lib/queue/connection";
import { prisma } from "@/lib/db/prisma";
import { runFrom } from "@/lib/services/automation/workflow-engine";
import { AUTOMATION_QUEUE_NAME, type AutomationJobData } from "@/lib/queue/automation-queue";
import { IMPORT_QUEUE_NAME, type ImportJobData } from "@/lib/queue/import-queue";
import { executeImportJob } from "@/lib/services/import/execute-import-job";
import {
  LEADSQUARED_SYNC_QUEUE_NAME,
  type LeadSquaredSyncJobData,
} from "@/lib/queue/leadsquared-queue";
import { processLeadSquaredSyncJob } from "@/lib/services/leadsquared/sync-job";
import {
  LEADSQUARED_INBOUND_QUEUE_NAME,
  type LeadSquaredInboundJobData,
} from "@/lib/queue/leadsquared-inbound-queue";
import { processInboundBatch } from "@/lib/services/leadsquared/inbound";
import { getResolvedFieldMap } from "@/lib/services/leadsquared/field-map-resolver";
import { pollLeadSquaredInbound } from "@/lib/services/leadsquared/poll";
import { incr, logSync } from "@/lib/services/leadsquared/telemetry";

/**
 * Shared failed-job handler for the LeadSquared queues. Distinguishes a
 * transient (will-retry) failure from a terminal one (retries exhausted) and
 * raises an ALERT-level structured log + counter on exhaustion so dead-letters
 * are actionable rather than silent.
 */
function onLeadSquaredJobFailed(
  queue: string,
  job: { id?: string; attemptsMade?: number; opts?: { attempts?: number } } | undefined,
  err: Error | undefined,
): void {
  const attemptsMade = job?.attemptsMade ?? 0;
  const maxAttempts = job?.opts?.attempts ?? 1;
  const exhausted = attemptsMade >= maxAttempts;
  logSync(exhausted ? "alert" : "warn", exhausted ? `${queue}.job.exhausted` : `${queue}.job.failed`, {
    jobId: job?.id,
    attemptsMade,
    maxAttempts,
    message: err?.message,
  });
  if (exhausted) incr(`${queue}.job.exhausted`);
}

async function processAutomationJob(job: Job<AutomationJobData>) {
  const { orgId, workflowId, leadId, startNodeId, step, pendingStepId, triggerEventId, triggerType, triggerSnapshot } = job.data;
  if (pendingStepId) {
    await prisma.qceAutomationPendingStep
      .update({
        where: { id: pendingStepId },
        data: { status: "processing" },
      })
      .catch(() => undefined);
  }
  try {
    await runFrom(orgId, workflowId, leadId, startNodeId, step ?? 0, {
      eventId: triggerEventId,
      type: triggerType,
      snapshot: triggerSnapshot,
    });
    if (pendingStepId) {
      await prisma.qceAutomationPendingStep
        .update({ where: { id: pendingStepId }, data: { status: "completed" } })
        .catch(() => undefined);
    }
  } catch (err) {
    if (pendingStepId) {
      await prisma.qceAutomationPendingStep
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
  const connection = queueConnection();

  // LSQ-sync safety gate. The LeadSquared sync workers push CRM changes to the
  // REAL LeadSquared account (creds in env). During automation TESTING against
  // the autotest DB they must NOT run, or a test lead's change is pushed to
  // production LSQ. Pass --automation-only (or set WORKER_AUTOMATION_ONLY=1) to
  // run ONLY automation+imports.
  // DEFAULT (unset) = ALL queues run, so forgetting the flag in prod still runs
  // sync (fails SAFE -- you must opt IN to disabling). The boot banner prints the
  // active mode every start so nobody has to remember this exists.
  //
  // The CLI flag is what `npm run worker:test` uses. It deliberately does NOT
  // live in an env file: this is a per-invocation MODE, not configuration, and
  // putting it in .env.local would silently disable LSQ sync for the real
  // worker too. The env var is still honoured for container deployments that
  // can only inject environment.
  // See docs/claude-project/AUTOMATION-WORKER-OPERATIONS.md.
  const automationOnly =
    process.argv.includes("--automation-only") ||
    process.env.WORKER_AUTOMATION_ONLY === "1";
  console.log("========================================================");
  console.log("[worker] QUEUE MODE");
  console.log("  automation + imports        : ENABLED");
  console.log(
    "  leadsquared sync/inbound    : " +
      (automationOnly
        ? "DISABLED (automation-only mode)"
        : "ENABLED  -> pushes to REAL LeadSquared"),
  );
  console.log("  (run `npm run worker:test` to disable external LSQ sync for testing)");
  console.log("========================================================");
  if (!automationOnly) {
    console.warn(
      "[worker] WARNING: LeadSquared sync is ENABLED - CRM changes WILL be pushed to the real LSQ account. " +
        "For safe automation testing on the autotest DB, stop and re-run: npm run worker:test",
    );
  }

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

  // Only started when NOT in automation-only mode (see the safety gate above).
  let leadSquaredWorker: Worker<LeadSquaredSyncJobData> | null = null;
  let leadSquaredInboundWorker: Worker<LeadSquaredInboundJobData> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  if (!automationOnly) {
  leadSquaredWorker = new Worker<LeadSquaredSyncJobData>(
    LEADSQUARED_SYNC_QUEUE_NAME,
    // Wrap so BullMQ's second processor arg (token) isn't passed as `deps`.
    (job) => processLeadSquaredSyncJob(job),
    {
      connection,
      concurrency: Number(process.env.LEADSQUARED_SYNC_CONCURRENCY ?? "5"),
    },
  );
  leadSquaredWorker.on("ready", () => console.log("[worker] leadsquared-sync queue: ready"));
  leadSquaredWorker.on("failed", (job, err) =>
    onLeadSquaredJobFailed("outbound", job, err),
  );

  leadSquaredInboundWorker = new Worker<LeadSquaredInboundJobData>(
    LEADSQUARED_INBOUND_QUEUE_NAME,
    async (job) => {
      const fieldMap = await getResolvedFieldMap();
      const results = await processInboundBatch(job.data.orgId, job.data.payload, { fieldMap });
      for (const r of results) {
        console.log(
          `[worker] leadsquared-inbound: action=${r.action} prospectId=${r.lsqProspectId ?? "-"} crmLeadId=${r.crmLeadId ?? "-"}`,
        );
      }
    },
    {
      connection,
      concurrency: Number(process.env.LEADSQUARED_INBOUND_CONCURRENCY ?? "5"),
    },
  );
  leadSquaredInboundWorker.on("ready", () =>
    console.log("[worker] leadsquared-inbound queue: ready"),
  );
  leadSquaredInboundWorker.on("failed", (job, err) =>
    onLeadSquaredJobFailed("inbound", job, err),
  );

  // Inbound POLLER (safety net for LSQ changes that fire no webhook — e.g.
  // automation stage/status updates). Opt-in: set LEADSQUARED_POLL_INTERVAL_MS>0.
  const pollMs = Number(process.env.LEADSQUARED_POLL_INTERVAL_MS ?? "0");
  if (pollMs > 0) {
    let polling = false; // skip a tick if the previous one is still running
    const tick = async () => {
      if (polling) return;
      polling = true;
      try {
        const s = await pollLeadSquaredInbound();
        console.log(
          `[worker] leadsquared poll: fetched=${s.fetched} applied=${s.applied} ` +
            `window=${s.from.toISOString()}..${s.to.toISOString()}`,
        );
      } catch (err) {
        logSync("warn", "poll.error", { message: err instanceof Error ? err.message : String(err) });
        incr("poll.error");
      } finally {
        polling = false;
      }
    };
    pollTimer = setInterval(() => void tick(), pollMs);
    if (typeof pollTimer.unref === "function") pollTimer.unref();
    console.log(`[worker] leadsquared poller: every ${pollMs}ms`);
    void tick(); // run once on startup
  }
  } // end if(!automationOnly)

  console.log("[worker] running. Ctrl+C to stop.");

  const shutdown = async () => {
    console.log("[worker] shutting down…");
    if (pollTimer) clearInterval(pollTimer);
    await Promise.all([
      automationWorker.close(),
      importWorker.close(),
      leadSquaredWorker?.close(),
      leadSquaredInboundWorker?.close(),
    ]);
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
