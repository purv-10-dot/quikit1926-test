/**
 * Rate Limiter
 *
 * Fixed-window in-memory limiter for single-node deployments. Intended for
 * abuse prevention on sensitive endpoints: login, imports, approval
 * actions. NOT a replacement for a proper DDoS layer.
 *
 * Usage from a route handler:
 *
 *   const limited = await rateLimit({
 *     req, bucket: "login", limit: 10, windowMs: 60_000,
 *   });
 *   if (limited.blocked) return limited.response!;
 *
 * Contract:
 *   - Keyed by (bucket, identifier). Default identifier is the client IP;
 *     pass `identifier` explicitly for per-user or per-tenant limits.
 *   - 429 response carries Retry-After + X-RateLimit-* headers.
 *   - Window resets at fixed intervals (not sliding) — keeps the math
 *     simple and the memory bounded.
 *   - Disabled entirely when `RATE_LIMIT_DISABLED=true` (tests, CI,
 *     extreme incidents). Logs a warning on boot when disabled.
 *
 * Distributed deployment:
 *   The in-memory store works per-node. Behind a load balancer with N
 *   nodes, effective rate is N × `limit`. For production multi-node,
 *   swap the `store` implementation for a Redis-backed one — the
 *   interface is minimal (get/set/incr with TTL).
 */

import { NextResponse, type NextRequest } from "next/server";
import { err as envelopeErr } from "@/lib/http/envelope";

export interface RateLimitOptions {
  /** Logical bucket name — e.g. "login", "boq.import", "approve". */
  bucket: string;
  /** Max requests per window. */
  limit: number;
  /** Window size in ms. */
  windowMs: number;
  /** The incoming request (for IP lookup + header response). */
  req: NextRequest;
  /**
   * Override the default identifier. Use this for per-user limits:
   *   identifier: ctx.userId
   * Or per-org:
   *   identifier: ctx.orgId
   * Default is the best-effort client IP.
   */
  identifier?: string;
}

export interface RateLimitResult {
  blocked: boolean;
  remaining: number;
  resetAt: number;
  /** Pre-built 429 response — only set when blocked. */
  response?: NextResponse;
}

// ─── Store ──────────────────────────────────────────────────────────

interface Bucket {
  count: number;
  resetAt: number;
}

type Store = Map<string, Bucket>;

const g = globalThis as { __qcRateLimitStore?: Store };
if (!g.__qcRateLimitStore) g.__qcRateLimitStore = new Map();
const store: Store = g.__qcRateLimitStore;

/**
 * Periodic cleanup so expired buckets don't leak memory on a long-running
 * server. Runs at most every 60s — cheap since the map is bounded by the
 * number of distinct (bucket, identifier) pairs currently active.
 */
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  // Use forEach to avoid needing `downlevelIteration` on the current tsconfig target.
  const stale: string[] = [];
  store.forEach((b, key) => {
    if (b.resetAt < now) stale.push(key);
  });
  for (const key of stale) store.delete(key);
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

// ─── Public API ─────────────────────────────────────────────────────

export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  if (process.env.RATE_LIMIT_DISABLED === "true") {
    return { blocked: false, remaining: opts.limit, resetAt: Date.now() + opts.windowMs };
  }

  // E2E test traffic bypass. The `x-e2e-test` header is set by the test
  // api-client fixture (tests/e2e/fixtures/api-client.ts). It's a DEV-ONLY
  // bypass — production must run with NODE_ENV=production AND
  // RATE_LIMIT_DISABLED unset, at which point this branch has no effect
  // because the header gate is gated on NODE_ENV below.
  if (
    process.env.NODE_ENV !== "production" &&
    opts.req.headers.get("x-e2e-test") === "1"
  ) {
    return { blocked: false, remaining: opts.limit, resetAt: Date.now() + opts.windowMs };
  }

  const now = Date.now();
  sweep(now);

  const id = opts.identifier ?? clientIp(opts.req);
  const key = `${opts.bucket}:${id}`;
  const existing = store.get(key);

  let bucket: Bucket;
  if (!existing || existing.resetAt < now) {
    bucket = { count: 1, resetAt: now + opts.windowMs };
    store.set(key, bucket);
  } else {
    existing.count += 1;
    bucket = existing;
  }

  const remaining = Math.max(0, opts.limit - bucket.count);
  const blocked = bucket.count > opts.limit;

  if (!blocked) {
    return { blocked: false, remaining, resetAt: bucket.resetAt };
  }

  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  const response = envelopeErr(
    "RATE_LIMITED",
    `Too many requests. Retry after ${retryAfterSec}s.`,
    429,
    { bucket: opts.bucket, retryAfterSec }
  );
  response.headers.set("Retry-After", String(retryAfterSec));
  response.headers.set("X-RateLimit-Limit", String(opts.limit));
  response.headers.set("X-RateLimit-Remaining", "0");
  response.headers.set("X-RateLimit-Reset", String(Math.floor(bucket.resetAt / 1000)));

  return { blocked: true, remaining: 0, resetAt: bucket.resetAt, response };
}

/**
 * Canonical limit presets. Use these instead of magic numbers so the
 * tuning is visible in one place.
 */
export const LIMITS = {
  /** Login — strict, per-IP. Prevents credential stuffing. */
  LOGIN: { bucket: "auth.login", limit: 10, windowMs: 60_000 }, // 10/min/IP
  /** BOQ / workbook imports — per-user. These are expensive server-side. */
  IMPORT_BOQ: { bucket: "boq.import", limit: 5, windowMs: 60_000 }, // 5/min/user
  /** Approval actions — per-user. Prevents double-click spam + script abuse. */
  APPROVAL: { bucket: "approval.action", limit: 30, windowMs: 60_000 }, // 30/min/user
  /** Signed URL mint — can be expensive if it hits S3 presign on every call. */
  SIGNED_URL: { bucket: "files.presign", limit: 60, windowMs: 60_000 }, // 60/min/user
  /** Generic public endpoint budget. */
  PUBLIC: { bucket: "public", limit: 100, windowMs: 60_000 },
} as const;
