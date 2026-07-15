import Redis from "ioredis";
import { Queue } from "groupmq";
import type { EngineEvent } from "@/lib/engine/types";

/**
 * GroupMQ queue for workflow events.
 *
 * groupId = orgId → per-org FIFO. One org's events process sequentially (and
 * in order), different orgs run in parallel. This gives tenant isolation and
 * ordering as the queue's native behavior — no extra code. No BullMQ.
 *
 * The Redis client + Queue are lazily created singletons so importing this
 * module (e.g. from a Next.js route to enqueue) doesn't open a connection
 * until the first enqueue.
 */

export const QUEUE_NAMESPACE = "quikflow:events";

let redis: Redis | null = null;
let queue: Queue<EngineEvent> | null = null;

export function getRedis(): Redis {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set — the GroupMQ execution queue requires Redis.");
  }
  redis = new Redis(url, { maxRetriesPerRequest: null });
  return redis;
}

export function getQueue(): Queue<EngineEvent> {
  if (queue) return queue;
  queue = new Queue<EngineEvent>({
    redis: getRedis(),
    namespace: QUEUE_NAMESPACE,
    jobTimeoutMs: 60_000,
    maxAttempts: 3,
  });
  return queue;
}

/**
 * Enqueue an event for asynchronous processing by the worker. Keyed by orgId
 * so per-org ordering + isolation hold.
 */
export async function enqueueEvent(event: EngineEvent): Promise<string> {
  const job = await getQueue().add({ groupId: event.orgId, data: event });
  return job.id;
}
