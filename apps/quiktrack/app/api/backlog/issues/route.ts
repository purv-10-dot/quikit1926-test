import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";

export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const idOrKey = url.searchParams.get("projectId");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
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

  const where = {
    orgId: orgId,
    projectId,
    isDeleted: false,
    sprintId: null,
    type: { in: ["TASK", "EPIC"] },
  };
  const [data, total] = await Promise.all([
    db.qtIssue.findMany({
      where,
      orderBy: [{ orderInColumn: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        key: true,
        title: true,
        type: true,
        statusId: true,
        priority: true,
        epicId: true,
        assigneeId: true,
        eta: true,
        storyPoints: true,
      },
    }),
    db.qtIssue.count({ where }),
  ]);
  return NextResponse.json({
    success: true,
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
