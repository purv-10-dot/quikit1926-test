import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import { htmlToSummaryExcerpt } from "@/lib/api/aiSummary";
import { resolveIssueIdOrKey } from "@/lib/mcp/resolveIssue";
import manifest from "@/manifest";

/**
 * GET /api/issues/[id]/summary
 *
 * Compact AI-context summary — NOT the full detail endpoint (that's
 * GET /api/issues/[id]). Target ~1,500 tokens (~6,000 chars): identity,
 * status, assignee, dates, priority, key relationships, a short activity
 * signal. Excludes full comment bodies, full history, every custom field —
 * only counts. See the AI Runtime manifest/summary contract, §3.2.
 *
 * Auth follows the same pattern as GET /api/issues/[id]: plain withOrgAuth +
 * a manual project-membership check (issue's projectId isn't known until
 * after the lookup, so withProjectAccess's path-param resolution doesn't
 * apply here).
 *
 * `[id]` accepts the cuid or the issue key — see the resolution note in
 * app/api/issues/[id]/route.ts. Use the resolved cuid below, never `params.id`.
 */
// AI Runtime: agent-JWT opt-in (manifest read op `summarize_issue`).
export const GET = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const resolved = await resolveIssueIdOrKey(orgId, params.id);
  if (!resolved) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const issue = await db.qtIssue.findFirst({
    where: { id: resolved.id, orgId, isDeleted: false },
    select: {
      id: true,
      key: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      startDate: true,
      dueDate: true,
      updatedAt: true,
      projectId: true,
      assigneeId: true,
      reporterId: true,
      sprintId: true,
      status: { select: { id: true, name: true, category: true, color: true } },
      sprint: { select: { id: true, name: true, status: true } },
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
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
  }

  const userIds = [issue.assigneeId, issue.reporterId].filter((id): id is string => Boolean(id));
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u] as const));
  const toUserSummary = (id: string | null) => {
    if (!id) return null;
    const u = userById.get(id);
    if (!u) return null;
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
    return { id: u.id, name, avatar: u.avatar ?? null };
  };

  const [subtaskCount, subtaskDone, commentCount, linkCount, watcherCount, lastComment, lastTransition] =
    await Promise.all([
      db.qtIssue.count({ where: { parentId: issue.id, isDeleted: false } }),
      db.qtIssue.count({
        where: { parentId: issue.id, isDeleted: false, status: { category: "DONE" } },
      }),
      db.qtIssueComment.count({ where: { issueId: issue.id, isDeleted: false } }),
      db.qtIssueLink.count({ where: { sourceIssueId: issue.id } }),
      db.qtIssueWatcher.count({ where: { issueId: issue.id } }),
      db.qtIssueComment.findFirst({
        where: { issueId: issue.id, isDeleted: false },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      // The precise "status move" log (QtIssueTransitionLog), not
      // QtIssueHistory — that one records every tracked-field change, not
      // status moves specifically.
      db.qtIssueTransitionLog.findFirst({
        where: { issueId: issue.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

  return NextResponse.json({
    success: true,
    data: {
      id: issue.id,
      key: issue.key,
      title: issue.title,
      status: issue.status,
      type: issue.type,
      priority: issue.priority,
      assignee: toUserSummary(issue.assigneeId),
      reporter: toUserSummary(issue.reporterId),
      startDate: issue.startDate?.toISOString() ?? null,
      dueDate: issue.dueDate?.toISOString() ?? null,
      descriptionExcerpt: htmlToSummaryExcerpt(issue.description),
      progress: {
        subtaskCount,
        subtaskDone,
        percentComplete: subtaskCount === 0 ? 0 : Math.round((subtaskDone / subtaskCount) * 100),
      },
      sprint: issue.sprint,
      counts: { comments: commentCount, links: linkCount, watchers: watcherCount },
      activity: {
        lastUpdatedAt: issue.updatedAt.toISOString(),
        lastCommentAt: lastComment?.createdAt.toISOString() ?? null,
        lastStatusChangeAt: lastTransition?.createdAt.toISOString() ?? null,
      },
      url: `${process.env.NEXT_PUBLIC_QUIKIT_URL ?? ""}${manifest.routePrefix}/spaces/${issue.projectId}/issues/${issue.key}`,
    },
  });
}, { allowAgentJwt: true });
