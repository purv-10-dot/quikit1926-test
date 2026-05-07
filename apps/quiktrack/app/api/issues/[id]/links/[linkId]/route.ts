import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { recordIssueEvent } from "@/lib/services/issueHistory";

export const DELETE = withOrgAuth<{ id: string; linkId: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const link = await db.qtIssueLink.findFirst({
      where: {
        id: params.linkId,
        orgId: orgId,
        sourceIssueId: params.id,
      },
      select: {
        id: true,
        projectId: true,
        type: true,
        targetIssue: { select: { key: true } },
      },
    });
    if (!link) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const access = await db.qtProjectMember.findFirst({
      where: { projectId: link.projectId, userId, isDeleted: false },
      select: { id: true },
    });
    const tenantAdmin = await db.orgMember.findFirst({
      where: { userId, orgId, status: "active" },
      select: { role: true },
    });
    const isAdmin = tenantAdmin?.role === "admin" || tenantAdmin?.role === "owner";
    if (!access && !isAdmin) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    await db.qtIssueLink.delete({ where: { id: link.id } });
    void recordIssueEvent({
      orgId,
      projectId: link.projectId,
      issueId: params.id,
      userId,
      field: "Link",
      oldValue: `Link to ${link.targetIssue?.key ?? "another work item"}`,
      newValue: null,
    });
    return NextResponse.json({ success: true, data: { id: link.id } });
  },
);
