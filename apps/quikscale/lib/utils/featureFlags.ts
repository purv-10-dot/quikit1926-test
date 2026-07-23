import { db } from "@/lib/db";
import { resolveQuarterPosition, type QuarterPosition } from "@/lib/utils/fiscal";

/**
 * Server-side feature flag lookup for past-week data rules.
 * Reads the `FeatureFlag` table for the given tenant.
 */
export async function getPastWeekFlags(orgId: string) {
  const flags = await db.featureFlag.findMany({
    where: {
      orgId,
      key: { in: ["add_past_week_data", "edit_past_week_data"] },
    },
    select: { key: true, enabled: true },
  });

  return {
    canAddPastWeek: flags.find((f) => f.key === "add_past_week_data")?.enabled ?? false,
    canEditPastWeek: flags.find((f) => f.key === "edit_past_week_data")?.enabled ?? false,
  };
}

/**
 * Server-side read of the `add_past_quarter_habit` flag for a tenant. When
 * off (the default), `POST /api/habits` rejects assessments for quarters
 * whose configured period has already ended — mirroring how
 * `getPastWeekFlags` guards past-week KPI/priority writes.
 */
export async function getCanAddPastQuarterHabit(orgId: string): Promise<boolean> {
  return isFeatureFlagEnabled(orgId, "add_past_quarter_habit");
}

/**
 * Server-side read of the `enable_custom_quarter_settings` flag. When on, an
 * org can give each quarter a custom week count (≠ 13) and edit quarter dates
 * from the Quarter Settings forms. Default off → legacy 13-week behavior.
 */
export async function getCustomQuarterEnabled(orgId: string): Promise<boolean> {
  return isFeatureFlagEnabled(orgId, "enable_custom_quarter_settings");
}

/**
 * Generic server-side read of a single tenant feature flag. Returns `false`
 * when the flag has never been set (the default-off contract every config
 * toggle follows). Used e.g. by the WWW routes for `www_notes_required`.
 */
export async function isFeatureFlagEnabled(orgId: string, key: string): Promise<boolean> {
  const flag = await db.featureFlag.findFirst({
    where: { orgId, key },
    select: { enabled: true },
  });
  return flag?.enabled ?? false;
}

/**
 * Returns the current fiscal week for a given (year, quarter) using the
 * QuarterSetting DB record as the source of truth.
 *
 * Falls back to Math.max(1, ...) if today is before the quarter start, and the
 * quarter's `weekCount` (default 13) if past the end.
 */
export async function getCurrentFiscalWeekFromDB(
  orgId: string,
  year: number,
  quarter: string,
): Promise<number> {
  const q = await db.quarterSetting.findFirst({
    where: { orgId, fiscalYear: year, quarter },
    select: { startDate: true, endDate: true, weekCount: true },
  });

  if (!q) return 1; // no quarter record yet → default to week 1

  const total = q.weekCount ?? 13;
  const now = new Date();
  if (now < q.startDate) return 1;
  if (now > q.endDate) return total;

  const elapsedMs = now.getTime() - q.startDate.getTime();
  const week = Math.floor(elapsedMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.min(total, Math.max(1, week));
}

/**
 * Week-gate context for a (year, quarter): the clamped `currentWeek` PLUS the
 * quarter's position (past/current/future) relative to today, from the
 * QuarterSetting record. Feed both into `weekEditState` so the server rejects
 * past-quarter and future-quarter/future-week writes correctly — the clamped
 * `currentWeek` alone can't tell a past quarter's last week from an in-progress
 * one (both read as `weekCount`). One DB read for both values.
 */
export async function getWeekGateFromDB(
  orgId: string,
  year: number,
  quarter: string,
): Promise<{ currentWeek: number; quarterPosition: QuarterPosition }> {
  const q = await db.quarterSetting.findFirst({
    where: { orgId, fiscalYear: year, quarter },
    select: { startDate: true, endDate: true, weekCount: true },
  });

  // No quarter record yet → treat as the current quarter, week 1 (the gate then
  // falls back to the week-number window rather than blocking everything).
  if (!q) return { currentWeek: 1, quarterPosition: "current" };

  const total = q.weekCount ?? 13;
  const now = new Date();
  const quarterPosition = resolveQuarterPosition(q.startDate, q.endDate, now);

  let currentWeek: number;
  if (now < q.startDate) currentWeek = 1;
  else if (now > q.endDate) currentWeek = total;
  else {
    const week = Math.floor((now.getTime() - q.startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    currentWeek = Math.min(total, Math.max(1, week));
  }

  return { currentWeek, quarterPosition };
}
