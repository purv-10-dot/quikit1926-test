/**
 * Data worker — processes data:* jobs from the BullMQ "data" queue.
 *
 * Handles:
 *   - data:kpi-rollup    — recomputes QTD progress for all KPIs in a tenant
 *   - data:audit-digest  — compiles daily audit log summary for admins
 *
 * These are heavy queries that should NOT run in the request path.
 * Triggered via cron schedules (see scheduleRepeating in @quikit/queue).
 */

import { Worker, type Job } from "bullmq";
import Redis from "ioredis";
import type { KpiRollupData, AuditDigestData } from "../jobs/data";

async function processDataJob(job: Job): Promise<void> {
  switch (job.name) {
    case "data:kpi-rollup": {
      const data = job.data as KpiRollupData;
      console.log(
        `[dataWorker] KPI rollup for tenant=${data.tenantId} ` +
          `${data.quarter} ${data.year} week=${data.weekNumber}`,
      );
      // TODO: Import db from @quikit/database and run the rollup query
      // For now, this is a placeholder that logs the intent.
      // The actual implementation would:
      //   1. Fetch all KPIs for the tenant/quarter/year
      //   2. Aggregate weekly values → qtdAchieved
      //   3. Recompute progressPercent + healthStatus
      //   4. Batch-update via db.kPI.updateMany or $transaction
      break;
    }

    case "data:audit-digest": {
      const data = job.data as AuditDigestData;
      console.log(
        `[dataWorker] Audit digest for tenant=${data.tenantId} date=${data.date}`,
      );
      // TODO: Query AuditLog for the given date, group by entityType+action,
      // compile a summary, and store it or send via email.
      break;
    }

    default:
      console.warn(`[dataWorker] Unknown job name: ${job.name}`);
  }
}

export function startDataWorker(): Worker | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[dataWorker] REDIS_URL not set — data worker not started.");
    return null;
  }

  const connection = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const worker = new Worker("data", processDataJob, {
    connection,
    concurrency: 2, // data jobs are heavy — limit concurrency
  });

  worker.on("completed", (job) => {
    console.log(`[dataWorker] ✓ ${job.name} (${job.id})`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[dataWorker] ✗ ${job?.name} (${job?.id}):`, err.message);
  });

  console.log("[dataWorker] Started — listening for data:* jobs");
  return worker;
}
