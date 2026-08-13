import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";

/**
 * DELETE /api/workflows/[wfId]/draft
 * Discard the pending draft on this workflow's project scheme (the "Discard
 * Draft" action). Live rows are untouched.
 */
export const DELETE = withOrgAuth<{ wfId: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const wf = await db.qtWorkflow.findFirst({
      where: { id: params.wfId, orgId, isDeleted: false },
      select: { id: true, projectId: true },
    });
    if (!wf || !wf.projectId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const canEdit =
      (await hasAdminAccess(userId, orgId)) ||
      (await userCanInProject(userId, orgId, wf.projectId, "Project", "update"));
    if (!canEdit) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }

    await db.qtWorkflowScheme.update({
      where: { projectId: wf.projectId },
      data: { hasDraft: false, draftJson: Prisma.DbNull },
    });
    return NextResponse.json({ success: true, data: { discarded: true } });
  },
);
