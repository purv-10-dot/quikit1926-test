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

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const issue = await loadAccessibleIssue(orgId, userId, params.id);
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const [count, mine] = await Promise.all([
      db.qtIssueWatcher.count({ where: { issueId: params.id } }),
      db.qtIssueWatcher.findUnique({
        where: { issueId_userId: { issueId: params.id, userId } },
        select: { id: true },
      }),
    ]);
    return NextResponse.json({ success: true, data: { count, isWatching: !!mine } });
  },
);

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const issue = await loadAccessibleIssue(orgId, userId, params.id);
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    await db.qtIssueWatcher.upsert({
      where: { issueId_userId: { issueId: params.id, userId } },
      create: { orgId, issueId: params.id, userId, source: "MANUAL" },
      update: {},
    });
    const count = await db.qtIssueWatcher.count({ where: { issueId: params.id } });
    return NextResponse.json({ success: true, data: { count, isWatching: true } });
  },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const issue = await loadAccessibleIssue(orgId, userId, params.id);
    if (!issue) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    await db.qtIssueWatcher.deleteMany({ where: { issueId: params.id, userId } });
    const count = await db.qtIssueWatcher.count({ where: { issueId: params.id } });
    return NextResponse.json({ success: true, data: { count, isWatching: false } });
  },
);
