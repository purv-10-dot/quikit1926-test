import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";

/**
 * GET /api/issues/[id]/transition-log
 * The append-only workflow status-move history for an issue (from/to/actor/when,
 * incl. system migrations where transitionId is null and reason="migration").
 * Complements the field-level QtIssueHistory.
 */
export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const issue = await db.qtIssue.findFirst({
      where: { id: params.id, orgId, isDeleted: false },
      select: { id: true, projectId: true },
    });
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (
      !(await hasAdminAccess(userId, orgId)) &&
      !(await userCanInProject(userId, orgId, issue.projectId, "ProjectMember", "view"))
    ) {
      return NextResponse.json(
        { success: false, error: "You don't have access to this." },
        { status: 403 },
      );
    }

    const log = await db.qtIssueTransitionLog.findMany({
      where: { orgId, issueId: issue.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fromStatusId: true,
        toStatusId: true,
        actorId: true,
        reason: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ success: true, data: log });
  },
);
