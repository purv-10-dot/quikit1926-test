import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import { listAvailableTransitionsForIssue } from "@/lib/services/workflow";

/**
 * GET /api/issues/[id]/transitions
 * The legal next moves for this issue under its active workflow, so the board
 * drop-targets and the quick-switcher only offer valid statuses.
 *
 * Response: { success, data: { gated, transitions: [{ id, name, toStatusId }] } }
 * `gated=false` means the project has no published workflow — the client keeps
 * offering every status (today's behaviour).
 */
export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const issue = await db.qtIssue.findFirst({
      where: { id: params.id, orgId, isDeleted: false },
      select: {
        id: true,
        orgId: true,
        projectId: true,
        statusId: true,
        type: true,
        assigneeId: true,
        resolutionId: true,
        priority: true,
      },
    });
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    // Same read gate as the issue itself: global admin or project membership.
    if (
      !(await hasAdminAccess(userId, orgId)) &&
      !(await userCanInProject(userId, orgId, issue.projectId, "Issue", "update"))
    ) {
      return NextResponse.json(
        { success: false, error: "You don't have access to this." },
        { status: 403 },
      );
    }

    const data = await listAvailableTransitionsForIssue({
      userId,
      issue: {
        id: issue.id,
        orgId: issue.orgId,
        projectId: issue.projectId,
        type: issue.type ?? "TASK",
        statusId: issue.statusId,
        assigneeId: issue.assigneeId,
        resolutionId: issue.resolutionId,
        priority: issue.priority,
      },
    });
    return NextResponse.json({ success: true, data });
  },
);
