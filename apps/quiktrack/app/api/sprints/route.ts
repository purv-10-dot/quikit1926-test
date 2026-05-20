import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createSprintSchema } from "@/lib/validation/sprint";
import { userCanInProject, forbidden } from "@/lib/api/permissions";

export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json(
      { success: false, error: "projectId is required" },
      { status: 400 },
    );
  }

  const project = await db.qtProject.findFirst({
    where: { id: projectId, orgId: orgId, isDeleted: false },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }
  const member = await db.qtProjectMember.findFirst({
    where: { projectId, userId, isDeleted: false },
    select: { id: true },
  });
  const tenantAdmin = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  const isAdmin = tenantAdmin?.role === "admin" || tenantAdmin?.role === "owner";
  if (!member && !isAdmin) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }

  const cursor = url.searchParams.get("cursor");
  const limitParam = Number(url.searchParams.get("limit") || 0);
  const limit = limitParam > 0 ? Math.min(50, limitParam) : 0; // 0 = no pagination

  const sprints = await db.qtSprint.findMany({
    where: { projectId, isDeleted: false },
    orderBy: [{ status: "asc" }, { startDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: limit > 0 ? limit + 1 : undefined,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  let nextCursor: string | null = null;
  let pageSprints = sprints;
  if (limit > 0 && sprints.length > limit) {
    pageSprints = sprints.slice(0, limit);
    nextCursor = pageSprints[pageSprints.length - 1]?.id ?? null;
  }

  const sprintIds = pageSprints.map((s) => s.id);
  const counts = sprintIds.length
    ? await db.qtIssue.groupBy({
        by: ["sprintId", "statusId"],
        where: {
          projectId,
          isDeleted: false,
          sprintId: { in: sprintIds },
          type: { notIn: ["EPIC", "SUBTASK"] },
        },
        _count: { _all: true },
      })
    : [];
  const statuses = await db.qtIssueStatus.findMany({
    where: { projectId, isDeleted: false },
    select: { id: true, category: true },
  });
  const catById = new Map(statuses.map((s) => [s.id, s.category] as const));
  const aggregated: Record<string, { todo: number; inProgress: number; done: number }> = {};
  for (const c of counts) {
    if (!c.sprintId) continue;
    const cat = catById.get(c.statusId) ?? "BACKLOG";
    aggregated[c.sprintId] ||= { todo: 0, inProgress: 0, done: 0 };
    if (cat === "DONE") aggregated[c.sprintId].done += c._count._all;
    else if (cat === "IN_PROGRESS") aggregated[c.sprintId].inProgress += c._count._all;
    else aggregated[c.sprintId].todo += c._count._all;
  }

  return NextResponse.json({
    success: true,
    data: pageSprints.map((s) => ({
      ...s,
      counts: aggregated[s.id] ?? { todo: 0, inProgress: 0, done: 0 },
    })),
    nextCursor,
  });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = createSprintSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const project = await db.qtProject.findFirst({
    where: { id: parsed.data.projectId, orgId: orgId, isDeleted: false },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }
  const member = await db.qtProjectMember.findFirst({
    where: { projectId: project.id, userId, isDeleted: false },
    select: { role: true },
  });
  const tenantAdmin = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  const isAdmin = tenantAdmin?.role === "admin" || tenantAdmin?.role === "owner";
  if (!isAdmin && !member) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }
  if (!isAdmin && !(await userCanInProject(userId, orgId, project.id, "Sprint", "create"))) {
    return forbidden();
  }
  const sprint = await db.qtSprint.create({
    data: {
      projectId: project.id,
      name: parsed.data.name,
      goal: parsed.data.goal,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      createdBy: userId,
      updatedBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: sprint }, { status: 201 });
});
