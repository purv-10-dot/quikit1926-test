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
import {
  assertTransitionForIssue,
  TransitionNotAllowedError,
} from "@/lib/services/workflow";
import {
  getActiveFieldsForProject,
  getValuesForIssue,
  validateIssueValues,
  writeIssueValues,
} from "@/lib/services/customFieldValues";
import type { FieldValue } from "@/lib/customFields/registry";

/** Render a custom field value as a short string for the activity feed. */
function renderCfValue(v: FieldValue): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  return String(v);
}

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
        description: true, // for the mention diff (only email newly-added @mentions)
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
    const { customFields, ...issueFields } = parsed.data as typeof parsed.data & {
      customFields?: Record<string, FieldValue>;
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

    // Workflow gate: if this patch changes statusId, it must follow a legal
    // transition on the issue's active workflow. No-ops and projects without a
    // published scheme fall through (opt-in enforcement).
    if (
      allowedFields.statusId != null &&
      allowedFields.statusId !== issue.statusId
    ) {
      try {
        await assertTransitionForIssue({
          projectId: issue.projectId,
          issueType: issue.type ?? "TASK",
          fromStatusId: issue.statusId,
          toStatusId: allowedFields.statusId,
        });
      } catch (error: unknown) {
        if (error instanceof TransitionNotAllowedError) {
          return NextResponse.json(
            { success: false, error: error.message, code: error.code },
            { status: 409 },
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
    const updated = await db.qtIssue.update({
      where: { id: params.id },
      data: {
        ...allowedFields,
        startDate: dateValue("startDate"),
        dueDate: dateValue("dueDate"),
        updatedBy: userId,
      },
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
    };

    if (args.assigneeChanged && args.after.assigneeId) {
      const a = userById.get(args.after.assigneeId);
      if (a?.email) {
        await emailIssueAssigned({
          to: a.email,
          assigneeName: [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || null,
          issue: issueRef,
          reassignedBy: actorName,
        });
      }
    }

    if (args.statusChanged && args.after.assigneeId) {
      const a = userById.get(args.after.assigneeId);
      if (a?.email) {
        await emailIssueStatusChanged({
          to: a.email,
          recipientName: [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || null,
          issue: issueRef,
          fromStatus: statusById.get(args.before.statusId)?.name ?? null,
          toStatus: statusById.get(args.after.statusId)?.name ?? args.after.statusId,
          changedBy: actorName,
        });
      }
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
