import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const updateSchema = z.object({
  hours: z.number().min(0).max(24).optional(),
  description: z.string().max(2000).nullable().optional(),
  entryDate: z.string().datetime().optional(),
  issueId: z.string().min(1).optional(),
});

export const GET = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const entry = await db.qtTimesheetEntry.findFirst({
    where: { id: params.id, orgId, isDeleted: false },
    select: {
      id: true, userId: true, projectId: true, issueId: true,
      entryDate: true, hours: true, description: true,
      issue: { select: { id: true, key: true, title: true, projectId: true } },
    },
  });
  if (!entry) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (entry.userId !== userId) return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
  return NextResponse.json({ success: true, data: entry });
});

export const PATCH = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const entry = await db.qtTimesheetEntry.findFirst({
    where: { id: params.id, orgId, isDeleted: false },
    select: { id: true, userId: true },
  });
  if (!entry) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (entry.userId !== userId) return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  if (parsed.data.hours === 0) {
    await db.qtTimesheetEntry.update({
      where: { id: entry.id }, data: { isDeleted: true, updatedBy: userId },
    });
    return NextResponse.json({ success: true, data: { id: entry.id, deleted: true } });
  }

  let nextProjectId: string | undefined;
  let nextParentIssueId: string | null | undefined;
  if (parsed.data.issueId) {
    const issue = await db.qtIssue.findFirst({
      where: { id: parsed.data.issueId, orgId, isDeleted: false },
      select: { id: true, projectId: true, parentId: true },
    });
    if (!issue) return NextResponse.json({ success: false, error: "Issue not found" }, { status: 404 });
    nextProjectId = issue.projectId;
    nextParentIssueId = issue.parentId;
  }

  const updated = await db.qtTimesheetEntry.update({
    where: { id: entry.id },
    data: {
      ...(parsed.data.hours !== undefined ? { hours: parsed.data.hours } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.entryDate ? { entryDate: new Date(parsed.data.entryDate) } : {}),
      ...(parsed.data.issueId ? { issueId: parsed.data.issueId } : {}),
      ...(nextProjectId ? { projectId: nextProjectId } : {}),
      ...(nextParentIssueId !== undefined ? { parentIssueId: nextParentIssueId } : {}),
      updatedBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: updated });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const entry = await db.qtTimesheetEntry.findFirst({
    where: { id: params.id, orgId, isDeleted: false },
    select: { id: true, userId: true },
  });
  if (!entry) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (entry.userId !== userId) return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
  await db.qtTimesheetEntry.update({
    where: { id: entry.id }, data: { isDeleted: true, updatedBy: userId },
  });
  return NextResponse.json({ success: true, data: { id: entry.id } });
});
