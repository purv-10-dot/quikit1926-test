import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import {
  computeCommittedScope,
  computeCompleted,
  type VelocityIssue,
  type VelocitySprintPoint,
} from "@/lib/reports/velocity";
import { averageVelocity } from "@/lib/reports/productivity";

/**
 * Velocity report (Story Points) for a project.
 *
 * For each sprint that has run (ACTIVE or COMPLETED), returns committed vs
 * completed story points:
 *   - COMPLETED sprint with a snapshot → authoritative frozen figures.
 *   - ACTIVE sprint (or a sprint whose snapshot predates completed capture) →
 *     live recompute from the current issue set, so the in-flight sprint still
 *     shows progress. Marked `fromSnapshot: false`.
 *   - Legacy sprint with no snapshot at all → live recompute of both figures
 *     (best effort; committed==current scope since we never froze it).
 *
 * Scope excludes EPIC / SUBTASK / BUG (see lib/reports/velocity.ts).
 * PLANNING sprints are omitted — they haven't committed yet.
 */
export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId }) => {
    const sprints = await db.qtSprint.findMany({
      where: { projectId, isDeleted: false, status: { in: ["ACTIVE", "COMPLETED"] } },
      orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, status: true },
    });

    if (sprints.length === 0) {
      return NextResponse.json({
        success: true,
        data: { metric: "storyPoints", sprints: [], average: 0 },
      });
    }

    const sprintIds = sprints.map((s) => s.id);

    // Snapshots are best-effort: a sprint started before this feature (or before
    // the QtSprintSnapshot migration was applied) has none, and the whole table
    // may not exist yet on an un-migrated DB. In every one of those cases we
    // simply fall back to a live recompute — never let the report 500.
    const [snapshots, issues] = await Promise.all([
      loadSnapshots(projectId, sprintIds),
      // Current issue set per sprint, for live recompute where no frozen
      // completed tally exists yet.
      db.qtIssue.findMany({
        where: { projectId, isDeleted: false, sprintId: { in: sprintIds } },
        select: {
          id: true,
          sprintId: true,
          type: true,
          storyPoints: true,
          status: { select: { category: true } },
        },
      }),
    ]);

    const snapBySprint = new Map(snapshots.map((s) => [s.sprintId, s] as const));
    const issuesBySprint = new Map<string, VelocityIssue[]>();
    for (const i of issues) {
      if (!i.sprintId) continue;
      const list = issuesBySprint.get(i.sprintId) ?? [];
      list.push({
        id: i.id,
        type: i.type,
        storyPoints: i.storyPoints,
        statusCategory: i.status.category,
      });
      issuesBySprint.set(i.sprintId, list);
    }

    const points: VelocitySprintPoint[] = sprints.map((sprint) => {
      const snap = snapBySprint.get(sprint.id);
      const liveIssues = issuesBySprint.get(sprint.id) ?? [];

      // Committed: prefer the frozen snapshot; else recompute live.
      const committedPoints = snap
        ? snap.committedPoints
        : computeCommittedScope(liveIssues).committedPoints;
      const committedCount = snap
        ? snap.committedCount
        : computeCommittedScope(liveIssues).committedCount;

      // Completed: authoritative only when the snapshot recorded it (set at
      // close). Otherwise recompute against the committed set (frozen ids if we
      // have a snapshot, else the current live scope).
      let completedPoints: number;
      let completedCount: number;
      let fromSnapshot: boolean;
      if (snap && snap.completedPoints !== null && snap.completedCount !== null) {
        completedPoints = snap.completedPoints;
        completedCount = snap.completedCount;
        fromSnapshot = true;
      } else {
        const committedIds = snap
          ? asStringArray(snap.committedIssueIds)
          : computeCommittedScope(liveIssues).committedIssueIds;
        const live = computeCompleted(committedIds, liveIssues);
        completedPoints = live.completedPoints;
        completedCount = live.completedCount;
        fromSnapshot = false;
      }

      return {
        sprintId: sprint.id,
        sprintName: sprint.name,
        status: sprint.status,
        committedPoints,
        completedPoints,
        committedCount,
        completedCount,
        fromSnapshot,
      };
    });

    // Whether ANY sprint carries a non-zero committed OR completed figure — lets
    // the UI distinguish "sprints exist but nobody estimated story points" from
    // "no sprints at all", instead of showing a misleading empty chart.
    const hasEstimates = points.some(
      (p) => p.committedPoints > 0 || p.completedPoints > 0,
    );

    return NextResponse.json({
      success: true,
      data: {
        metric: "storyPoints",
        sprints: points,
        average: averageVelocity(points.map((p) => p.completedPoints)),
        hasEstimates,
      },
    });
  },
  { paramKey: "id", requirePermission: { resource: "ProjectReports", action: "view" } },
);

interface SnapshotRow {
  sprintId: string;
  committedPoints: number;
  committedCount: number;
  committedIssueIds: unknown;
  completedPoints: number | null;
  completedCount: number | null;
}

/**
 * Fetch velocity snapshots, tolerating an un-migrated DB. Returns [] when the
 * QtSprintSnapshot table doesn't exist yet (Prisma error P2021) so the report
 * degrades to a live calc rather than 500-ing.
 */
async function loadSnapshots(projectId: string, sprintIds: string[]): Promise<SnapshotRow[]> {
  // A dev server started before the client was regenerated won't have this
  // model on `db` yet — guard so we degrade to a live calc instead of throwing.
  if (typeof db.qtSprintSnapshot?.findMany !== "function") return [];
  try {
    return await db.qtSprintSnapshot.findMany({
      where: { projectId, sprintId: { in: sprintIds } },
      select: {
        sprintId: true,
        committedPoints: true,
        committedCount: true,
        committedIssueIds: true,
        completedPoints: true,
        completedCount: true,
      },
    });
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    // P2021 = table does not exist. Any other error is a real fault — rethrow.
    if (code === "P2021") return [];
    throw error;
  }
}

/** Narrow a Prisma Json field to a string[] defensively. */
function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}
