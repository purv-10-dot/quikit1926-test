import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { updateIssueSchema } from "@/lib/validation/issue";
import { emailIssueAssigned, emailIssueStatusChanged } from "@/lib/email/sendEmail";
import {
  recordIssueChanges,
  selectIssueHistorySnapshot,
} from "@/lib/services/issueHistory";
import { recalcParentRollup } from "@/lib/services/subtaskRollup";

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
    const tenantAdmin = await db.orgMember.findFirst({
      where: { userId, orgId, status: "active" },
      select: { role: true },
    });
    const isAdmin = tenantAdmin?.role === "admin" || tenantAdmin?.role === "owner";
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
    return NextResponse.json({ success: true, data: { ...issue, subtasks, timeLogs } });
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
        // Snapshot every tracked field for the activity-history diff.
        // (`title`, `statusId`, `assigneeId` are part of this snapshot too.)
        ...selectIssueHistorySnapshot,
      },
    });
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const member = await db.qtProjectMember.findFirst({
      where: { projectId: issue.projectId, userId, isDeleted: false },
      select: { role: true },
    });
    const tenantAdmin = await db.orgMember.findFirst({
      where: { userId, orgId, status: "active" },
      select: { role: true },
    });
    const isAdmin = tenantAdmin?.role === "admin" || tenantAdmin?.role === "owner";
    if (!isAdmin && (!member || member.role === "VIEWER")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const parsed = updateIssueSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const updated = await db.qtIssue.update({
      where: { id: params.id },
      data: {
        ...parsed.data,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
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
  async ({ orgId, userId }, _req, { params }) => {
    const issue = await db.qtIssue.findFirst({
      where: { id: params.id, orgId: orgId, isDeleted: false },
      select: { id: true, projectId: true, type: true, parentId: true },
    });
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const member = await db.qtProjectMember.findFirst({
      where: { projectId: issue.projectId, userId, isDeleted: false },
      select: { role: true },
    });
    const tenantAdmin = await db.orgMember.findFirst({
      where: { userId, orgId, status: "active" },
      select: { role: true },
    });
    const isAdmin = tenantAdmin?.role === "admin" || tenantAdmin?.role === "owner";
    if (!isAdmin && (!member || member.role === "VIEWER")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const result = await db.$transaction(async (tx) => {
      if (issue.type === "EPIC") {
        // Detach (don't delete) anything linked to this epic.
        await tx.qtIssue.updateMany({
          where: { epicId: params.id, isDeleted: false },
          data: { epicId: null },
        });
      }
      // Cascade-delete the parent → child hierarchy. A task's subtasks (and any
      // deeper descendants) cannot survive without their parent.
      const cascade = await tx.qtIssue.updateMany({
        where: { parentId: params.id, isDeleted: false },
        data: { isDeleted: true, updatedBy: userId },
      });
      await tx.qtIssue.update({
        where: { id: params.id },
        data: { isDeleted: true, updatedBy: userId },
      });
      return { childCount: cascade.count };
    });
    // If we soft-deleted a subtask, refresh its parent's roll-up so the
    // remaining subtasks' aggregate is reflected.
    if (issue.type === "SUBTASK" && issue.parentId) {
      void recalcParentRollup(issue.parentId, orgId);
    }
    return NextResponse.json({
      success: true,
      data: { id: params.id, deletedChildCount: result.childCount },
    });
  },
);
