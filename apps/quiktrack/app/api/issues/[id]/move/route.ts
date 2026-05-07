import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
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
    const member = await db.qtProjectMember.findFirst({
      where: { projectId: issue.projectId, userId, isDeleted: false },
      select: { role: true },
    });
    if (!member || member.role === "VIEWER") {
      const tenantAdmin = await db.orgMember.findFirst({
        where: { userId, orgId, status: "active" },
        select: { role: true },
      });
      const isAdmin = tenantAdmin?.role === "admin" || tenantAdmin?.role === "owner";
      if (!isAdmin) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
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
