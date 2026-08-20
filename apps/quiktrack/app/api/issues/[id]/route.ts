import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { userCanInProject, forbidden, hasAdminAccess } from "@/lib/api/permissions";
import { filterUpdatePayload, getEffectiveFieldLevels } from "@/lib/api/fieldLevels";
import { updateIssueSchema } from "@/lib/validation/issue";
import { emailIssueAssigned, emailIssueStatusChanged } from "@/lib/email/sendEmail";
import {
  recordIssueChanges,
  recordIssueEvent,
  selectIssueHistorySnapshot,
} from "@/lib/services/issueHistory";
import { recalcParentRollup } from "@/lib/services/subtaskRollup";
import { notifyMentions } from "@/lib/services/mentions";
import { notifyDirect, notifyWatchers, isEmailEnabled } from "@/lib/notifications/notify";
import {
  executeTransition,
  postFunctionPatchToPrisma,
  TransitionNotAllowedError,
  ConditionsFailedError,
  ValidationFailedError,
  type ExecuteResult,
} from "@/lib/services/workflow";
import {
  getActiveFieldsForProject,
  getValuesForIssue,
  validateIssueValues,
  writeIssueValues,
} from "@/lib/services/customFieldValues";
import { renderCfValue } from "@/lib/customFields/render";
import type { FieldValue } from "@/lib/customFields/registry";

async function loadIssueForTenant(orgId: string, issueId: string) {
  return db.qtIssue.findFirst({
    where: { id: issueId, orgId: orgId, isDeleted: false },
    include: {
      status: { select: { id: true, name: true, color: true, category: true } },
      parent: { select: { id: true, key: true, title: true, type: true } },
      epic: { select: { id: true, key: true, title: true } },
    },
  });
}

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const issue = await loadIssueForTenant(orgId, params.id);
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const access = await db.qtProjectMember.findFirst({
      where: { projectId: issue.projectId, userId, isDeleted: false },
      select: { id: true },
    });
    const isAdmin = await hasAdminAccess(userId, orgId);
    if (!access && !isAdmin) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const subtasks = await db.qtIssue.findMany({
      where: { parentId: params.id, isDeleted: false },
      orderBy: { orderInColumn: "asc" },
      select: {
        id: true,
        key: true,
        title: true,
        statusId: true,
        assigneeId: true,
        priority: true,
        eta: true,
        dueDate: true,
        status: { select: { id: true, name: true, category: true } },
      },
    });
    const timeLogs = await db.qtTimesheetEntry.findMany({
      where: { issueId: params.id, isDeleted: false },
      orderBy: { entryDate: "desc" },
      take: 50,
      select: {
        id: true,
        userId: true,
        entryDate: true,
        hours: true,
        description: true,
      },
    });
    // Active custom fields for this issue's scope + the issue's stored values,
    // embedded so the detail panel renders in one round-trip (NFR-01).
    const [customFields, customFieldValues, levelMap] = await Promise.all([
      getActiveFieldsForProject(orgId, issue.projectId),
      getValuesForIssue(orgId, issue.id),
      // The caller's effective field-level permissions so the detail panel can
      // render readonly/hidden fields as read-only instead of letting an edit
      // silently fail server-side. Empty for admins (no restrictions).
      getEffectiveFieldLevels(userId, orgId, issue.projectId, "Issue"),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        ...issue,
        subtasks,
        timeLogs,
        customFields,
        customFieldValues,
        fieldLevels: Object.fromEntries(levelMap),
      },
    });
  },
);

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    // Snapshot enough of the pre-update issue to detect what changed
    // (assignee, status) so we can fire the right notification emails.
    const issue = await db.qtIssue.findFirst({
      where: { id: params.id, orgId: orgId, isDeleted: false },
      select: {
        id: true,
        key: true,
        projectId: true,
        resolutionId: true, // for the workflow pipeline (resolution post-functions)
        description: true, // for the mention diff (only email newly-added @mentions)
        reporterId: true, // for the workflow field-value rule (Reporter field)
        // Snapshot every tracked field for the activity-history diff.
        // (`title`, `statusId`, `assigneeId` are part of this snapshot too.)
        ...selectIssueHistorySnapshot,
      },
    });
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const isAdmin = await hasAdminAccess(userId, orgId);
    if (!isAdmin) {
      const member = await db.qtProjectMember.findFirst({
        where: { projectId: issue.projectId, userId, isDeleted: false },
        select: { id: true },
      });
      if (!member) {
        return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
      }
      if (!(await userCanInProject(userId, orgId, issue.projectId, "Issue", "update"))) {
        return forbidden();
      }
    }
    const parsed = updateIssueSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    // Custom field values travel under `customFields` (not real QtIssue
    // columns) — pull them out before the column update and validate up-front
    // so a bad value can't half-apply.
    const { customFields, expectedStatusId, ...issueFields } = parsed.data as typeof parsed.data & {
      customFields?: Record<string, FieldValue>;
      expectedStatusId?: string;
    };
    if (customFields) {
      const valid = await validateIssueValues({
        orgId,
        projectId: issue.projectId,
        issueId: issue.id,
        values: customFields,
      });
      if (!valid.ok) {
        return NextResponse.json({ success: false, error: valid.errors.join(", ") }, { status: 400 });
      }
    }

    // Field-level guard — strip any keys the user can't write (hidden /
    // readonly). Tenant admin bypass is handled inside the helper.
    const { allowed, rejected } = await filterUpdatePayload(
      userId,
      orgId,
      issue.projectId,
      "Issue",
      issueFields as Record<string, unknown>,
    );
    if (rejected.length > 0 && Object.keys(allowed).length === 0) {
      return forbidden(
        `Field(s) not editable for your role: ${rejected.join(", ")}`,
      );
    }
    // Dates: a present-but-falsy value (null) clears the field; a valid string
    // sets it; an absent key leaves it unchanged.
    const allowedFields = allowed as typeof parsed.data;

    // Workflow pipeline: a statusId change must follow a legal transition whose
    // conditions/validators pass; its post-functions yield a field patch (e.g.
    // set resolution). No-ops and unpublished projects fall through (opt-in).
    const isStatusChange =
      allowedFields.statusId != null && allowedFields.statusId !== issue.statusId;
    let workflowPatch: ExecuteResult["patch"] = {};
    let workflowComments: string[] = [];
    if (isStatusChange) {
      // Optimistic concurrency: reject a stale move rather than overwrite.
      if (expectedStatusId != null && expectedStatusId !== issue.statusId) {
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
          toStatusId: allowedFields.statusId as string,
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

    const dateValue = (key: "startDate" | "dueDate") =>
      key in allowedFields
        ? allowedFields[key]
          ? new Date(allowedFields[key]!)
          : null
        : undefined;
    // Atomic: status change + post-function patch + transition-log row commit or
    // roll back together (WF-4.2/4.3, parity with /move).
    const updated = await db.$transaction(async (tx) => {
      const issueAfter = await tx.qtIssue.update({
        where: { id: params.id },
        data: {
          ...allowedFields,
          startDate: dateValue("startDate"),
          dueDate: dateValue("dueDate"),
          // Workflow post-function effects (writable scalar columns only).
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
            toStatusId: allowedFields.statusId as string,
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

    // Activity history — fire-and-forget. `updated` already contains every
    // tracked field, so we can diff against the pre-update snapshot directly.
    void recordIssueChanges({
      orgId,
      projectId: issue.projectId,
      issueId: issue.id,
      userId,
      before: issue,
      after: updated,
    });

    // Persist custom field values (pre-validated) + log each change to the feed.
    if (customFields) {
      const res = await writeIssueValues({
        orgId,
        issueId: issue.id,
        projectId: issue.projectId,
        actorId: userId,
        values: customFields,
      });
      if (res.ok) {
        for (const c of res.changes) {
          void recordIssueEvent({
            orgId,
            projectId: issue.projectId,
            issueId: issue.id,
            userId,
            field: c.fieldName,
            oldValue: renderCfValue(c.oldValue),
            newValue: renderCfValue(c.newValue),
          });
        }
      }
    }

    // Email anyone newly @-mentioned in the description (diff vs the previous
    // description so edits don't re-notify existing mentions).
    if ("description" in parsed.data) {
      void notifyMentions({
        orgId,
        actorUserId: userId,
        issue: { id: updated.id, key: updated.key, title: updated.title, projectId: updated.projectId },
        context: "description",
        html: updated.description ?? "",
        prevHtml: issue.description ?? null,
      });
    }

    // Subtask roll-up: when a subtask's eta or dates move, refresh the
    // parent's roll-up. If the subtask was reparented we have to refresh
    // both old and new parents so neither retains a stale aggregate.
    if (updated.type === "SUBTASK") {
      const etaChanged = "eta" in parsed.data && updated.eta !== issue.eta;
      const startChanged = "startDate" in parsed.data;
      const dueChanged = "dueDate" in parsed.data;
      const parentChanged =
        "parentId" in parsed.data && updated.parentId !== issue.parentId;
      if (etaChanged || startChanged || dueChanged || parentChanged) {
        if (issue.parentId && issue.parentId !== updated.parentId) {
          void recalcParentRollup(issue.parentId, orgId);
        }
        if (updated.parentId) {
          void recalcParentRollup(updated.parentId, orgId);
        }
      }
    }

    // ── Notification side-effects ────────────────────────────────────────────
    // Fire-and-forget; failures must not break the PATCH response. Each branch
    // resolves the recipient + actor + project + status names lazily and
    // only when the relevant field actually changed.
    const assigneeChanged = "assigneeId" in parsed.data && parsed.data.assigneeId !== issue.assigneeId;
    const statusChanged = "statusId" in parsed.data && parsed.data.statusId && parsed.data.statusId !== issue.statusId;

    if (assigneeChanged || statusChanged) {
      console.log(
        `[email] trigger issue=${issue.key} assigneeChanged=${Boolean(assigneeChanged)} statusChanged=${Boolean(statusChanged)} newAssignee=${updated.assigneeId}`,
      );
      void notifyOnUpdate({
        orgId,
        actorUserId: userId,
        before: issue,
        after: updated,
        assigneeChanged: Boolean(assigneeChanged),
        statusChanged: Boolean(statusChanged),
      });
    }

    return NextResponse.json({ success: true, data: updated });
  },
);

/**
 * Resolves user/status/project metadata once and dispatches the relevant
 * notification emails. Designed to be invoked with `void` — never awaited so
 * a slow SMTP server doesn't extend the API response time.
 */
async function notifyOnUpdate(args: {
  orgId: string;
  actorUserId: string;
  before: { id: string; key: string; title: string; projectId: string; assigneeId: string | null; statusId: string };
  after: { assigneeId: string | null; statusId: string };
  assigneeChanged: boolean;
  statusChanged: boolean;
}) {
  try {
    const userIds = new Set<string>();
    if (args.actorUserId) userIds.add(args.actorUserId);
    if (args.assigneeChanged && args.after.assigneeId) userIds.add(args.after.assigneeId);
    if (args.assigneeChanged && args.before.assigneeId) userIds.add(args.before.assigneeId);
    if (args.statusChanged && args.after.assigneeId) userIds.add(args.after.assigneeId);

    const [users, project, statusesNeeded] = await Promise.all([
      userIds.size
        ? db.user.findMany({
            where: { id: { in: Array.from(userIds) } },
            select: { id: true, email: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      db.qtProject.findUnique({
        where: { id: args.before.projectId },
        select: { name: true },
      }),
      args.statusChanged
        ? db.qtIssueStatus.findMany({
            where: { id: { in: [args.before.statusId, args.after.statusId] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const userById = new Map(users.map((u) => [u.id, u]));
    const statusById = new Map(statusesNeeded.map((s) => [s.id, s]));
    const actor = userById.get(args.actorUserId);
    const actorName = actor
      ? [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim() || actor.email
      : null;

    const issueRef = {
      id: args.before.id,
      key: args.before.key,
      title: args.before.title,
      projectId: args.before.projectId,
      projectName: project?.name ?? null,
      // Emailed deep-links carry the owning org (`?org=`) so a recipient whose
      // session is on another org lands here instead of a 404.
      orgId: args.orgId,
    };

    const directRecipients: string[] = [];

    if (args.assigneeChanged && args.after.assigneeId) {
      const a = userById.get(args.after.assigneeId);
      let emailSent = false;
      if (a?.email && (await isEmailEnabled(args.after.assigneeId))) {
        await emailIssueAssigned({
          to: a.email,
          assigneeName: [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || null,
          issue: issueRef,
          reassignedBy: actorName,
        });
        emailSent = true;
      }
      directRecipients.push(args.after.assigneeId);
      // Auto-watch: a newly assigned person starts watching, matching Jira.
      // skipDuplicates so re-assigning back to an existing (manual or auto)
      // watcher is a no-op rather than an error.
      await db.qtIssueWatcher
        .createMany({
          data: [{ orgId: args.orgId, issueId: issueRef.id, userId: args.after.assigneeId, source: "AUTO" }],
          skipDuplicates: true,
        })
        .catch((e) => console.error("[watch] auto-watch on assign failed:", e));
      await notifyDirect({
        orgId: args.orgId,
        recipientId: args.after.assigneeId,
        actorId: args.actorUserId,
        type: "ASSIGNED",
        projectId: issueRef.projectId,
        issueId: issueRef.id,
        issueKey: issueRef.key,
        issueTitle: issueRef.title,
        emailSent,
      });
    }

    if (args.statusChanged && args.after.assigneeId) {
      const a = userById.get(args.after.assigneeId);
      let emailSent = false;
      if (a?.email && (await isEmailEnabled(args.after.assigneeId))) {
        await emailIssueStatusChanged({
          to: a.email,
          recipientName: [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || null,
          issue: issueRef,
          fromStatus: statusById.get(args.before.statusId)?.name ?? null,
          toStatus: statusById.get(args.after.statusId)?.name ?? args.after.statusId,
          changedBy: actorName,
        });
        emailSent = true;
      }
      directRecipients.push(args.after.assigneeId);
      await notifyDirect({
        orgId: args.orgId,
        recipientId: args.after.assigneeId,
        actorId: args.actorUserId,
        type: "STATUS_CHANGED",
        projectId: issueRef.projectId,
        issueId: issueRef.id,
        issueKey: issueRef.key,
        issueTitle: issueRef.title,
        fromValue: statusById.get(args.before.statusId)?.name ?? null,
        toValue: statusById.get(args.after.statusId)?.name ?? args.after.statusId,
        emailSent,
      });
    }

    if (args.assigneeChanged) {
      const nameOf = (id: string | null) => {
        if (!id) return "Unassigned";
        const u = userById.get(id);
        return u ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email : "Unassigned";
      };
      await notifyWatchers({
        orgId: args.orgId,
        issueId: issueRef.id,
        actorId: args.actorUserId,
        type: "REASSIGNED",
        projectId: issueRef.projectId,
        issueKey: issueRef.key,
        issueTitle: issueRef.title,
        fromValue: nameOf(args.before.assigneeId),
        toValue: nameOf(args.after.assigneeId),
        skipRecipientIds: directRecipients,
      });
    }

    if (args.statusChanged) {
      await notifyWatchers({
        orgId: args.orgId,
        issueId: issueRef.id,
        actorId: args.actorUserId,
        type: "STATUS_CHANGED",
        projectId: issueRef.projectId,
        issueKey: issueRef.key,
        issueTitle: issueRef.title,
        fromValue: statusById.get(args.before.statusId)?.name ?? null,
        toValue: statusById.get(args.after.statusId)?.name ?? args.after.statusId,
        skipRecipientIds: directRecipients,
      });
    }
  } catch (e) {
    console.error("[email] notifyOnUpdate failed:", e instanceof Error ? e.message : e);
  }
}

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const subtaskMode = new URL(req.url).searchParams.get("subtaskMode") === "detach"
      ? "detach"
      : "cascade";
    const issue = await db.qtIssue.findFirst({
      where: { id: params.id, orgId: orgId, isDeleted: false },
      select: {
        id: true,
        projectId: true,
        type: true,
        parentId: true,
        reporterId: true,
        createdBy: true,
      },
    });
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const isAdmin = await hasAdminAccess(userId, orgId);
    if (!isAdmin) {
      const member = await db.qtProjectMember.findFirst({
        where: { projectId: issue.projectId, userId, isDeleted: false },
        select: { id: true },
      });
      if (!member) {
        return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
      }
      // A full Issue:delete grant (Space Admin / custom roles) deletes any
      // issue in the space. Without it, Contributors may delete only issues
      // they own — i.e. ones they reported or created.
      const canDeleteAny = await userCanInProject(
        userId,
        orgId,
        issue.projectId,
        "Issue",
        "delete",
      );
      const ownsIssue =
        issue.reporterId === userId || issue.createdBy === userId;
      if (!canDeleteAny && !ownsIssue) {
        return forbidden();
      }
    }
    const result = await db.$transaction(async (tx) => {
      if (issue.type === "EPIC") {
        await tx.qtIssue.updateMany({
          where: { epicId: params.id, isDeleted: false },
          data: { epicId: null },
        });
      }
      let deletedChildCount = 0;
      let detachedChildCount = 0;
      if (subtaskMode === "detach") {
        const detach = await tx.qtIssue.updateMany({
          where: { parentId: params.id, isDeleted: false },
          data: { parentId: null, updatedBy: userId },
        });
        detachedChildCount = detach.count;
      } else {
        const cascade = await tx.qtIssue.updateMany({
          where: { parentId: params.id, isDeleted: false },
          data: { isDeleted: true, updatedBy: userId },
        });
        deletedChildCount = cascade.count;
      }
      await tx.qtIssue.update({
        where: { id: params.id },
        data: { isDeleted: true, updatedBy: userId },
      });
      return { deletedChildCount, detachedChildCount };
    });
    // If we soft-deleted a subtask, refresh its parent's roll-up so the
    // remaining subtasks' aggregate is reflected.
    if (issue.type === "SUBTASK" && issue.parentId) {
      void recalcParentRollup(issue.parentId, orgId);
    }
    return NextResponse.json({
      success: true,
      data: {
        id: params.id,
        deletedChildCount: result.deletedChildCount,
        detachedChildCount: result.detachedChildCount,
      },
    });
  },
);
