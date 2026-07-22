import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";

const bodySchema = z.object({
  projectId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(500),
  statusId: z.string().min(1),
});

/**
 * Bulk change status for issues in ONE project. Because statuses belong to a
 * project's workflow, the client groups the selection by project and calls this
 * once per project with that project's chosen `statusId`. The status is verified
 * to belong to the project before applying. Returns `{ updated }`.
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const { projectId, ids, statusId } = parsed.data;

    // QtIssueStatus is scoped by projectId (no orgId column); the project's
    // org ownership is enforced by the permission check below.
    const status = await db.qtIssueStatus.findFirst({
      where: { id: statusId, projectId },
      select: { id: true },
    });
    if (!status) {
      return NextResponse.json(
        { success: false, error: "Status not found in this project" },
        { status: 404 },
      );
    }

    const canEdit =
      (await hasAdminAccess(userId, orgId)) ||
      (await userCanInProject(userId, orgId, projectId, "Issue", "update"));
    if (!canEdit) {
      return NextResponse.json({ success: false, error: "Not allowed" }, { status: 403 });
    }

    const result = await db.qtIssue.updateMany({
      where: { id: { in: ids }, orgId, projectId, isDeleted: false },
      data: { statusId, updatedBy: userId },
    });
    return NextResponse.json({ success: true, updated: result.count });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
