import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";

const bodySchema = z.object({
  projectId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(500),
  // Only present keys are changed. `assigneeId: null` unassigns; `dueDate: null`
  // clears the due date. Labels aren't a QtIssue field, so they're not offered.
  assigneeId: z.string().min(1).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  priority: z.enum(["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"]).optional(),
});

/**
 * Bulk-edit a batch of issues in ONE project (assignee / due date / priority).
 * Caller needs the project's `Issue:update` grant (or admin). Ids outside the
 * project are dropped. Returns `{ updated }`.
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
    const { projectId, ids, assigneeId, dueDate, priority } = parsed.data;

    const project = await db.qtProject.findFirst({
      where: { id: projectId, orgId, isDeleted: false },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const canEdit =
      (await hasAdminAccess(userId, orgId)) ||
      (await userCanInProject(userId, orgId, projectId, "Issue", "update"));
    if (!canEdit) {
      return NextResponse.json({ success: false, error: "Not allowed" }, { status: 403 });
    }

    const data: Record<string, unknown> = { updatedBy: userId };
    if ("assigneeId" in parsed.data) data.assigneeId = assigneeId ?? null;
    if ("dueDate" in parsed.data) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (priority !== undefined) data.priority = priority;

    if (Object.keys(data).length === 1) {
      // Only updatedBy — nothing to change.
      return NextResponse.json({ success: true, updated: 0 });
    }

    const result = await db.qtIssue.updateMany({
      where: { id: { in: ids }, orgId, projectId, isDeleted: false },
      data,
    });
    return NextResponse.json({ success: true, updated: result.count });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
