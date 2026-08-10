/**
 * Per-ACTIVITY-TYPE counting for the type-wise target feature.
 *
 * Sits alongside `activity-target-count.ts` (which counts the OVERALL total)
 * and deliberately reuses its window helper and the shared owner-scope filters,
 * so "today" and "who owns this record" mean exactly the same thing in both
 * paths. Nothing in the overall path is modified.
 *
 * Matching an activity to a type:
 *   `CrmActivity.type` is a free-form String holding the activity type's CODE,
 *   but writers disagree on case/format ("email" vs "Email", "follow-up" vs
 *   "follow_up"). We therefore match on the SAME normalized key the Activities
 *   summary chips already use (`normalizeTypeKey`) rather than on raw equality,
 *   so a type counts its activities regardless of which writer produced them.
 *   Because normalization cannot be expressed in a Prisma `where`, today's rows
 *   are grouped by `type` in ONE query per user and folded in memory — which
 *   also keeps this to a single round-trip instead of one query per type.
 *
 * Call logs and completed tasks carry no activity-type code. They are attributed
 * via each type's `config.countsSources` (see activity-type-target-config.ts) —
 * data, not hardcoded type names — so the default "Call" type counts CrmCallLog
 * rows and "Task" counts completed CrmTask rows, while every other type counts
 * activities only.
 */
import { prisma } from "@/lib/db/prisma";
import { resolveOwnerScope, spreadOwnerFilter } from "./owner-scope";
import { normalizeTypeKey } from "@/lib/services/activities/type-summary";
import type { ActivityTypeTargetRow } from "@/lib/services/workspace/activity-type-target-config";
import type { ActivityWindow } from "./activity-target-count";

/** Raw per-source counts for one user in one window. */
export interface TypeSourceCounts {
  /** normalized type key → count of CrmActivity rows */
  byActivityKey: Map<string, number>;
  calls: number;
  completedTasks: number;
}

/**
 * Count one user's records for a window, grouped by activity type plus the two
 * typeless sources. One grouped query + two counts, regardless of type count.
 */
export async function countTypeSourcesForUser(
  orgId: string,
  userId: string,
  from: Date,
  to: Date,
): Promise<TypeSourceCounts> {
  const scope = await resolveOwnerScope(userId);
  const activityOwner = spreadOwnerFilter(scope);
  const callOwner = spreadOwnerFilter(scope, { idKey: "agentUserId", nameKey: "ownerName" });
  const taskOwner = spreadOwnerFilter(scope, { idKey: "assignedToUserId", nameKey: null });

  const [grouped, calls, completedTasks] = await Promise.all([
    prisma.crmActivity.groupBy({
      by: ["type"],
      where: { orgId, occurredAt: { gte: from, lte: to }, ...activityOwner },
      _count: { _all: true },
    }),
    prisma.crmCallLog.count({
      where: { orgId, startTime: { gte: from, lte: to }, ...callOwner },
    }),
    prisma.crmTask.count({
      where: {
        orgId,
        status: "Completed",
        completedAt: { gte: from, lte: to },
        ...taskOwner,
      },
    }),
  ]);

  const byActivityKey = new Map<string, number>();
  for (const g of Array.isArray(grouped) ? grouped : []) {
    const key = normalizeTypeKey(g.type ?? "");
    if (!key) continue;
    byActivityKey.set(key, (byActivityKey.get(key) ?? 0) + g._count._all);
  }

  return { byActivityKey, calls, completedTasks };
}

/**
 * Fold raw source counts into an "actual" figure for ONE activity type,
 * honoring that type's configured sources.
 */
export function actualForType(
  type: Pick<ActivityTypeTargetRow, "code" | "countsSources">,
  counts: TypeSourceCounts,
): number {
  let total = 0;
  for (const source of type.countsSources) {
    if (source === "activity") total += counts.byActivityKey.get(normalizeTypeKey(type.code)) ?? 0;
    else if (source === "call") total += counts.calls;
    else if (source === "task") total += counts.completedTasks;
  }
  return total;
}

export interface TypeProgressRow {
  activityTypeId: string;
  code: string;
  label: string;
  dailyTarget: number;
  actual: number;
  remaining: number;
  completionPct: number;
}

/**
 * Build the per-type progress rows the tracker renders as "Calls: 12 / 20".
 *
 * Only types with a target > 0 are returned — a type the admin never assigned
 * is not a goal and would otherwise add noise to every salesperson's row.
 * Completion follows the same convention as the overall attainment helper:
 * uncapped percentage, remaining floored at 0.
 */
export function buildTypeProgress(
  targets: ActivityTypeTargetRow[],
  counts: TypeSourceCounts,
): TypeProgressRow[] {
  return targets
    .filter((t) => t.dailyTarget > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((t) => {
      const actual = actualForType(t, counts);
      return {
        activityTypeId: t.activityTypeId,
        code: t.code,
        label: t.label,
        dailyTarget: t.dailyTarget,
        actual,
        remaining: Math.max(0, t.dailyTarget - actual),
        completionPct: t.dailyTarget > 0 ? Math.round((actual / t.dailyTarget) * 100) : 100,
      };
    });
}

/**
 * Per-type progress for many users at once (admin tracker). Each user's counts
 * are one grouped query + two counts, run in parallel across users — the same
 * shape as `countActivitiesForUsers`, which cannot use a single groupBy either
 * because owner matching is an OR over id + stale ownerName.
 */
export async function getTypeProgressForUsers(
  orgId: string,
  userIds: string[],
  targetsByUser: Map<string, ActivityTypeTargetRow[]>,
  win: ActivityWindow,
): Promise<Map<string, TypeProgressRow[]>> {
  const out = new Map<string, TypeProgressRow[]>();
  if (userIds.length === 0) return out;

  await Promise.all(
    userIds.map(async (userId) => {
      const targets = targetsByUser.get(userId) ?? [];
      // Skip the queries entirely for users with nothing targeted.
      if (!targets.some((t) => t.dailyTarget > 0)) {
        out.set(userId, []);
        return;
      }
      const counts = await countTypeSourcesForUser(orgId, userId, win.todayFrom, win.todayTo);
      out.set(userId, buildTypeProgress(targets, counts));
    }),
  );

  return out;
}
