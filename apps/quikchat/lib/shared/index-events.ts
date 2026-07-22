import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";

/**
 * Search index seam — mirrors `publishFanout`. Message mutations emit an index
 * event so the QuikverseAI runtime's search (Phase 4) can keep its index fresh.
 *   - in-process EventEmitter ALWAYS fires (test spy via `__getIndexedForTest`).
 *   - when `REDIS_URL` is set, also `PUBLISH "quikchat:index"`.
 * See INDEX-SEAM.md.
 */

export const INDEX_CHANNEL = "quikchat:index";

export type IndexOp = "upsert" | "delete";

export interface IndexEvent {
  op: IndexOp;
  orgId: string;
  app: "quikchat";
  entity: "message";
  id: string;
  channelId: string;
  senderId?: string | null;
  actorType?: string;
  type?: string;
  text?: string;
  createdAt?: string;
}

const emitter = new EventEmitter();
let captureForTest = false;
let indexed: IndexEvent[] = [];

let redisPubPromise: Promise<Redis> | null = null;
async function getRedisPub(): Promise<Redis | null> {
  if (!process.env.REDIS_URL) return null;
  if (!redisPubPromise) {
    redisPubPromise = import("ioredis").then(
      ({ default: RedisCtor }) => new RedisCtor(process.env.REDIS_URL!),
    );
  }
  return redisPubPromise;
}

export async function emitIndexEvent(evt: IndexEvent): Promise<void> {
  if (captureForTest) indexed.push(evt);
  emitter.emit("*", evt);
  const pub = await getRedisPub();
  if (pub) {
    try {
      await pub.publish(INDEX_CHANNEL, JSON.stringify(evt));
    } catch {
      // Best-effort: an index hiccup must not fail the originating request.
    }
  }
}

export function onIndexEvent(listener: (evt: IndexEvent) => void): () => void {
  emitter.on("*", listener);
  return () => emitter.off("*", listener);
}

export function __resetIndexedForTest(): void {
  captureForTest = true;
  indexed = [];
}

export function __getIndexedForTest(): IndexEvent[] {
  return indexed;
}
