import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createTimesheetSchema } from "@/lib/validation/timesheet";

export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const filterUserId = url.searchParams.get("userId") ?? userId;
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const projectId = url.searchParams.get("projectId");
  const issueId = url.searchParams.get("issueId");

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
  return NextResponse.json({ success: true, data: entries });
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
  if (entryDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return NextResponse.json(
      { success: false, error: "Cannot log time in the future" },
      { status: 400 },
    );
  }

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
  const tenantAdmin = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  const isAdmin = tenantAdmin?.role === "admin" || tenantAdmin?.role === "owner";
  if (!member && !isAdmin) {
    return NextResponse.json({ success: false, error: "Issue not found" }, { status: 404 });
  }

  const entry = await db.qtTimesheetEntry.create({
    data: {
      orgId: orgId,
      userId,
      projectId: issue.projectId,
      issueId: issue.id,
      parentIssueId: issue.parentId,
      entryDate,
      hours: parsed.data.hours,
      description: parsed.data.description,
      createdBy: userId,
      updatedBy: userId,
    },
  });

  // Roll-up weekly summary (best-effort, non-blocking would be a future improvement).
  const startOfYear = new Date(entryDate.getFullYear(), 0, 1);
  const week = Math.ceil(
    (((entryDate.getTime() - startOfYear.getTime()) / 86_400_000) + startOfYear.getDay() + 1) / 7,
  );
  const summary = await db.qtTimesheetWeeklySummary.findFirst({
    where: {
      issueId: issue.id,
      userId,
      year: entryDate.getFullYear(),
      weekNumber: week,
    },
    select: { id: true, totalHours: true },
  });
  if (summary) {
    await db.qtTimesheetWeeklySummary.update({
      where: { id: summary.id },
      data: { totalHours: summary.totalHours + parsed.data.hours },
    });
  } else {
    await db.qtTimesheetWeeklySummary.create({
      data: {
        orgId: orgId,
        issueId: issue.id,
        userId,
        year: entryDate.getFullYear(),
        weekNumber: week,
        totalHours: parsed.data.hours,
      },
    });
  }

  return NextResponse.json({ success: true, data: entry }, { status: 201 });
});
