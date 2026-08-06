/**
 * Admin-only Activity Target Tracker.
 *
 * Enumerates active org members, resolves each one's daily/weekly target from
 * the org config, counts today's + this-week's completed activities via the
 * shared count service, and returns a per-salesperson row with attainment.
 * Rows are sorted by largest DAILY shortfall (remaining) first, so the people
 * furthest behind surface at the top.
 */
import { prisma } from "@/lib/db/prisma";
import {
  getActivityTargetConfig,
  isTargetAssigned,
  resolveDailyTarget,
  resolveWeeklyTarget,
} from "@/lib/services/workspace/activity-target-config";
import { countActivitiesForUsers, activityWindow } from "./activity-target-count";
import { computeAttainment, type ActivityTargetStatus } from "./activity-target-status";
import { getActivityTypeTargetsForUsers } from "@/lib/services/workspace/activity-type-target-config";
import { getTypeProgressForUsers, type TypeProgressRow } from "./activity-type-count";

export interface ActivityTargetTrackerRow {
  userId: string;
  name: string;
  email: string | null;
  dailyTarget: number;
  todayActivities: number;
  remaining: number;
  completionPct: number;
  weeklyTarget: number;
  weeklyActivities: number;
  status: ActivityTargetStatus;
  /**
   * Per-activity-type daily progress ("Calls: 12 / 20"). Empty when the user
   * has no type targets assigned — the overall row is unaffected either way.
   */
  typeProgress: TypeProgressRow[];
}

export interface ActivityTargetTrackerDto {
  defaultDailyTarget: number;
  weeklyWorkingDays: number;
  rows: ActivityTargetTrackerRow[];
}

function displayName(u: { firstName: string | null; lastName: string | null; email: string | null } | null): string {
  if (!u) return "Unknown";
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.email || "Unknown";
}

export async function getActivityTargetTracker(
  orgId: string,
  tz: string,
): Promise<ActivityTargetTrackerDto> {
  const [config, members] = await Promise.all([
    getActivityTargetConfig(orgId),
    prisma.orgMember.findMany({
      where: { orgId, status: "active" },
      select: {
        userId: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
  ]);

  // Type targets are INDEPENDENT of the overall opt-in: a salesperson may be
  // tracked because they have an overall target, because they have at least one
  // activity-type target, or both. Read type targets for every member so the
  // second case can be detected.
  const allUserIds = members.map((m) => m.userId);
  const typeTargets = await getActivityTypeTargetsForUsers(orgId, allUserIds);
  const hasTypeTarget = (userId: string) =>
    (typeTargets.get(userId) ?? []).some((t) => t.dailyTarget > 0);

  // Opt-in preserved: a user with neither an assigned overall target nor any
  // type target is "No Target Assigned" — excluded from the tracker, the counts,
  // and the team totals entirely.
  const assignedMembers = members.filter(
    (m) => isTargetAssigned(config, m.userId) || hasTypeTarget(m.userId),
  );

  const userIds = assignedMembers.map((m) => m.userId);
  const win = activityWindow(tz);
  const [counts, typeProgress] = await Promise.all([
    countActivitiesForUsers(orgId, userIds, win),
    getTypeProgressForUsers(orgId, userIds, typeTargets, win),
  ]);

  const rows: ActivityTargetTrackerRow[] = assignedMembers.map((m) => {
    // Users tracked ONLY via type targets have no overall target: report 0 so
    // they never inflate the team's overall target roll-up.
    const overallAssigned = isTargetAssigned(config, m.userId);
    const dailyTarget = overallAssigned ? resolveDailyTarget(config, m.userId) : 0;
    const weeklyTarget = overallAssigned ? resolveWeeklyTarget(config, m.userId) : 0;
    const c = counts.get(m.userId) ?? { today: 0, week: 0 };
    const daily = computeAttainment(dailyTarget, c.today);
    return {
      userId: m.userId,
      name: displayName(m.user),
      email: m.user?.email ?? null,
      dailyTarget,
      todayActivities: daily.actual,
      remaining: daily.remaining,
      completionPct: daily.completionPct,
      weeklyTarget,
      weeklyActivities: c.week,
      status: daily.status,
      typeProgress: typeProgress.get(m.userId) ?? [],
    };
  });

  // Largest daily shortfall first; tie-break on lower completion %, then name.
  rows.sort((a, b) => {
    if (b.remaining !== a.remaining) return b.remaining - a.remaining;
    if (a.completionPct !== b.completionPct) return a.completionPct - b.completionPct;
    return a.name.localeCompare(b.name);
  });

  return {
    defaultDailyTarget: config.defaultDailyTarget,
    weeklyWorkingDays: config.weeklyWorkingDays,
    rows,
  };
}
