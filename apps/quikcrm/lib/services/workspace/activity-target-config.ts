/**
 * Read/write the org's activity-target config, stored on
 * CrmOrgWorkspaceSettings.settings.activityTargets.
 *
 * Shape:
 *   {
 *     defaultDailyTarget: number,        // SUGGESTED default shown when assigning
 *     weeklyWorkingDays: number,         // days used to derive the weekly target
 *     perUser: {
 *       [userId]: { enabled: boolean, dailyTarget?: number }
 *     },
 *   }
 *
 * Targets are OPT-IN per user. A salesperson is tracked ONLY when they have an
 * explicit `perUser[userId].enabled === true`. `defaultDailyTarget` is merely a
 * suggested value the admin can accept when assigning — it never auto-assigns a
 * target to anyone. Users without `enabled` are "No Target Assigned" and are
 * excluded from the tracker, team totals, and all attainment math.
 *
 * Effective daily target for an ASSIGNED user:
 *   perUser[userId].dailyTarget ?? defaultDailyTarget
 *
 * Backward compatibility: an older config stored `perUser[userId]` as a bare
 * number (implicit "assigned with this target"). On read we migrate that to
 * { enabled: true, dailyTarget: <number> } so previously-set overrides remain
 * assigned. (The old default-applies-to-everyone behavior is intentionally
 * dropped — only users that had an explicit override stay tracked.)
 *
 * Mirrors the read/write merge pattern in `pipeline-config.ts` so sibling
 * settings keys (leadPipelineConfig, dashboard, digest, …) are preserved on
 * every write. No new Prisma model — this is a JSON sub-key.
 */

import { prisma } from "@/lib/db/prisma";

export const DEFAULT_DAILY_TARGET = 10;
export const DEFAULT_WEEKLY_WORKING_DAYS = 5;

export interface UserTargetAssignment {
  enabled: boolean;
  /** Optional per-user target. When omitted for an enabled user, defaultDailyTarget applies. */
  dailyTarget?: number;
}

export interface ActivityTargetConfig {
  /** Suggested value when assigning — NOT auto-applied to unassigned users. */
  defaultDailyTarget: number;
  weeklyWorkingDays: number;
  perUser: Record<string, UserTargetAssignment>;
}

interface SettingsTree {
  activityTargets?: unknown;
  [k: string]: unknown;
}

async function readTree(orgId: string): Promise<SettingsTree> {
  const row = await prisma.crmOrgWorkspaceSettings.findUnique({ where: { orgId } });
  return ((row?.settings as SettingsTree | null) ?? {}) as SettingsTree;
}

async function writeTree(orgId: string, next: SettingsTree): Promise<void> {
  await prisma.crmOrgWorkspaceSettings.upsert({
    where: { orgId },
    create: { orgId, settings: next as object },
    update: { settings: next as object },
  });
}

/** Coerce an unknown value to a non-negative integer, or null if invalid. */
function toNonNegInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.floor(v);
  return n >= 0 ? n : null;
}

/**
 * Normalize a stored per-user map into the assignment shape, migrating the
 * legacy bare-number form to { enabled: true, dailyTarget }.
 */
function sanitizePerUser(raw: unknown): Record<string, UserTargetAssignment> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, UserTargetAssignment> = {};
  for (const [userId, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!userId) continue;

    // Legacy: bare number → assigned with that target.
    if (typeof val === "number") {
      const n = toNonNegInt(val);
      if (n !== null) out[userId] = { enabled: true, dailyTarget: n };
      continue;
    }

    if (val && typeof val === "object") {
      const obj = val as Record<string, unknown>;
      const enabled = obj.enabled === true;
      // Only keep an entry if it carries meaning (enabled, or a stored target).
      const dailyTarget = toNonNegInt(obj.dailyTarget);
      if (!enabled && dailyTarget === null) continue;
      const assignment: UserTargetAssignment = { enabled };
      if (dailyTarget !== null) assignment.dailyTarget = dailyTarget;
      out[userId] = assignment;
    }
  }
  return out;
}

export async function getActivityTargetConfig(orgId: string): Promise<ActivityTargetConfig> {
  const tree = await readTree(orgId);
  const cfg = (tree.activityTargets && typeof tree.activityTargets === "object"
    ? (tree.activityTargets as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const defaultDailyTarget = toNonNegInt(cfg.defaultDailyTarget) ?? DEFAULT_DAILY_TARGET;
  const weeklyWorkingDays = toNonNegInt(cfg.weeklyWorkingDays);
  return {
    defaultDailyTarget,
    weeklyWorkingDays:
      weeklyWorkingDays && weeklyWorkingDays > 0 ? weeklyWorkingDays : DEFAULT_WEEKLY_WORKING_DAYS,
    perUser: sanitizePerUser(cfg.perUser),
  };
}

export interface ActivityTargetPatch {
  defaultDailyTarget?: number;
  weeklyWorkingDays?: number;
  perUser?: Record<string, UserTargetAssignment>;
}

export async function setActivityTargetConfig(
  orgId: string,
  patch: ActivityTargetPatch,
): Promise<ActivityTargetConfig> {
  const tree = await readTree(orgId);
  const current = await getActivityTargetConfig(orgId);

  const nextDefault = patch.defaultDailyTarget !== undefined
    ? toNonNegInt(patch.defaultDailyTarget) ?? current.defaultDailyTarget
    : current.defaultDailyTarget;

  const nextWeeklyDays = patch.weeklyWorkingDays !== undefined
    ? (toNonNegInt(patch.weeklyWorkingDays) || current.weeklyWorkingDays)
    : current.weeklyWorkingDays;

  const merged: ActivityTargetConfig = {
    defaultDailyTarget: nextDefault,
    weeklyWorkingDays: nextWeeklyDays,
    perUser: patch.perUser !== undefined ? sanitizePerUser(patch.perUser) : current.perUser,
  };

  await writeTree(orgId, { ...tree, activityTargets: merged });
  return merged;
}

/**
 * Whether a user has a target ASSIGNED (opt-in). Only assigned users are
 * tracked, counted in totals, or shown in the tracker.
 */
export function isTargetAssigned(cfg: ActivityTargetConfig, userId: string): boolean {
  return cfg.perUser[userId]?.enabled === true;
}

/**
 * Effective DAILY target for an ASSIGNED user: their per-user value, or the
 * suggested org default when they were assigned without an explicit value.
 * Callers MUST gate on isTargetAssigned first — this does not itself check
 * assignment (it falls back to the default for a bare enabled entry).
 */
export function resolveDailyTarget(cfg: ActivityTargetConfig, userId: string): number {
  const entry = cfg.perUser[userId];
  if (entry?.dailyTarget !== undefined) return entry.dailyTarget;
  return cfg.defaultDailyTarget;
}

export function resolveWeeklyTarget(cfg: ActivityTargetConfig, userId: string): number {
  return resolveDailyTarget(cfg, userId) * cfg.weeklyWorkingDays;
}
