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

export function getAggCache(userId: string, days: number, workspaceId?: string): DashboardData | null {
  const e = agg.get(`${userId}:${days}:${workspaceId ?? ""}`);
  return e && Date.now() - e.ts < AGG_TTL ? e.data : null;
}
export function setAggCache(userId: string, days: number, data: DashboardData, workspaceId?: string): void {
  agg.set(`${userId}:${days}:${workspaceId ?? ""}`, { data, ts: Date.now() });
}

// Clears both caches — called on connect/disconnect/metadata changes so the next
// aggregation reflects reality immediately.
export function clearCache(): void {
  legacy = null;
  agg.clear();
}
