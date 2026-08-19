import type { DashboardData } from "@/lib/types";

// ── Legacy single-slot cache (used by /api/dashboard-data) ───────────────────
export type CacheEntry = { data: DashboardData; ts: number; days: number };
let legacy: CacheEntry | null = null;
export function getCache(): CacheEntry | null { return legacy; }
export function setCache(entry: CacheEntry): void { legacy = entry; }
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── Per-user aggregation cache (used by getAggregatedDashboard) ──────────────
// A single page load fires Overview + Insights (+ repeats), each of which would
// otherwise trigger a full live-platform aggregation. This short-TTL cache
// collapses that burst into one aggregation per (user, window).
const agg = new Map<string, { data: DashboardData; ts: number }>();
export const AGG_TTL = 60 * 1000; // 60s
const MAX_AGG_ENTRIES = 200;

/**
 * Keyed on the RESOLVED PERIOD, not a day count.
 *
 * A comparison request and a plain request can cover the same current window
 * but must not share an entry — otherwise turning comparison on would serve a
 * cached payload with no deltas (or worse, deltas from a different baseline).
 * Build the key with periodCacheKey() from lib/period/resolve.ts.
 */
export function getAggCache(userId: string, periodKey: string, workspaceId?: string): DashboardData | null {
  const e = agg.get(`${userId}:${periodKey}:${workspaceId ?? ""}`);
  return e && Date.now() - e.ts < AGG_TTL ? e.data : null;
}
export function setAggCache(userId: string, periodKey: string, data: DashboardData, workspaceId?: string): void {
  // Custom ranges make the keyspace unbounded, so evict oldest-first once the
  // map grows past a sane ceiling. Without this the process leaks one entry per
  // distinct window the user ever picks.
  if (agg.size >= MAX_AGG_ENTRIES) {
    const oldest = [...agg.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]?.[0];
    if (oldest) agg.delete(oldest);
  }
  agg.set(`${userId}:${periodKey}:${workspaceId ?? ""}`, { data, ts: Date.now() });
}

// Clears both caches — called on connect/disconnect/metadata changes so the next
// aggregation reflects reality immediately.
export function clearCache(): void {
  legacy = null;
  agg.clear();
}
