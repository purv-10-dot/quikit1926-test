import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import { assertTransitionForIssue, TransitionNotAllowedError } from "@/lib/services/workflow";

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
    const { projectId: projectIdOrKey, ids, statusId } = parsed.data;

    // Body projectId may be a cuid OR a project KEY (readable URLs). Resolve to
    // the real id, org-scoped, before it's used to scope statuses/issues below.
    const project = await db.qtProject.findFirst({
      where: {
        orgId,
        isDeleted: false,
        OR: [{ id: projectIdOrKey }, { projectKey: projectIdOrKey }],
      },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }
    const projectId = project.id;

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

    // Workflow gate: each issue's move to `statusId` must be a legal transition
    // on its type's active workflow. Split into allowed vs blocked and apply only
    // the allowed set (partial success — Jira blocks the whole batch; we don't).
    // Projects without a published scheme resolve every issue as allowed.
    const targets = await db.qtIssue.findMany({
      where: { id: { in: ids }, orgId, projectId, isDeleted: false },
      select: { id: true, statusId: true, type: true },
    });

    const allowedIds: string[] = [];
    const blocked: { id: string; code: string }[] = [];
    for (const it of targets) {
      if (it.statusId === statusId) {
        allowedIds.push(it.id); // no-op move
        continue;
      }
      try {
        await assertTransitionForIssue({
          projectId,
          issueType: it.type ?? "TASK",
          fromStatusId: it.statusId,
          toStatusId: statusId,
        });
        allowedIds.push(it.id);
      } catch (error: unknown) {
        if (error instanceof TransitionNotAllowedError) {
          blocked.push({ id: it.id, code: error.code });
        } else {
          throw error;
        }
      }
    }

    const result =
      allowedIds.length > 0
        ? await db.qtIssue.updateMany({
            where: { id: { in: allowedIds }, orgId, projectId, isDeleted: false },
            data: { statusId, updatedBy: userId },
          })
        : { count: 0 };

    return NextResponse.json({ success: true, updated: result.count, blocked });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
