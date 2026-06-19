import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";

/**
 * Aggregate read for the work-item view.
 *
 * The full-page issue view otherwise fires a burst of separate GETs — issue,
 * subtasks, time logs, links, comments, history, attachments — each of which
 * re-runs the same auth chain and competes for the browser's 6-connections
 * limit. This endpoint runs the access check once and returns all of it in a
 * single response, with each slice shaped identically to its standalone route
 * (`/api/issues/[id]`, `.../links`, `.../comments`, `.../history`,
 * `.../attachments`) so a client can hydrate those caches directly.
 *
 * Project-scoped lookups (members / statuses / sprints) are intentionally NOT
 * included — they're shared across every space view via React Query and cached
 * independently of any single issue.
 */
export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const issueId = params.id;

    // Single access gate: the issue must exist in this org, and the caller must
    // be a member of its project (or a tenant admin). Mirrors the per-route
    // checks the individual endpoints each perform.
    const issue = await db.qtIssue.findFirst({
      where: { id: issueId, orgId, isDeleted: false },
      include: {
        status: { select: { id: true, name: true, color: true, category: true } },
        parent: { select: { id: true, key: true, title: true, type: true } },
        epic: { select: { id: true, key: true, title: true } },
      },
    });
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const access = await db.qtProjectMember.findFirst({
      where: { projectId: issue.projectId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!access && !(await hasAdminAccess(userId, orgId))) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    // Fan out the issue-scoped reads in parallel — they're independent.
    const [subtasks, timeLogs, links, commentRows, historyRows, attachments] =
      await Promise.all([
        db.qtIssue.findMany({
          where: { parentId: issueId, isDeleted: false },
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
        }),
        db.qtTimesheetEntry.findMany({
          where: { issueId, isDeleted: false },
          orderBy: { entryDate: "desc" },
          take: 50,
          select: { id: true, userId: true, entryDate: true, hours: true, description: true },
        }),
        db.qtIssueLink.findMany({
          where: { orgId, sourceIssueId: issueId },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            createdAt: true,
            targetIssue: {
              select: {
                id: true,
                key: true,
                title: true,
                type: true,
                priority: true,
                assigneeId: true,
                statusId: true,
                status: { select: { id: true, name: true, color: true, category: true } },
              },
            },
          },
        }),
        db.qtIssueComment.findMany({
          where: { orgId, issueId, isDeleted: false },
          orderBy: { createdAt: "asc" },
          select: { id: true, userId: true, body: true, createdAt: true, editedAt: true },
        }),
        db.qtIssueHistory.findMany({
          where: { orgId, issueId },
          orderBy: { createdAt: "asc" },
          select: { id: true, userId: true, field: true, oldValue: true, newValue: true, createdAt: true },
        }),
        db.qtIssueAttachment.findMany({
          where: { orgId, issueId },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            sourceSystem: true,
            uploadedBy: true,
            createdAt: true,
          },
        }),
      ]);

    // Comments + history each denormalise their author. Resolve the union of
    // referenced users in one query and stitch them back, matching the
    // standalone routes' `{ ...row, user }` shape.
    const userIds = Array.from(
      new Set(
        [
          ...commentRows.map((c) => c.userId),
          ...historyRows.map((h) => h.userId),
        ].filter((id): id is string => Boolean(id)),
      ),
    );
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u] as const));

    const comments = commentRows.map((c) => ({
      ...c,
      user: userById.get(c.userId) ?? null,
    }));
    const history = historyRows.map((h) => ({
      ...h,
      user: h.userId ? userById.get(h.userId) ?? null : null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        issue: { ...issue, subtasks, timeLogs },
        links,
        comments,
        history,
        attachments,
      },
    });
  },
);
