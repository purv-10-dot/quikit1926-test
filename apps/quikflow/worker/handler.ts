/**
 * The worker's unit of work, kept in its own module (no top-level side effects)
 * so it can be unit-tested without spinning up a live BullMQ worker.
 */
import type { Job } from "bullmq";
import { dispatchEvent } from "@/lib/engine";
import type { EngineEvent } from "@/lib/engine/types";

/** Dequeued event → matched Live workflows run. Returns the run count. */
export async function handleEvent(job: Job<EngineEvent>): Promise<{ runs: number }> {
  const event = job.data;
  const results = await dispatchEvent(event);
  // eslint-disable-next-line no-console
  console.log(
    `[worker] ${event.app}.${event.event} org=${event.orgId} → ${results.length} run(s)`,
  );
  return { runs: results.length };
}
