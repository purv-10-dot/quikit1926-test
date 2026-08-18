import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createTimesheetSchema } from "@/lib/validation/timesheet";
import { userCanInProject, forbidden, hasAdminAccess } from "@/lib/api/permissions";
import { createTimesheetEntry, TimesheetFutureDateError } from "@/lib/services/timesheet";

export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const requestedUserId = url.searchParams.get("userId");
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const projectId = url.searchParams.get("projectId");
  const issueId = url.searchParams.get("issueId");

  const isAdmin = await hasAdminAccess(userId, orgId);

  // Non-admins can only ever read their own entries (close the leak).
  const filterUserId = isAdmin ? (requestedUserId ?? userId) : userId;

  // If a projectId is supplied by a non-admin, confirm membership.
  if (!isAdmin && projectId) {
    const member = await db.qtProjectMember.findFirst({
      where: { projectId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ success: true, data: [] });
    }
  }

  const where = {
    orgId: orgId,
    isDeleted: false,
    userId: filterUserId,
    ...(projectId ? { projectId } : {}),
    ...(issueId ? { issueId } : {}),
    ...(fromStr || toStr
      ? {
          entryDate: {
            ...(fromStr ? { gte: new Date(fromStr) } : {}),
            ...(toStr ? { lte: new Date(toStr) } : {}),
          },
        }
      : {}),
  };
  const entries = await db.qtTimesheetEntry.findMany({
    where,
    orderBy: { entryDate: "desc" },
    take: 500,
  });
  // QtTimesheetEntry has no direct User relation, so batch-resolve the loggers
  // and attach a `user` object (mirrors the issue history feed). The UI uses
  // this to render proper initials/name instead of the raw userId.
  const userIds = Array.from(new Set(entries.map((e) => e.userId)));
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
        },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u] as const));
  const data = entries.map((e) => ({ ...e, user: userById.get(e.userId) ?? null }));
  return NextResponse.json({ success: true, data });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = createTimesheetSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const entryDate = new Date(parsed.data.entryDate);

  const issue = await db.qtIssue.findFirst({
    where: { id: parsed.data.issueId, orgId: orgId, isDeleted: false },
    select: { id: true, projectId: true, parentId: true },
  });
  if (!issue) {
    return NextResponse.json({ success: false, error: "Issue not found" }, { status: 404 });
  }
  const member = await db.qtProjectMember.findFirst({
    where: { projectId: issue.projectId, userId, isDeleted: false },
    select: { id: true },
  });
  const isAdmin = await hasAdminAccess(userId, orgId);
  if (!member && !isAdmin) {
    return NextResponse.json({ success: false, error: "Issue not found" }, { status: 404 });
  }
  if (!isAdmin && !(await userCanInProject(userId, orgId, issue.projectId, "Timesheet", "create"))) {
    return forbidden();
  }

  let entry;
  try {
    entry = await createTimesheetEntry({
      orgId,
      userId,
      projectId: issue.projectId,
      issueId: issue.id,
      parentIssueId: issue.parentId,
      entryDate,
      hours: parsed.data.hours,
      description: parsed.data.description,
      createdBy: userId,
    });
  } catch (err) {
    if (err instanceof TimesheetFutureDateError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    throw err;
  }

  return NextResponse.json({ success: true, data: entry }, { status: 201 });
});
