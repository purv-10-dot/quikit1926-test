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

  // Opt-in: only users with an ASSIGNED (enabled) target are tracked. Everyone
  // else is "No Target Assigned" — excluded from the tracker, the counts, and
  // the team totals entirely.
  const assignedMembers = members.filter((m) => isTargetAssigned(config, m.userId));

  const userIds = assignedMembers.map((m) => m.userId);
  const win = activityWindow(tz);
  const counts = await countActivitiesForUsers(orgId, userIds, win);

  const rows: ActivityTargetTrackerRow[] = assignedMembers.map((m) => {
    const dailyTarget = resolveDailyTarget(config, m.userId);
    const weeklyTarget = resolveWeeklyTarget(config, m.userId);
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
