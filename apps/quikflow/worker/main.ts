/**
 * QuikFlow execution worker — a long-lived BullMQ consumer.
 *
 * Run locally with:  npm run worker --workspace=quikflow
 * (loads apps/quikflow/.env.local for DATABASE_URL + REDIS_URL)
 *
 * It dequeues workflow events and hands each to the engine's dispatchEvent()
 * (via handleEvent), which matches Live workflows and writes WfRun/WfStepLog.
 * This is a PERSISTENT process — it cannot run on Vercel serverless; in
 * production it belongs on a VM/GKE (see the architecture doc).
 */
import { createServer } from "node:http";
import type Redis from "ioredis";
import { Worker } from "bullmq";
import { connection, getRedis, QUEUE_NAME } from "@/lib/queue/queue";
import { SCHEDULER_QUEUE, ensureSchedulerTick } from "@/lib/queue/scheduler";
import { handleEvent } from "@/worker/handler";
import { runSchedulerTick } from "@/worker/scheduler";
import { runDateScan } from "@/worker/date-scan";
import { runMailScan } from "@/worker/mail-scan";
import { runFathomScan } from "@/worker/fathom-scan";
import type { EngineEvent } from "@/lib/engine/types";

/** Calendar day (UTC) of the last date-scan, so it runs ~once/day, not every tick. */
let lastDateScanDay = "";

/**
 * Minimal liveness/readiness endpoint for the otherwise-headless worker.
 *
 * Mirrors the realtime gateway's `/health` contract (services/realtime): 200
 * while Redis is connected, 503 once it drops. Without this the pod has nothing
 * to probe, and the failure mode is the quiet one — a worker whose broker
 * connection died looks identical to a worker with an empty queue, so workflows
 * stop running and nothing goes red.
 *
 * Uses node:http deliberately: one route does not justify a new dependency.
 */
function startHealthServer(redis: Redis) {
  const port = Number(process.env.WORKER_HEALTH_PORT ?? process.env.PORT ?? 9101);
  let redisReady = redis.status === "ready";
  redis.on("ready", () => {
    redisReady = true;
  });
  redis.on("end", () => {
    redisReady = false;
  });
  redis.on("close", () => {
    redisReady = false;
  });

  const server = createServer((req, res) => {
    if (req.url?.split("?")[0] !== "/health") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Not found" }));
      return;
    }
    // Same { success, data } envelope the app's API routes use (CLAUDE.md).
    res.writeHead(redisReady ? 200 : 503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        success: redisReady,
        data: {
          name: "quikflow-worker",
          redis: redis.status,
          queue: QUEUE_NAME,
          uptimeSeconds: Math.round(process.uptime()),
        },
      }),
    );
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[worker] health endpoint listening on :${port}/health`);
  });
  server.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[worker] health server error:", err instanceof Error ? err.message : err);
  });

  return { close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

async function main() {
  // Started before the workers so the pod answers probes while BullMQ warms up;
  // it reports 503 until Redis is actually ready.
  const health = startHealthServer(getRedis());

  const worker = new Worker<EngineEvent>(QUEUE_NAME, handleEvent, {
    connection: connection(),
    concurrency: 4,
  });

  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[worker] job ${job?.id ?? "?"} failed:`, err instanceof Error ? err.message : err);
  });

  // Scheduler: one repeatable 60s tick fans out due WfSchedule rows.
  const schedulerWorker = new Worker(
    SCHEDULER_QUEUE,
    async () => {
      const { fired } = await runSchedulerTick();
      if (fired > 0) {
        // eslint-disable-next-line no-console
        console.log(`[scheduler] fired ${fired} scheduled workflow(s)`);
      }
      // Inbound email: poll connected mailboxes every tick (~60s).
      try {
        const mail = await runMailScan();
        if (mail.fired > 0) {
          // eslint-disable-next-line no-console
          console.log(`[mail-scan] enqueued ${mail.fired} inbound email event(s)`);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[mail-scan] failed:", err instanceof Error ? err.message : err);
      }
      // Fathom.ai: poll connected accounts for new meeting transcripts (~60s).
      try {
        const fathom = await runFathomScan();
        if (fathom.fired > 0) {
          // eslint-disable-next-line no-console
          console.log(`[fathom-scan] enqueued ${fathom.fired} meeting transcript event(s)`);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[fathom-scan] failed:", err instanceof Error ? err.message : err);
      }
      // Relative-date triggers: heavy scan, so only once per UTC day.
      const today = new Date().toISOString().slice(0, 10);
      if (today !== lastDateScanDay) {
        lastDateScanDay = today;
        const scan = await runDateScan();
        if (scan.fired > 0) {
          // eslint-disable-next-line no-console
          console.log(`[date-scan] fired ${scan.fired} date-triggered run(s)`);
        }
      }
    },
    { connection: connection(), concurrency: 1 },
  );
  schedulerWorker.on("failed", (_job, err) => {
    // eslint-disable-next-line no-console
    console.error("[scheduler] tick failed:", err instanceof Error ? err.message : err);
  });
  await ensureSchedulerTick();

  // eslint-disable-next-line no-console
  console.log("[worker] QuikFlow execution worker + scheduler started; waiting for events…");

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`[worker] ${signal} received — closing gracefully…`);
    // Stop answering probes first so the load balancer drains this pod before
    // we tear down the consumers.
    await health.close();
    await worker.close();
    await schedulerWorker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[worker] fatal:", err);
  process.exit(1);
});
