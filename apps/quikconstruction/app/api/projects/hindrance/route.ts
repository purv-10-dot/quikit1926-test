import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { hindranceCreateSchema } from "@/lib/schemas/projects";

const withTenantAuth = withTenantAuthForModule("projects");

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
  const list = await db.cnHindrance.findMany({
    where: {
      tenantId,
      deletedAt: includeDeleted ? { not: null } : null,
      ...(status ? { status } : {}),
      ...(projectId ? { projectId } : {}),
    },
    include: { project: { select: { id: true, name: true, code: true } } },
    orderBy: { hindranceDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const body = await req.json();
  const input = hindranceCreateSchema.parse(body);
  const project = await db.cnProject.findFirst({ where: { id: input.projectId, tenantId }, select: { id: true } });
  if (!project) return NextResponse.json({ success: false, error: "Project not found" }, { status: 400 });

  const start = new Date(input.startDate);
  const end = input.endDate ? new Date(input.endDate) : null;
  const daysImpacted = end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1) : null;

  const h = await db.cnHindrance.create({
    data: {
      tenantId,
      projectId: input.projectId,
      hindranceDate: new Date(input.hindranceDate),
      category: input.category,
      title: input.title,
      description: input.description,
      startDate: start,
      endDate: end,
      daysImpacted,
      status: "open",
      createdBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: h }, { status: 201 });
});
