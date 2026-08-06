/**
 * Self-service "My Activity Target" data for the LOGGED-IN user only.
 *
 * Reuses the shared activity-target services (config + count + breakdown +
 * thresholds) so the numbers match the admin tracker and detail dashboard
 * exactly. No admin data, no other users — the caller passes their own userId.
 *
 * Returns { assigned: false } when the user has no assigned target, so the
 * menu + page can hide themselves.
 */
import { prisma } from "@/lib/db/prisma";
import { resolveOwnerScope, spreadOwnerFilter } from "./owner-scope";
import { activityWindow, countActivityBreakdownForUser, type ActivityBreakdown } from "./activity-target-count";
import { computeAttainment, type ActivityTargetStatus } from "./activity-target-status";
import {
  getActivityTargetConfig,
  isTargetAssigned,
  resolveDailyTarget,
  resolveWeeklyTarget,
} from "@/lib/services/workspace/activity-target-config";

export interface MyActivityRecentRow {
  id: string;
  type: string;
  subject: string;
  occurredAtIso: string;
}

export interface MyActivityTargetDto {
  assigned: true;
  dailyTarget: number;
  todayActivities: number;
  remaining: number;
  completionPct: number;
  weeklyTarget: number;
  weeklyActivities: number;
  status: ActivityTargetStatus;
  breakdown: ActivityBreakdown;
  recentToday: MyActivityRecentRow[];
}

export type MyActivityTargetResult = { assigned: false } | MyActivityTargetDto;

const RECENT_LIMIT = 10;

/**
 * Latest CrmActivity rows the user logged today, in the given tz window.
 * (The "activities" source of the breakdown — calls/tasks have their own
 * surfaces; the recent list mirrors the salesperson-detail activity feed.)
 */
async function recentActivitiesToday(
  orgId: string,
  userId: string,
  todayFrom: Date,
  todayTo: Date,
): Promise<MyActivityRecentRow[]> {
  const scope = await resolveOwnerScope(userId);
  const rows = await prisma.crmActivity.findMany({
    where: { orgId, occurredAt: { gte: todayFrom, lte: todayTo }, ...spreadOwnerFilter(scope) },
    orderBy: { occurredAt: "desc" },
    take: RECENT_LIMIT,
    select: { id: true, type: true, subject: true, occurredAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    subject: r.subject ?? r.type,
    occurredAtIso: (r.occurredAt ?? new Date()).toISOString(),
  }));
}

export async function getMyActivityTarget(
  orgId: string,
  userId: string,
  tz: string,
): Promise<MyActivityTargetResult> {
  const config = await getActivityTargetConfig(orgId);

  // Opt-in: no target assigned → the page/menu should not show.
  if (!isTargetAssigned(config, userId)) return { assigned: false };

  const win = activityWindow(tz);
  const [breakdown, recentToday] = await Promise.all([
    countActivityBreakdownForUser(orgId, userId, win),
    recentActivitiesToday(orgId, userId, win.todayFrom, win.todayTo),
  ]);

  const dailyTarget = resolveDailyTarget(config, userId);
  const weeklyTarget = resolveWeeklyTarget(config, userId);
  const daily = computeAttainment(dailyTarget, breakdown.total);

  return {
    assigned: true,
    dailyTarget,
    todayActivities: daily.actual,
    remaining: daily.remaining,
    completionPct: daily.completionPct,
    weeklyTarget,
    weeklyActivities: breakdown.weekTotal,
    status: daily.status,
    breakdown,
    recentToday,
  };
}
