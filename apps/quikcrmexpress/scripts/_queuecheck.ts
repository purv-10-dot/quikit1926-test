// Standalone BullMQ queue inspector — counts jobs in each state for the
// automation queue. Run with the SAME env as the app/worker so it hits the
// same Redis. Tells us: are jobs enqueued but stuck (waiting>0), or never
// enqueued (all 0), or failing (failed>0)?
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";

async function main() {
  const url = process.env.REDIS_URL;
  console.log("REDIS_URL present:", Boolean(url && url.trim()));
  if (!url) { console.log("No REDIS_URL — the app CANNOT enqueue. That's the bug."); process.exit(0); }

  const connection = new IORedis(url, { maxRetriesPerRequest: null });
  // Cast only at the BullMQ boundary — see lib/queue/connection.ts: bullmq
  // bundles its own ioredis copy, so the app's Redis instance is structurally
  // identical but nominally a different type. `connection` itself stays a real
  // Redis so we can still call .quit() on it below.
  const q = new Queue("automation", {
    connection: connection as unknown as ConnectionOptions,
  });

  const counts = await q.getJobCounts("waiting", "active", "delayed", "completed", "failed", "paused");
  console.log("automation queue job counts:", counts);

  // Show the last few failed jobs' reasons, if any.
  const failed = await q.getFailed(0, 5);
  for (const j of failed) {
    console.log("FAILED job", j.id, "reason:", j.failedReason);
  }
  // Show waiting jobs (stuck = enqueued but not consumed).
  const waiting = await q.getWaiting(0, 5);
  for (const j of waiting) {
    console.log("WAITING job", j.id, "data.workflowId:", (j.data as {workflowId?:string}).workflowId);
  }

  await q.close();
  await connection.quit();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
