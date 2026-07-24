/**
 * Server-side helper that persists the velocity snapshot for a sprint.
 *
 * Jira semantics: velocity is frozen ONCE, at "Complete sprint". This writes a
 * single QtSprintSnapshot row with committed/completed story points AND hours,
 * completion %, and the completed date. The row is immutable afterwards — the
 * Velocity Report reads it verbatim and never recalculates, so editing issues
 * later cannot change a completed sprint's velocity.
 *
 * The helper accepts a Prisma transaction client so the caller can fold it into
 * the existing "complete sprint" transaction atomically.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { computeSprintVelocity, type VelocityIssue } from "./velocity";

type Db = PrismaClient | Prisma.TransactionClient;

/** Load the sprint's issues in the shape the velocity calc needs (status
 *  category + storyPoints + eta). Excludes soft-deleted rows. */
async function loadSprintIssues(db: Db, sprintId: string): Promise<VelocityIssue[]> {
  const rows = await db.qtIssue.findMany({
    where: { sprintId, isDeleted: false },
    select: {
      id: true,
      type: true,
      storyPoints: true,
      eta: true,
      status: { select: { category: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    storyPoints: r.storyPoints,
    eta: r.eta,
    statusCategory: r.status.category,
  }));
}

/**
 * Freeze the velocity snapshot for a sprint at COMPLETION.
 *
 * MUST be called BEFORE incomplete issues are moved out of the sprint, so the
 * committed scope reflects everything that was in the sprint. Idempotent via
 * upsert keyed on sprintId — re-completing (shouldn't happen) refreezes.
 *
 * `completedAt` is the frozen "sprint completed date".
 */
export async function recordSprintVelocity(
  db: Db,
  args: { orgId: string; projectId: string; sprintId: string; completedAt: Date },
): Promise<void> {
  const issues = await loadSprintIssues(db, args.sprintId);
  const m = computeSprintVelocity(issues);

  const data = {
    committedPoints: m.committedPoints,
    committedCount: m.committedCount,
    committedIssueIds: m.committedIssueIds,
    completedPoints: m.completedPoints,
    completedCount: m.completedCount,
    committedHours: m.committedHours,
    completedHours: m.completedHours,
    completionPct: m.completionPct,
    completedAt: args.completedAt,
  };

  await db.qtSprintSnapshot.upsert({
    where: { sprintId: args.sprintId },
    create: { orgId: args.orgId, projectId: args.projectId, sprintId: args.sprintId, ...data },
    update: data,
  });
}
