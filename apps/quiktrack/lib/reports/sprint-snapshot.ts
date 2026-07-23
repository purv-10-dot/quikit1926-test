/**
 * Server-side helpers that persist the velocity snapshot for a sprint.
 *
 * WHY a snapshot: completing a sprint moves unfinished issues OUT of it, so a
 * closed sprint no longer knows what it committed to. We freeze the committed
 * scope at START and record the completed subset at CLOSE, both from the same
 * frozen issue set (see lib/reports/velocity.ts). The velocity report reads
 * these rows so historical committed-vs-completed stays accurate.
 *
 * Both helpers accept a Prisma transaction client so callers can fold them into
 * the existing start/complete transactions atomically.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  computeCommittedScope,
  computeCompleted,
  type VelocityIssue,
} from "./velocity";

type Db = PrismaClient | Prisma.TransactionClient;

/** Load the sprint's issues in the shape the velocity calc needs (with status
 *  category joined). Excludes soft-deleted rows. */
async function loadSprintIssues(db: Db, sprintId: string): Promise<VelocityIssue[]> {
  const rows = await db.qtIssue.findMany({
    where: { sprintId, isDeleted: false },
    select: { id: true, type: true, storyPoints: true, status: { select: { category: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    storyPoints: r.storyPoints,
    statusCategory: r.status.category,
  }));
}

/**
 * Freeze the committed scope for a sprint at START (PLANNING → ACTIVE).
 * Idempotent: re-starting (should not happen, but defensive) upserts the row.
 */
export async function captureCommittedSnapshot(
  db: Db,
  args: { orgId: string; projectId: string; sprintId: string },
): Promise<void> {
  const issues = await loadSprintIssues(db, args.sprintId);
  const scope = computeCommittedScope(issues);
  await db.qtSprintSnapshot.upsert({
    where: { sprintId: args.sprintId },
    create: {
      orgId: args.orgId,
      projectId: args.projectId,
      sprintId: args.sprintId,
      committedPoints: scope.committedPoints,
      committedCount: scope.committedCount,
      committedIssueIds: scope.committedIssueIds,
    },
    update: {
      committedPoints: scope.committedPoints,
      committedCount: scope.committedCount,
      committedIssueIds: scope.committedIssueIds,
      capturedAt: new Date(),
      // Re-freezing scope invalidates any prior completed tally.
      completedPoints: null,
      completedCount: null,
      completedAt: null,
    },
  });
}

/**
 * Record the completed tally at CLOSE. MUST be called BEFORE unfinished issues
 * are moved out of the sprint, so the committed set still resolves. Computes
 * completed against the frozen committed ids; no-ops when no snapshot exists
 * (e.g. a sprint that predates this feature — the report falls back to a live
 * calc for those).
 */
export async function recordCompletedSnapshot(
  db: Db,
  sprintId: string,
): Promise<void> {
  const snap = await db.qtSprintSnapshot.findUnique({
    where: { sprintId },
    select: { committedIssueIds: true },
  });
  if (!snap) return;
  const committedIssueIds = Array.isArray(snap.committedIssueIds)
    ? (snap.committedIssueIds as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  const issues = await loadSprintIssues(db, sprintId);
  const { completedPoints, completedCount } = computeCompleted(committedIssueIds, issues);
  await db.qtSprintSnapshot.update({
    where: { sprintId },
    data: { completedPoints, completedCount, completedAt: new Date() },
  });
}
