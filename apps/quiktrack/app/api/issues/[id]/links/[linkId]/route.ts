import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import { recordIssueEvent } from "@/lib/services/issueHistory";

export const DELETE = withOrgAuth<{ id: string; linkId: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    // A link can be unlinked from EITHER endpoint's panel. The edge is stored
    // one-way, but "is blocked by X" shows on the target side, so match this
    // issue as source OR target.
    const link = await db.qtIssueLink.findFirst({
      where: {
        id: params.linkId,
        orgId: orgId,
        OR: [{ sourceIssueId: params.id }, { targetIssueId: params.id }],
      },
      select: {
        id: true,
        sourceIssueId: true,
        sourceIssue: { select: { key: true } },
        targetIssue: { select: { key: true } },
      },
    });
    if (!link) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    // Authorize against THIS issue's project (the panel the caller is acting
    // from), not the edge's stored project — for a cross-project inbound link
    // the caller need not be a member of the far project.
    const thisIssue = await db.qtIssue.findFirst({
      where: { id: params.id, orgId, isDeleted: false },
      select: { projectId: true },
    });
    if (!thisIssue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const access = await db.qtProjectMember.findFirst({
      where: { projectId: thisIssue.projectId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!access && !(await hasAdminAccess(userId, orgId))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    await db.qtIssueLink.delete({ where: { id: link.id } });
    // The "other" issue from this panel's point of view.
    const otherKey =
      link.sourceIssueId === params.id
        ? link.targetIssue?.key
        : link.sourceIssue?.key;
    void recordIssueEvent({
      orgId,
      projectId: thisIssue.projectId,
      issueId: params.id,
      userId,
      field: "Link",
      oldValue: `Link to ${otherKey ?? "another work item"}`,
      newValue: null,
    });
    return NextResponse.json({ success: true, data: { id: link.id } });
  },
);
