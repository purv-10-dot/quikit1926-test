/**
 * HTTP cache headers for GET responses.
 *
 * Use on read-heavy, slow-changing endpoints (master data: vendors,
 * items, projects, locations, UOMs, GST/TDS codes, terms templates).
 * Browsers will reuse the cached response on rapid page navigations,
 * cutting one network round-trip per repeated read.
 *
 * Strategy: `private` (per-user, never CDN — responses are tenant-
 * scoped), short `max-age` (fresh for a few seconds so React Query
 * can rely on it), longer `stale-while-revalidate` (fall back on
 * stale up to N seconds while the browser fetches a fresh copy in
 * the background).
 *
 * IMPORTANT: every mutating route on the same path should respond
 * with `no-store` so a successful POST/PATCH/DELETE doesn't get
 * cached, AND the GET cache will be revalidated within `max-age`
 * — RQ already invalidates its own cache, so the worst-case lag
 * after a master edit is `max-age` seconds.
 */

import { NextResponse } from "next/server";

export type MasterCacheTier = "short" | "medium" | "long";

const POLICIES: Record<MasterCacheTier, string> = {
  // Vendors / items — change occasionally; ~10s caching is plenty.
  short: "private, max-age=10, stale-while-revalidate=60",
  // Projects / locations — change rarely.
  medium: "private, max-age=30, stale-while-revalidate=300",
  // Codes that almost never change after seed (UOM, GST, TDS).
  long: "private, max-age=300, stale-while-revalidate=3600",
};

/**
 * Wrap a JSON payload in a NextResponse with browser cache headers.
 *
 * Replaces:
 *   return NextResponse.json({ data, total: data.length });
 * with:
 *   return cachedJson({ data, total: data.length }, "short");
 */
export function cachedJson(
  body: unknown,
  tier: MasterCacheTier = "short",
  init?: { status?: number; headers?: HeadersInit },
): NextResponse {
  const res = NextResponse.json(body as any, init);
  res.headers.set("Cache-Control", POLICIES[tier]);
  // Explicit Vary so two users on the same browser don't share cache —
  // every authenticated request carries the session cookie, so varying
  // on cookie keeps each user's responses distinct in the disk cache.
  res.headers.set("Vary", "Cookie");
  return res;
}

/** Tell the browser NOT to cache (POST/PATCH/DELETE responses). */
export function noStoreJson(
  body: unknown,
  init?: { status?: number; headers?: HeadersInit },
): NextResponse {
  const res = NextResponse.json(body as any, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
