/**
 * Compute the Development-tab metrics for a space: the "real" QuikTrack work
 * metrics + DORA metrics from linked dev data. Org-scoped throughout.
 *
 * Returns everything the tab renders so the route stays thin. DORA maths lives
 * in ./dora (pure + unit-tested); this module does the DB reads and stitches.
 */

import { db } from "@/lib/db";
import { startOfISOWeek } from "@/lib/reports/weekly";
import {
  prCycleTimeHours,
  leadTimeHours,
  deploymentFrequencyPerWeek,
} from "@/lib/services/github/dora";

const DAY = 1000 * 60 * 60 * 24;

export interface SpaceDevMetrics {
  workItemsCompletedThisWeek: number;
  completedTrend: number[]; // last 8 weeks, for the sparkline
  prCycleTimeHours: number | null;
  leadTimeHours: number | null;
  deploymentFrequencyPerWeek: number;
  workItemsOverdue: number;
  workItemsReopened: number;
  bugsOpen: number;
  pullRequestsOpen: number;
  vulnerabilitiesCritical: number; // 0 until security scanning is wired
}

/**
 * `now` is injected so callers/tests are deterministic. In the route it's
 * `Date.now()` (allowed in normal app code — the Date.* restriction only
 * applies to Workflow scripts).
 */
export async function computeSpaceDevMetrics(
  orgId: string,
  projectId: string,
  issueIds: string[],
  now: number,
): Promise<SpaceDevMetrics> {
  const weekStart = startOfISOWeek(new Date(now)).getTime();

  // DONE status ids for this project (category === "DONE").
  const doneStatuses = await db.qtIssueStatus.findMany({
    where: { projectId, category: "DONE", isDeleted: false },
    select: { id: true },
  });
  const doneIds = doneStatuses.map((s) => s.id);

  const [
    completedThisWeek,
    overdue,
    bugsOpen,
    reopened,
    prsOpen,
    prRows,
    commitRows,
  ] = await Promise.all([
    // Completed this week: in a DONE status and updated since Monday.
    doneIds.length
      ? db.qtIssue.count({
          where: { orgId, projectId, isDeleted: false, statusId: { in: doneIds }, updatedAt: { gte: new Date(weekStart) } },
        })
      : 0,
    // Overdue: past due date and not done.
    db.qtIssue.count({
      where: {
        orgId, projectId, isDeleted: false,
        dueDate: { lt: new Date(now) },
        ...(doneIds.length ? { statusId: { notIn: doneIds } } : {}),
      },
    }),
    // Bugs open: type BUG, not done.
    db.qtIssue.count({
      where: {
        orgId, projectId, isDeleted: false, type: "BUG",
        ...(doneIds.length ? { statusId: { notIn: doneIds } } : {}),
      },
    }),
    // Reopened: a history row moving OUT of a done status (field "statusId",
    // oldValue in doneIds) — counts issues that went back from done.
    doneIds.length && issueIds.length
      ? db.qtIssueHistory.count({
          where: { orgId, issueId: { in: issueIds }, field: "statusId", oldValue: { in: doneIds } },
        })
      : 0,
    issueIds.length
      ? db.qtDevPullRequest.count({ where: { orgId, issueId: { in: issueIds }, state: "OPEN" } })
      : 0,
    issueIds.length
      ? db.qtDevPullRequest.findMany({
          where: { orgId, issueId: { in: issueIds } },
          select: { issueId: true, state: true, createdAt: true, updatedAtGh: true },
        })
      : [],
    issueIds.length
      ? db.qtDevCommit.findMany({
          where: { orgId, issueId: { in: issueIds } },
          select: { issueId: true, committedAt: true },
        })
      : [],
  ]);

  // 8-week completed trend for the sparkline.
  const completedTrend: number[] = [];
  if (doneIds.length) {
    for (let i = 7; i >= 0; i--) {
      const start = weekStart - i * 7 * DAY;
      const end = start + 7 * DAY;
      // eslint-disable-next-line no-await-in-loop
      const c = await db.qtIssue.count({
        where: {
          orgId, projectId, isDeleted: false, statusId: { in: doneIds },
          updatedAt: { gte: new Date(start), lt: new Date(end) },
        },
      });
      completedTrend.push(c);
    }
  }

  // Deployment rows: model not present yet, so none. Wired for when it exists.
  const deployments: { deployedAt: Date }[] = [];

  return {
    workItemsCompletedThisWeek: completedThisWeek,
    completedTrend,
    prCycleTimeHours: prCycleTimeHours(prRows, now),
    leadTimeHours: leadTimeHours(prRows, commitRows, now),
    deploymentFrequencyPerWeek: deploymentFrequencyPerWeek(deployments, now),
    workItemsOverdue: overdue,
    workItemsReopened: reopened,
    bugsOpen,
    pullRequestsOpen: prsOpen,
    vulnerabilitiesCritical: 0,
  };
}
