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
import { Worker } from "bullmq";
import { connection, QUEUE_NAME } from "@/lib/queue/queue";
import { handleEvent } from "@/worker/handler";
import type { EngineEvent } from "@/lib/engine/types";

async function main() {
  const worker = new Worker<EngineEvent>(QUEUE_NAME, handleEvent, {
    connection: connection(),
    concurrency: 4,
  });

  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[worker] job ${job?.id ?? "?"} failed:`, err instanceof Error ? err.message : err);
  });

  // eslint-disable-next-line no-console
  console.log("[worker] QuikFlow execution worker started; waiting for events…");

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`[worker] ${signal} received — closing gracefully…`);
    await worker.close();
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
