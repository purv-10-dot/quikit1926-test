import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createReleaseSchema } from "@/lib/validation/release";
import { userCanInProject, forbidden, hasAdminAccess } from "@/lib/api/permissions";

export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const idOrKey = url.searchParams.get("projectId");
  if (!idOrKey) {
    return NextResponse.json(
      { success: false, error: "projectId is required" },
      { status: 400 },
    );
  }

  // projectId query param may be a cuid or a project KEY (keys are per-org).
  const project = await db.qtProject.findFirst({
    where: { orgId, isDeleted: false, OR: [{ id: idOrKey }, { projectKey: idOrKey }] },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }
  const projectId = project.id;
  const member = await db.qtProjectMember.findFirst({
    where: { projectId, userId, isDeleted: false },
    select: { id: true },
  });
  const isAdmin = await hasAdminAccess(userId, orgId);
  if (!member && !isAdmin) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }

  const cursor = url.searchParams.get("cursor");
  const limitParam = Number(url.searchParams.get("limit") || 0);
  const limit = limitParam > 0 ? Math.min(50, limitParam) : 0; // 0 = no pagination
  const statusFilter = url.searchParams.get("status");

  const releases = await db.qtRelease.findMany({
    where: {
      projectId,
      isDeleted: false,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: [{ status: "asc" }, { releaseDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: limit > 0 ? limit + 1 : undefined,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      _count: { select: { relatedLinks: true } },
    },
  });

  let nextCursor: string | null = null;
  let pageReleases = releases;
  if (limit > 0 && releases.length > limit) {
    pageReleases = releases.slice(0, limit);
    nextCursor = pageReleases[pageReleases.length - 1]?.id ?? null;
  }

  const releaseIds = pageReleases.map((r) => r.id);
  const links = releaseIds.length
    ? await db.qtIssueRelease.findMany({
        where: { releaseId: { in: releaseIds } },
        select: {
          releaseId: true,
          issue: { select: { statusId: true, isDeleted: true } },
        },
      })
    : [];
  const statuses = await db.qtIssueStatus.findMany({
    where: { projectId, isDeleted: false },
    select: { id: true, category: true },
  });
  const catById = new Map(statuses.map((s) => [s.id, s.category] as const));
  const aggregated: Record<string, { todo: number; inProgress: number; done: number }> = {};
  for (const link of links) {
    if (link.issue.isDeleted) continue;
    aggregated[link.releaseId] ||= { todo: 0, inProgress: 0, done: 0 };
    const cat = catById.get(link.issue.statusId) ?? "BACKLOG";
    if (cat === "DONE") aggregated[link.releaseId].done += 1;
    else if (cat === "IN_PROGRESS") aggregated[link.releaseId].inProgress += 1;
    else aggregated[link.releaseId].todo += 1;
  }

  return NextResponse.json({
    success: true,
    data: pageReleases.map((r) => ({
      ...r,
      linkedWorkItemCount: aggregated[r.id]
        ? aggregated[r.id].todo + aggregated[r.id].inProgress + aggregated[r.id].done
        : 0,
      counts: aggregated[r.id] ?? { todo: 0, inProgress: 0, done: 0 },
    })),
    nextCursor,
  });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = createReleaseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  // The body's projectId may be a cuid OR a project KEY, same as sprints.
  const project = await db.qtProject.findFirst({
    where: {
      orgId,
      isDeleted: false,
      OR: [{ id: parsed.data.projectId }, { projectKey: parsed.data.projectId }],
    },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }
  const member = await db.qtProjectMember.findFirst({
    where: { projectId: project.id, userId, isDeleted: false },
    select: { role: true },
  });
  const isAdmin = await hasAdminAccess(userId, orgId);
  if (!isAdmin && !member) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }
  if (!isAdmin && !(await userCanInProject(userId, orgId, project.id, "Release", "create"))) {
    return forbidden();
  }
  const release = await db.qtRelease.create({
    data: {
      projectId: project.id,
      name: parsed.data.name,
      description: parsed.data.description,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      releaseDate: parsed.data.releaseDate ? new Date(parsed.data.releaseDate) : null,
      driverId: parsed.data.driverId,
      createdBy: userId,
      updatedBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: release }, { status: 201 });
});
