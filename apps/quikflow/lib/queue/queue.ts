import Redis from "ioredis";
import { Queue, type ConnectionOptions } from "bullmq";
import type { EngineEvent } from "@/lib/engine/types";

/**
 * BullMQ queue for workflow events.
 *
 * A single queue holds every org's events; the job payload carries `orgId`, and
 * the engine scopes every match/read/write to it — so tenant isolation is
 * preserved by the engine, not the queue. (We intentionally do NOT use per-org
 * FIFO groups, which are a paid BullMQ Pro feature QuikFlow does not need:
 * unrelated events don't require ordering.)
 *
 * The Redis client + Queue are lazily created singletons so importing this
 * module (e.g. from a Next.js route to enqueue) doesn't open a connection
 * until the first enqueue.
 */

// BullMQ uses ":" as its internal Redis key separator, so the queue NAME must
// not contain a colon (the jobId may — see enqueueEvent).
export const QUEUE_NAME = "quikflow-events";
export const JOB_NAME = "event";

/** Retry policy — replaces GroupMQ's fixed maxAttempts:3 with backoff. */
const JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2_000 },
  // Keep the queue tidy; run history lives in WfRun/WfStepLog, not in Redis.
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 5_000 },
} as const;

let redis: Redis | null = null;
let queue: Queue<EngineEvent> | null = null;

export function getRedis(): Redis {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set — the BullMQ execution queue requires Redis.");
  }
  // maxRetriesPerRequest MUST be null for BullMQ's blocking connection.
  redis = new Redis(url, { maxRetriesPerRequest: null });
  return redis;
}

/**
 * The BullMQ connection. BullMQ pins an exact ioredis version, so the app's
 * ioredis client is a distinct TS type from the one BullMQ's ConnectionOptions
 * expects (same library at runtime). We narrow via `as unknown as
 * ConnectionOptions` — safe: the shared client is runtime-compatible.
 */
export function connection(): ConnectionOptions {
  return getRedis() as unknown as ConnectionOptions;
}

export function getQueue(): Queue<EngineEvent> {
  if (queue) return queue;
  queue = new Queue<EngineEvent>(QUEUE_NAME, { connection: connection() });
  return queue;
}

/**
 * Enqueue an event for asynchronous processing by the worker. The BullMQ
 * `jobId` is derived from (orgId, dedupeKey) so a repeated event is not even
 * enqueued twice; the engine additionally guards on the unique WfRun
 * (orgId, dedupeKey), giving idempotency at both layers.
 */
export async function enqueueEvent(event: EngineEvent): Promise<string> {
  // BullMQ forbids ":" in a custom jobId (it's the Redis key separator), and
  // dedupeKey routinely contains colons (e.g. "kpi:<id>:w<week>:<value>").
  // Replacing every ":" with "_" keeps the id deterministic per
  // (orgId, dedupeKey), so duplicate events still collapse to one job.
  const jobId = `${event.orgId}:${event.dedupeKey}`.replace(/:/g, "_");
  const job = await getQueue().add(JOB_NAME, event, { ...JOB_OPTS, jobId });
  return job.id ?? jobId;
}
