import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import { moveIssueSchema } from "@/lib/validation/issue";
import {
  recordIssueChanges,
  selectIssueHistorySnapshot,
} from "@/lib/services/issueHistory";

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const issue = await db.qtIssue.findFirst({
      where: { id: params.id, orgId: orgId, isDeleted: false },
      select: {
        id: true,
        projectId: true,
        ...selectIssueHistorySnapshot,
      },
    });
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    // Global admins bypass; everyone else needs Issue:update via their role.
    if (
      !(await hasAdminAccess(userId, orgId)) &&
      !(await userCanInProject(userId, orgId, issue.projectId, "Issue", "update"))
    ) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const parsed = moveIssueSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const updated = await db.qtIssue.update({
      where: { id: params.id },
      data: {
        statusId: parsed.data.statusId,
        sprintId: parsed.data.sprintId === undefined ? undefined : parsed.data.sprintId,
        parentId: parsed.data.parentId === undefined ? undefined : parsed.data.parentId,
        orderInColumn: parsed.data.orderInColumn,
        updatedBy: userId,
      },
    });
    void recordIssueChanges({
      orgId,
      projectId: issue.projectId,
      issueId: issue.id,
      userId,
      before: issue,
      after: updated,
    });
    return NextResponse.json({ success: true, data: updated });
  },
);
