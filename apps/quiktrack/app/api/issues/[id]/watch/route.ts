import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";

/**
 * Verify the caller can see this issue (project member or tenant admin) and
 * return it. Same guard as links/route.ts — kept local since watch is a
 * single small route, not worth a shared module for one duplicate.
 */
async function loadAccessibleIssue(orgId: string, userId: string, issueId: string) {
  const issue = await db.qtIssue.findFirst({
    where: { id: issueId, orgId, isDeleted: false },
    select: { id: true, projectId: true },
  });
  if (!issue) return null;
  const access = await db.qtProjectMember.findFirst({
    where: { projectId: issue.projectId, userId, isDeleted: false },
    select: { id: true },
  });
  if (!access && !(await hasAdminAccess(userId, orgId))) return null;
  return issue;
}

/** Resolve watcher userIds to a display list (name + avatar), preserving the
 *  most-recent-first order. */
async function watcherList(issueId: string) {
  const rows = await db.qtIssueWatcher.findMany({
    where: { issueId },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  const ids = rows.map((r) => r.userId);
  if (ids.length === 0) return [];
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
  });
  const byId = new Map(users.map((u) => [u.id, u] as const));
  return ids
    .map((id) => byId.get(id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
      email: u.email,
      avatar: u.avatar,
    }));
}

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const issue = await loadAccessibleIssue(orgId, userId, params.id);
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const watchers = await watcherList(params.id);
    return NextResponse.json({
      success: true,
      data: {
        count: watchers.length,
        isWatching: watchers.some((w) => w.id === userId),
        watchers,
      },
    });
  },
);

/** The target user this request manages: the body's `userId` (adding/removing
 *  ANOTHER watcher) if present and a member of the project, else the caller. */
async function resolveTargetUser(
  req: Request,
  projectId: string,
  callerId: string,
): Promise<string | null> {
  let bodyUserId: string | undefined;
  try {
    const body = (await req.json().catch(() => null)) as { userId?: string } | null;
    bodyUserId = typeof body?.userId === "string" ? body.userId : undefined;
  } catch {
    bodyUserId = undefined;
  }
  if (!bodyUserId || bodyUserId === callerId) return callerId;
  // Only allow watching/unwatching a member of THIS project.
  const member = await db.qtProjectMember.findFirst({
    where: { projectId, userId: bodyUserId, isDeleted: false },
    select: { id: true },
  });
  return member ? bodyUserId : null;
}

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const issue = await loadAccessibleIssue(orgId, userId, params.id);
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const target = await resolveTargetUser(req, issue.projectId, userId);
    if (!target) {
      return NextResponse.json({ success: false, error: "That person isn't a member of this project." }, { status: 400 });
    }
    await db.qtIssueWatcher.upsert({
      where: { issueId_userId: { issueId: params.id, userId: target } },
      create: { orgId, issueId: params.id, userId: target, source: "MANUAL" },
      update: {},
    });
    const watchers = await watcherList(params.id);
    return NextResponse.json({
      success: true,
      data: { count: watchers.length, isWatching: watchers.some((w) => w.id === userId), watchers },
    });
  },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const issue = await loadAccessibleIssue(orgId, userId, params.id);
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    // A member may remove any watcher; falls back to removing self.
    const target = await resolveTargetUser(req, issue.projectId, userId);
    await db.qtIssueWatcher.deleteMany({
      where: { issueId: params.id, userId: target ?? userId },
    });
    const watchers = await watcherList(params.id);
    return NextResponse.json({
      success: true,
      data: { count: watchers.length, isWatching: watchers.some((w) => w.id === userId), watchers },
    });
  },
);
