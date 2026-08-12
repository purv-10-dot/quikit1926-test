import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/)
    .optional(),
  category: z.enum(["BACKLOG", "IN_PROGRESS", "DONE"]).optional(),
});

/**
 * PATCH /api/projects/:id/statuses/:statusId — rename / re-categorise / recolour
 * a kanban column. PROJECT_ADMIN only.
 */
export const PATCH = withProjectAccess<{ id: string; statusId: string }>(
  async ({ projectId }, req, { params }) => {
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const status = await db.qtIssueStatus.findFirst({
      where: { id: params.statusId, projectId, isDeleted: false },
      select: { id: true },
    });
    if (!status) {
      return NextResponse.json({ success: false, error: "Status not found" }, { status: 404 });
    }
    const updated = await db.qtIssueStatus.update({
      where: { id: params.statusId },
      data: parsed.data,
    });
    return NextResponse.json({ success: true, data: updated });
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);

/**
 * DELETE /api/projects/:id/statuses/:statusId — soft-delete a column. Issues
 * pointing at this status are moved to `?moveTo=<otherStatusId>` (required if
 * any issues exist on the column being deleted). PROJECT_ADMIN only.
 */
export const DELETE = withProjectAccess<{ id: string; statusId: string }>(
  async ({ projectId, userId }, req, { params }) => {
    const url = new URL(req.url);
    const moveTo = url.searchParams.get("moveTo");

    const status = await db.qtIssueStatus.findFirst({
      where: { id: params.statusId, projectId, isDeleted: false },
      select: { id: true },
    });
    if (!status) {
      return NextResponse.json({ success: false, error: "Status not found" }, { status: 404 });
    }

    // Block deletion when the status is part of any workflow (node, transition
    // target, or transition source). Those FKs cascade, so without this guard a
    // workflow-referenced status would be silently removed (WF-2.2).
    const [asNode, asTarget, asSource] = await Promise.all([
      db.qtWorkflowStatus.count({ where: { statusId: params.statusId } }),
      db.qtWorkflowTransition.count({ where: { toStatusId: params.statusId, isDeleted: false } }),
      db.qtWorkflowTransitionFrom.count({ where: { statusId: params.statusId } }),
    ]);
    const workflowRefs = asNode + asTarget + asSource;
    if (workflowRefs > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `This status is used by ${workflowRefs} workflow reference(s). Remove it from the workflow before deleting.`,
          code: "STATUS_IN_USE_BY_WORKFLOW",
          references: workflowRefs,
        },
        { status: 409 },
      );
    }

    // Don't let the user delete the last visible column.
    const remaining = await db.qtIssueStatus.count({
      where: { projectId, isDeleted: false, id: { not: params.statusId } },
    });
    if (remaining < 1) {
      return NextResponse.json(
        { success: false, error: "A project must have at least one status." },
        { status: 409 },
      );
    }

    const issuesOnStatus = await db.qtIssue.count({
      where: { statusId: params.statusId, isDeleted: false },
    });
    if (issuesOnStatus > 0) {
      if (!moveTo) {
        return NextResponse.json(
          {
            success: false,
            error: "Status has issues. Provide ?moveTo=<otherStatusId> to reassign them.",
          },
          { status: 409 },
        );
      }
      const dest = await db.qtIssueStatus.findFirst({
        where: { id: moveTo, projectId, isDeleted: false },
        select: { id: true },
      });
      if (!dest) {
        return NextResponse.json(
          { success: false, error: "moveTo status not found in project" },
          { status: 400 },
        );
      }
    }

    await db.$transaction(async (tx) => {
      if (issuesOnStatus > 0 && moveTo) {
        await tx.qtIssue.updateMany({
          where: { statusId: params.statusId, isDeleted: false },
          data: { statusId: moveTo, updatedBy: userId },
        });
      }
      await tx.qtIssueStatus.update({
        where: { id: params.statusId },
        data: { isDeleted: true },
      });
    });

    return NextResponse.json({
      success: true,
      data: { id: params.statusId, movedIssues: issuesOnStatus },
    });
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);
