/**
 * Shared "completed activity" counting for the Activity Targets feature.
 *
 * A salesperson's activity count is the union of three sources, matching the
 * definition the salesperson-detail dashboard already uses:
 *   - CrmActivity  — every logged activity (owner: ownerId / ownerName)
 *   - CrmCallLog   — every call log        (owner: agentUserId)
 *   - CrmTask      — tasks with status = "Completed" (owner: assignedToUserId)
 *
 * Owner matching reuses `resolveOwnerScope` + `spreadOwnerFilter` (id + stale
 * ownerName fallback) so we do NOT duplicate the ownership logic that lives in
 * owner-scope.ts. Day/week boundaries reuse the tz-aware period helpers.
 *
 * Both the per-salesperson dashboard indicator and the admin tracker consume
 * this, so the "actual" number is defined in exactly one place.
 */
import { prisma } from "@/lib/db/prisma";
import { resolveOwnerScope, spreadOwnerFilter } from "./owner-scope";
import { startOfDayInTz, endOfDayInTz, addDays } from "./period";

export interface ActivityWindow {
  todayFrom: Date;
  todayTo: Date;
  weekFrom: Date;
  weekTo: Date;
}

export interface ActivityCounts {
  today: number;
  week: number;
}

/**
 * Per-source breakdown of TODAY's completed activity for one user, plus the
 * week total. Same three sources and same owner-matching as the totals path —
 * this is just the un-summed view of the same counts.
 */
export interface ActivityBreakdown {
  calls: number;
  activities: number;
  completedTasks: number;
  total: number;
  weekTotal: number;
}

/**
 * Compute the "today" and "this week" windows in the given IANA tz.
 * Week starts Monday (ISO week) and runs through the end of `now`'s day.
 */
export function activityWindow(tz: string, now: Date = new Date()): ActivityWindow {
  const todayFrom = startOfDayInTz(now, tz);
  const todayTo = endOfDayInTz(now, tz);

  // ISO weekday: Mon=1 … Sun=7. Step back to Monday.
  const weekdayStr = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
  const isoIndex: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const daysSinceMonday = isoIndex[weekdayStr] ?? 0;
  const weekFrom = startOfDayInTz(addDays(now, -daysSinceMonday), tz);

  return { todayFrom, todayTo, weekFrom, weekTo: todayTo };
}

/**
 * Owner `where` fragments for the three sources, from one resolved scope.
 * Centralized so the totals path and the breakdown path stay identical.
 */
async function ownerFiltersForUser(userId: string) {
  const scope = await resolveOwnerScope(userId);
  return {
    activity: spreadOwnerFilter(scope),
    call: spreadOwnerFilter(scope, { idKey: "agentUserId", nameKey: "ownerName" }),
    task: spreadOwnerFilter(scope, { idKey: "assignedToUserId", nameKey: null }),
  };
}

/**
 * Count completed activities for a single user across the two windows.
 * `orgId` scopes every query (non-negotiable tenant filter).
 */
export async function countActivitiesForUser(
  orgId: string,
  userId: string,
  win: ActivityWindow,
): Promise<ActivityCounts> {
  const result = await countActivitiesForUsers(orgId, [userId], win);
  return result.get(userId) ?? { today: 0, week: 0 };
}

/**
 * Per-source breakdown for one user (used by the self-service My Activity Target
 * page). Reuses the same three source queries + owner-matching as the totals
 * path — `total` equals what countActivitiesForUser returns for `today`.
 */
export async function countActivityBreakdownForUser(
  orgId: string,
  userId: string,
  win: ActivityWindow,
): Promise<ActivityBreakdown> {
  const owner = await ownerFiltersForUser(userId);

  const [activities, calls, completedTasks, weekTotalParts] = await Promise.all([
    prisma.crmActivity.count({
      where: { orgId, occurredAt: { gte: win.todayFrom, lte: win.todayTo }, ...owner.activity },
    }),
    prisma.crmCallLog.count({
      where: { orgId, startTime: { gte: win.todayFrom, lte: win.todayTo }, ...owner.call },
    }),
    prisma.crmTask.count({
      where: {
        orgId, status: "Completed",
        completedAt: { gte: win.todayFrom, lte: win.todayTo }, ...owner.task,
      },
    }),
    Promise.all([
      prisma.crmActivity.count({
        where: { orgId, occurredAt: { gte: win.weekFrom, lte: win.weekTo }, ...owner.activity },
      }),
      prisma.crmCallLog.count({
        where: { orgId, startTime: { gte: win.weekFrom, lte: win.weekTo }, ...owner.call },
      }),
      prisma.crmTask.count({
        where: {
          orgId, status: "Completed",
          completedAt: { gte: win.weekFrom, lte: win.weekTo }, ...owner.task,
        },
      }),
    ]),
  ]);

  return {
    calls,
    activities,
    completedTasks,
    total: activities + calls + completedTasks,
    weekTotal: weekTotalParts[0] + weekTotalParts[1] + weekTotalParts[2],
  };
}

/**
 * Batch: count completed activities for many users across both windows.
 * Returns a Map keyed by userId. Runs one grouped query per (source × window)
 * rather than per-user, so the tracker scales with the org.
 */
export async function countActivitiesForUsers(
  orgId: string,
  userIds: string[],
  win: ActivityWindow,
): Promise<Map<string, ActivityCounts>> {
  const counts = new Map<string, ActivityCounts>();
  for (const id of userIds) counts.set(id, { today: 0, week: 0 });
  if (userIds.length === 0) return counts;

  // Resolve owner scopes once (id + name fallbacks) so a stale ownerName still
  // attributes to the right user — same rule as salesperson-detail-service.
  const scopes = await Promise.all(userIds.map((id) => resolveOwnerScope(id)));

  const add = (userId: string, window: "today" | "week", n: number) => {
    const c = counts.get(userId);
    if (c) c[window] += n;
  };

  // Per-user counting: three source counts × two windows. Ownership needs the
  // OR-based owner filter (id OR name), which does not aggregate cleanly in a
  // single groupBy, so we count per user but keep each user's queries parallel.
  await Promise.all(
    userIds.map(async (userId, i) => {
      const scope = scopes[i];
      const activityOwner = spreadOwnerFilter(scope);
      const callOwner = spreadOwnerFilter(scope, { idKey: "agentUserId", nameKey: "ownerName" });
      const taskOwner = spreadOwnerFilter(scope, { idKey: "assignedToUserId", nameKey: null });

      const [
        actToday, actWeek,
        callToday, callWeek,
        taskToday, taskWeek,
      ] = await Promise.all([
        prisma.crmActivity.count({
          where: { orgId, occurredAt: { gte: win.todayFrom, lte: win.todayTo }, ...activityOwner },
        }),
        prisma.crmActivity.count({
          where: { orgId, occurredAt: { gte: win.weekFrom, lte: win.weekTo }, ...activityOwner },
        }),
        prisma.crmCallLog.count({
          where: { orgId, startTime: { gte: win.todayFrom, lte: win.todayTo }, ...callOwner },
        }),
        prisma.crmCallLog.count({
          where: { orgId, startTime: { gte: win.weekFrom, lte: win.weekTo }, ...callOwner },
        }),
        prisma.crmTask.count({
          where: {
            orgId, status: "Completed",
            completedAt: { gte: win.todayFrom, lte: win.todayTo }, ...taskOwner,
          },
        }),
        prisma.crmTask.count({
          where: {
            orgId, status: "Completed",
            completedAt: { gte: win.weekFrom, lte: win.weekTo }, ...taskOwner,
          },
        }),
      ]);

      add(userId, "today", actToday + callToday + taskToday);
      add(userId, "week", actWeek + callWeek + taskWeek);
    }),
  );

  return counts;
}
