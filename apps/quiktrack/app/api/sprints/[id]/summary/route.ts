import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import { computeSprintVelocity, type VelocityIssue } from "@/lib/reports/velocity";
import manifest from "@/manifest";

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/**
 * GET /api/sprints/[id]/summary
 *
 * Compact AI-context sprint summary. Target ~1,500 tokens. See the AI
 * Runtime manifest/summary contract, §3.3.
 *
 * Burndown: a COMPLETED sprint reads its frozen QtSprintSnapshot verbatim
 * (same as the Velocity Report — never recomputed once written). An
 * active/planning sprint has no snapshot yet, so its committed/completed
 * points are computed live from the sprint's current issues, reusing the
 * exact same scope rule (`computeSprintVelocity`, EPIC/SUBTASK/BUG excluded)
 * the completion step will eventually freeze.
 */
// AI Runtime: agent-JWT opt-in (manifest read op `summarize_sprint`).
export const GET = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const sprint = await db.qtSprint.findFirst({
    where: { id: params.id, isDeleted: false, project: { orgId, isDeleted: false } },
    select: {
      id: true,
      projectId: true,
      name: true,
      goal: true,
      status: true,
      startDate: true,
      endDate: true,
      startedAt: true,
      completedAt: true,
      snapshot: {
        select: { committedPoints: true, completedPoints: true },
      },
    },
  });
  if (!sprint) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const isAdmin = await hasAdminAccess(userId, orgId);
  if (!isAdmin) {
    const member = await db.qtProjectMember.findFirst({
      where: { projectId: sprint.projectId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
  }

  const issues = await db.qtIssue.findMany({
    where: { sprintId: sprint.id, isDeleted: false },
    select: {
      id: true,
      key: true,
      title: true,
      type: true,
      priority: true,
      storyPoints: true,
      eta: true,
      assigneeId: true,
      status: { select: { category: true } },
    },
  });

  const doneCount = issues.filter((i) => i.status.category === "DONE").length;
  const inProgressCount = issues.filter((i) => i.status.category === "IN_PROGRESS").length;
  const todoCount = issues.length - doneCount - inProgressCount;

  let committedPoints: number;
  let completedPoints: number;
  if (sprint.snapshot) {
    committedPoints = sprint.snapshot.committedPoints;
    completedPoints = sprint.snapshot.completedPoints;
  } else {
    const velocityIssues: VelocityIssue[] = issues.map((i) => ({
      id: i.id,
      type: i.type,
      storyPoints: i.storyPoints,
      eta: i.eta,
      statusCategory: i.status.category,
    }));
    const metrics = computeSprintVelocity(velocityIssues);
    committedPoints = metrics.committedPoints;
    completedPoints = metrics.completedPoints;
  }

  const assigneeIds = Array.from(
    new Set(issues.map((i) => i.assigneeId).filter((id): id is string => Boolean(id))),
  );
  const assignees = assigneeIds.length
    ? await db.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const nameById = new Map(
    assignees.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email] as const),
  );

  const topOpenIssues = issues
    .filter((i) => i.status.category !== "DONE")
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99))
    .slice(0, 10)
    .map((i) => ({
      key: i.key,
      title: i.title,
      priority: i.priority,
      assigneeName: i.assigneeId ? nameById.get(i.assigneeId) ?? null : null,
    }));

  return NextResponse.json({
    success: true,
    data: {
      id: sprint.id,
      name: sprint.name,
      goalExcerpt: sprint.goal ? sprint.goal.slice(0, 300) : null,
      status: sprint.status,
      startDate: sprint.startDate?.toISOString() ?? null,
      endDate: sprint.endDate?.toISOString() ?? null,
      startedAt: sprint.startedAt?.toISOString() ?? null,
      completedAt: sprint.completedAt?.toISOString() ?? null,
      issueCounts: { total: issues.length, done: doneCount, inProgress: inProgressCount, todo: todoCount },
      burndown: {
        committedPoints,
        completedPoints,
        remainingPoints: Math.max(committedPoints - completedPoints, 0),
      },
      topOpenIssues,
      url: `${process.env.NEXT_PUBLIC_QUIKIT_URL ?? ""}${manifest.routePrefix}/spaces/${sprint.projectId}/sprints/${sprint.id}`,
    },
  });
}, { allowAgentJwt: true });
