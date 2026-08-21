/**
 * Dashboard auto-refresh cadence, shared by every polling dashboard widget so
 * they stay on one clock (and one env var) instead of drifting apart.
 *
 * 0 (or a non-numeric value) disables polling.
 */
export const REFRESH_MS = (() => {
  const raw = process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_MS;
  if (!raw) return 60_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
})();
