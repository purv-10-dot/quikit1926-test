import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import { moveIssueSchema } from "@/lib/validation/issue";
import {
  recordIssueChanges,
  selectIssueHistorySnapshot,
} from "@/lib/services/issueHistory";
import {
  executeTransition,
  postFunctionPatchToPrisma,
  TransitionNotAllowedError,
  ConditionsFailedError,
  ValidationFailedError,
  type ExecuteResult,
} from "@/lib/services/workflow";

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const issue = await db.qtIssue.findFirst({
      where: { id: params.id, orgId: orgId, isDeleted: false },
      select: {
        id: true,
        projectId: true,
        resolutionId: true,
        reporterId: true,
        description: true,
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
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    const parsed = moveIssueSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    // Optimistic concurrency: if the client's expected status is stale (another
    // move landed first), reject rather than silently overwrite.
    if (
      parsed.data.expectedStatusId != null &&
      parsed.data.expectedStatusId !== issue.statusId
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "This item moved since you loaded it. Refresh and try again.",
          code: "STALE_STATUS",
          currentStatusId: issue.statusId,
        },
        { status: 409 },
      );
    }

    // Workflow gate: a status change must follow a transition on the project's
    // active workflow, whose conditions/validators pass; its post-functions then
    // yield a field patch (e.g. set resolution). No-ops and projects without a
    // published scheme fall through untouched (opt-in enforcement).
    const isStatusChange =
      parsed.data.statusId != null && parsed.data.statusId !== issue.statusId;
    let workflowPatch: ExecuteResult["patch"] = {};
    let workflowComments: string[] = [];
    if (isStatusChange) {
      try {
        const res = await executeTransition({
          issue: {
            id: issue.id,
            orgId,
            projectId: issue.projectId,
            type: issue.type ?? "TASK",
            statusId: issue.statusId as string,
            assigneeId: issue.assigneeId ?? null,
            resolutionId: issue.resolutionId ?? null,
            priority: issue.priority ?? null,
            reporterId: issue.reporterId ?? null,
            title: issue.title ?? null,
            description: issue.description ?? null,
            storyPoints: issue.storyPoints ?? null,
            eta: issue.eta ?? null,
            dueDate: issue.dueDate ? new Date(issue.dueDate).toISOString() : null,
            startDate: issue.startDate ? new Date(issue.startDate).toISOString() : null,
          },
          toStatusId: parsed.data.statusId as string,
          userId,
        });
        workflowPatch = res.patch ?? {};
        workflowComments = res.comments ?? [];
      } catch (error: unknown) {
        if (error instanceof TransitionNotAllowedError) {
          return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 409 });
        }
        if (error instanceof ConditionsFailedError) {
          return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 403 });
        }
        if (error instanceof ValidationFailedError) {
          return NextResponse.json(
            { success: false, error: error.message, code: error.code, failures: error.failures },
            { status: 422 },
          );
        }
        throw error;
      }
    }

    // Atomic: the status change, the post-function field patch, and the
    // append-only transition-log row must commit or roll back together (WF-4.2/4.3).
    const updated = await db.$transaction(async (tx) => {
      const issueAfter = await tx.qtIssue.update({
        where: { id: params.id },
        data: {
          statusId: parsed.data.statusId,
          sprintId: parsed.data.sprintId === undefined ? undefined : parsed.data.sprintId,
          parentId: parsed.data.parentId === undefined ? undefined : parsed.data.parentId,
          orderInColumn: parsed.data.orderInColumn,
          // Apply post-function effects (writable scalar columns only).
          ...postFunctionPatchToPrisma(workflowPatch),
          updatedBy: userId,
        },
      });
      if (isStatusChange) {
        await tx.qtIssueTransitionLog.create({
          data: {
            orgId,
            issueId: issue.id,
            fromStatusId: issue.statusId,
            toStatusId: parsed.data.statusId as string,
            actorId: userId,
          },
        });
      }
      if (workflowComments.length > 0) {
        await tx.qtIssueComment.createMany({
          data: workflowComments.map((body) => ({
            orgId,
            projectId: issue.projectId,
            issueId: issue.id,
            userId,
            body,
          })),
        });
      }
      return issueAfter;
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
