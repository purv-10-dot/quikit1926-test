/**
 * Read/write per-salesperson DAILY targets for individual ACTIVITY TYPES.
 *
 * Storage is the dedicated CrmActivityTypeTarget table (user × activity type),
 * NOT a JSON sub-key — so targets are indexed and cascade with their type.
 *
 * Relationship to the OVERALL target: none. The org-wide/per-user overall daily
 * target still lives on CrmOrgWorkspaceSettings.settings.activityTargets and is
 * read through `activity-target-config.ts`. The two layers are independent —
 * a user may have type targets without an overall target and vice versa — so
 * every existing overall-target behavior keeps working untouched.
 *
 * Activity types come from the admin-managed CrmActivityType rows, so a type
 * created in Settings → Activity Types is immediately targetable with no code
 * change. Only ACTIVE types are offered for assignment; targets stored against
 * a type that is later deactivated are retained (and reappear if it is
 * reactivated) but are excluded from tracking while inactive.
 */
import { prisma } from "@/lib/db/prisma";

/**
 * Which underlying record sources count toward a type's progress.
 *
 * Driven by `CrmActivityType.config.countsSources` so it is DATA, not code: an
 * admin-created type needs no code change, and the mapping for the seeded
 * "call"/"task" types is seeded rather than special-cased at the call site.
 *
 * - "activity" — CrmActivity rows whose `type` matches this type's code.
 * - "call"     — CrmCallLog rows (telephony logs carry no activity-type code).
 * - "task"     — CrmTask rows with status "Completed".
 *
 * A type with no explicit config counts activities only, which is the correct
 * default for every custom type.
 */
export const COUNT_SOURCES = ["activity", "call", "task"] as const;
export type CountSource = (typeof COUNT_SOURCES)[number];

export const DEFAULT_COUNT_SOURCES: readonly CountSource[] = ["activity"];

export interface ActivityTypeTargetRow {
  activityTypeId: string;
  code: string;
  label: string;
  sortOrder: number;
  dailyTarget: number;
  countsSources: CountSource[];
}

/** Coerce an unknown value to a non-negative integer, or null if invalid. */
export function toNonNegInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.floor(v);
  return n >= 0 ? n : null;
}

/**
 * Read `countsSources` off a type's `config` JSON, falling back to
 * activities-only. Unknown entries are dropped rather than throwing so a
 * hand-edited config can never break the tracker.
 */
export function readCountSources(config: unknown): CountSource[] {
  if (config && typeof config === "object") {
    const raw = (config as Record<string, unknown>).countsSources;
    if (Array.isArray(raw)) {
      const valid = raw.filter((s): s is CountSource =>
        typeof s === "string" && (COUNT_SOURCES as readonly string[]).includes(s),
      );
      // De-dupe; an explicitly empty list is honored (type counts nothing).
      if (raw.length > 0) return [...new Set(valid)];
      return [];
    }
  }
  return [...DEFAULT_COUNT_SOURCES];
}

interface TypeRow {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
  config: unknown;
}

/**
 * Active activity types for an org, in display order. This is the single source
 * of truth for "which types can hold a target" — always `isActive: true`, so a
 * deactivated type never appears on the assignment screen or in the tracker.
 */
export async function listActiveTargetableTypes(orgId: string): Promise<TypeRow[]> {
  const rows = await prisma.crmActivityType.findMany({
    where: { orgId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { id: true, code: true, label: true, sortOrder: true, config: true },
  });
  return (Array.isArray(rows) ? rows : []) as unknown as TypeRow[];
}

/**
 * Every active type for the org, joined with `userId`'s stored target.
 * Types with no stored row come back with dailyTarget 0 — "empty defaults to
 * 0" — so the caller always receives one entry per active type.
 */
export async function getUserActivityTypeTargets(
  orgId: string,
  userId: string,
): Promise<ActivityTypeTargetRow[]> {
  const [types, stored] = await Promise.all([
    listActiveTargetableTypes(orgId),
    prisma.crmActivityTypeTarget.findMany({
      where: { orgId, userId },
      select: { activityTypeId: true, dailyTarget: true },
    }),
  ]);

  const byTypeId = new Map(
    (Array.isArray(stored) ? stored : []).map((t) => [t.activityTypeId, t.dailyTarget]),
  );
  return types.map((t) => ({
    activityTypeId: t.id,
    code: t.code,
    label: t.label,
    sortOrder: t.sortOrder,
    dailyTarget: byTypeId.get(t.id) ?? 0,
    countsSources: readCountSources(t.config),
  }));
}

/**
 * Batch variant for the admin tracker/settings screens: userId → its rows.
 * One query for the types and one for ALL users' targets, so the screen scales
 * with the org instead of issuing a query per salesperson.
 */
export async function getActivityTypeTargetsForUsers(
  orgId: string,
  userIds: string[],
): Promise<Map<string, ActivityTypeTargetRow[]>> {
  const out = new Map<string, ActivityTypeTargetRow[]>();
  const types = await listActiveTargetableTypes(orgId);
  if (userIds.length === 0) return out;

  const stored = await prisma.crmActivityTypeTarget.findMany({
    where: { orgId, userId: { in: userIds } },
    select: { userId: true, activityTypeId: true, dailyTarget: true },
  });

  // userId → (activityTypeId → dailyTarget)
  const byUser = new Map<string, Map<string, number>>();
  for (const row of Array.isArray(stored) ? stored : []) {
    const m = byUser.get(row.userId) ?? new Map<string, number>();
    m.set(row.activityTypeId, row.dailyTarget);
    byUser.set(row.userId, m);
  }

  for (const userId of userIds) {
    const m = byUser.get(userId);
    out.set(
      userId,
      types.map((t) => ({
        activityTypeId: t.id,
        code: t.code,
        label: t.label,
        sortOrder: t.sortOrder,
        dailyTarget: m?.get(t.id) ?? 0,
        countsSources: readCountSources(t.config),
      })),
    );
  }
  return out;
}

export interface ActivityTypeTargetPatch {
  userId: string;
  activityTypeId: string;
  dailyTarget: number;
}

/**
 * Upsert a batch of (user, type) targets.
 *
 * Validation rules enforced here (the API layer validates shape; this enforces
 * tenancy + referential integrity):
 *   • Every activityTypeId must be an ACTIVE type in THIS org — entries naming
 *     a foreign, unknown or inactive type are silently skipped rather than
 *     letting a caller write a cross-org row.
 *   • dailyTarget is floored to a non-negative integer; invalid values become 0.
 *
 * A target of 0 is stored explicitly rather than deleted, so "0" is a real,
 * auditable assignment distinct from "never configured". Both read back as 0.
 */
export async function setActivityTypeTargets(
  orgId: string,
  patches: ActivityTypeTargetPatch[],
): Promise<number> {
  if (patches.length === 0) return 0;

  const activeTypeIds = new Set((await listActiveTargetableTypes(orgId)).map((t) => t.id));

  // Last write wins per (user, type) so a duplicated key in one payload cannot
  // deadlock the transaction against itself.
  const deduped = new Map<string, ActivityTypeTargetPatch>();
  for (const p of patches) {
    if (!p.userId || !activeTypeIds.has(p.activityTypeId)) continue;
    deduped.set(`${p.userId}::${p.activityTypeId}`, {
      userId: p.userId,
      activityTypeId: p.activityTypeId,
      dailyTarget: toNonNegInt(p.dailyTarget) ?? 0,
    });
  }
  if (deduped.size === 0) return 0;

  const ops = [...deduped.values()].map((p) =>
    prisma.crmActivityTypeTarget.upsert({
      where: {
        orgId_userId_activityTypeId: {
          orgId,
          userId: p.userId,
          activityTypeId: p.activityTypeId,
        },
      },
      create: {
        orgId,
        userId: p.userId,
        activityTypeId: p.activityTypeId,
        dailyTarget: p.dailyTarget,
      },
      update: { dailyTarget: p.dailyTarget },
    }),
  );

  await prisma.$transaction(ops);
  return ops.length;
}

/** True when the user has at least one active type target above zero. */
export function hasAnyTypeTarget(rows: ActivityTypeTargetRow[]): boolean {
  return rows.some((r) => r.dailyTarget > 0);
}
