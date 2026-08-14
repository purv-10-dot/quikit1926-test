import type { ConnectionOptions } from "bullmq";
import { getQueueRedis } from "@/lib/db/redis";

/**
 * The BullMQ `connection` option, correctly typed.
 *
 * bullmq bundles its OWN copy of ioredis (node_modules/bullmq/node_modules/ioredis),
 * so the `Redis` instance produced by the app's top-level ioredis is structurally
 * identical but nominally a different type. TypeScript therefore rejects it with
 * "Type 'Redis' is not assignable to type 'ConnectionOptions'" — the error that
 * has been failing `next build` in every queue module.
 *
 * At runtime the two are the same class from the same package at the same major
 * version, and BullMQ only ever calls the standard ioredis surface on it, so the
 * cast is sound. It goes through `unknown` (never `as any`, which this app's
 * CLAUDE.md bans) and lives here once instead of being repeated in each queue
 * file.
 *
 * The real fix is deduping ioredis so bullmq resolves the hoisted copy, but that
 * is a root-level dependency change and this app is the only bullmq consumer.
 */
export function queueConnection(): ConnectionOptions {
  return getQueueRedis() as unknown as ConnectionOptions;
}
