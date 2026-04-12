/**
 * @quikit/queue — BullMQ-based background job system.
 *
 * Provides named queues for async work that should NOT block API requests:
 *   - email:*    — sending transactional emails (review reminders, meeting alerts)
 *   - export:*   — PDF generation, CSV export
 *   - data:*     — KPI rollup, audit digest compilation
 *
 * All queues share the same Redis connection from @quikit/redis.
 * If Redis is unavailable, `enqueue()` silently no-ops and logs a warning —
 * the app degrades gracefully (emails don't send, exports don't run, but
 * no user-facing errors occur).
 *
 * Usage:
 *   import { enqueue } from "@quikit/queue";
 *   await enqueue("email:review-reminder", { tenantId, userId, quarter, year });
 */

import { Queue, type JobsOptions } from "bullmq";
import Redis from "ioredis";

let _connection: Redis | null = null;
const _queues = new Map<string, Queue>();

function getConnection(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!_connection) {
    _connection = new Redis(url, {
      maxRetriesPerRequest: null, // BullMQ requires this
      enableReadyCheck: false,
    });
    _connection.on("error", (err) => {
      console.error("[queue] Redis connection error:", err.message);
    });
  }
  return _connection;
}

function getQueue(name: string): Queue | null {
  const connection = getConnection();
  if (!connection) return null;

  if (!_queues.has(name)) {
    _queues.set(
      name,
      new Queue(name, {
        connection,
        defaultJobOptions: {
          removeOnComplete: { count: 1000 }, // keep last 1000 completed
          removeOnFail: { count: 5000 },     // keep last 5000 failed for debugging
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
        },
      }),
    );
  }
  return _queues.get(name)!;
}

/* ── Public API ───────────────────────────────────────────────────────── */

export type JobName =
  | "email:review-reminder"
  | "email:meeting-reminder"
  | "email:feedback-notification"
  | "export:opsp-pdf"
  | "data:kpi-rollup"
  | "data:audit-digest";

/**
 * Enqueue a background job.
 *
 * Returns the job ID on success, or null if Redis is unavailable.
 * Never throws — callers can fire-and-forget safely.
 */
export async function enqueue<T = Record<string, unknown>>(
  name: JobName,
  data: T,
  opts?: JobsOptions,
): Promise<string | null> {
  // Determine which queue this job belongs to (prefix before the colon)
  const queueName = name.split(":")[0]; // "email", "export", "data"
  const queue = getQueue(queueName);

  if (!queue) {
    console.warn(`[queue] Redis unavailable — job "${name}" dropped. Data:`, data);
    return null;
  }

  try {
    const job = await queue.add(name, data, opts);
    return job.id ?? null;
  } catch (err) {
    console.error(`[queue] Failed to enqueue "${name}":`, err);
    return null;
  }
}

/**
 * Schedule a repeating job (cron-based).
 *
 * Example:
 *   scheduleRepeating("data:kpi-rollup", {}, { pattern: "0 0 * * 0" }); // every Sunday midnight
 */
export async function scheduleRepeating<T = Record<string, unknown>>(
  name: JobName,
  data: T,
  repeat: { pattern: string; tz?: string },
): Promise<string | null> {
  const queueName = name.split(":")[0];
  const queue = getQueue(queueName);

  if (!queue) {
    console.warn(`[queue] Redis unavailable — repeating job "${name}" not scheduled.`);
    return null;
  }

  try {
    const job = await queue.add(name, data, {
      repeat: { pattern: repeat.pattern, tz: repeat.tz ?? "UTC" },
    });
    return job.id ?? null;
  } catch (err) {
    console.error(`[queue] Failed to schedule repeating "${name}":`, err);
    return null;
  }
}

/**
 * Gracefully close all queues and the Redis connection.
 */
export async function closeQueues(): Promise<void> {
  for (const q of _queues.values()) {
    await q.close();
  }
  _queues.clear();
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}

// Re-export Worker for consumer-side usage
export { Worker, type Job } from "bullmq";
