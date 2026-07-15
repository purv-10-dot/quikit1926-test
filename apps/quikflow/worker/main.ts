/**
 * QuikFlow execution worker — a long-lived GroupMQ consumer.
 *
 * Run locally with:  npm run worker --workspace=quikflow
 * (loads apps/quikflow/.env.local for DATABASE_URL + REDIS_URL)
 *
 * It dequeues workflow events (per-org FIFO) and hands each to the engine's
 * dispatchEvent(), which matches Live workflows and writes WfRun/WfStepLog.
 * This is a PERSISTENT process — it cannot run on Vercel serverless; in
 * production it belongs on a VM/GKE (see the architecture doc).
 */
import { Worker } from "groupmq";
import { getQueue } from "@/lib/queue/queue";
import { dispatchEvent } from "@/lib/engine";
import type { EngineEvent } from "@/lib/engine/types";

async function main() {
  const queue = getQueue();

  const worker = new Worker<EngineEvent>({
    queue,
    concurrency: 4,
    logger: true,
    handler: async (job) => {
      const event = job.data;
      const results = await dispatchEvent(event);
      // eslint-disable-next-line no-console
      console.log(
        `[worker] ${event.app}.${event.event} org=${event.orgId} → ${results.length} run(s)`,
      );
      return { runs: results.length };
    },
    onError: (err, job) => {
      // eslint-disable-next-line no-console
      console.error(`[worker] job ${job?.id ?? "?"} failed:`, err instanceof Error ? err.message : err);
    },
  });

  // eslint-disable-next-line no-console
  console.log("[worker] QuikFlow execution worker started; waiting for events…");
  await worker.run();

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`[worker] ${signal} received — closing gracefully…`);
    await worker.close(10_000);
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
