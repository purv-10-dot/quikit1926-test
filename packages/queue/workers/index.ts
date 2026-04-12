/**
 * Worker entrypoints — start all BullMQ workers.
 *
 * In production, run these as a separate process:
 *   node -e "require('@quikit/queue/workers').startAllWorkers()"
 *
 * Or import individual workers for selective startup.
 */

export { startEmailWorker } from "./emailWorker";
export { startDataWorker } from "./dataWorker";

import { startEmailWorker } from "./emailWorker";
import { startDataWorker } from "./dataWorker";

/**
 * Start all workers. Returns an array of active workers (null entries
 * are filtered out — they indicate Redis was unavailable).
 */
export function startAllWorkers() {
  const workers = [startEmailWorker(), startDataWorker()].filter(Boolean);
  console.log(`[workers] ${workers.length} worker(s) started`);
  return workers;
}
