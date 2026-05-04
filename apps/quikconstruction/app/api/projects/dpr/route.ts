import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { dprCreateSchema } from "@/lib/schemas/projects";

const withTenantAuth = withTenantAuthForModule("projects");

export const GET = withTenantAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
  const dateFrom = req.nextUrl.searchParams.get("dateFrom") || undefined;
  const dateTo = req.nextUrl.searchParams.get("dateTo") || undefined;
  const list = await db.cnDPR.findMany({
    where: {
      orgId,
      deletedAt: includeDeleted ? { not: null } : null,
      ...(projectId ? { projectId } : {}),
      ...(dateFrom || dateTo
        ? { dprDate: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } }
        : {}),
    },
    include: {
      project: { select: { id: true, name: true, code: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { dprDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = dprCreateSchema.parse(body);
  const project = await db.cnProject.findFirst({ where: { id: input.projectId, orgId }, select: { id: true } });
  if (!project) return NextResponse.json({ success: false, error: "Project not found" }, { status: 400 });
  // Enforce @@unique([orgId, projectId, dprDate]) — friendlier error
  const existing = await db.cnDPR.findFirst({
    where: { orgId, projectId: input.projectId, dprDate: new Date(input.dprDate), deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: "A DPR for this project + date already exists. Edit it instead." },
      { status: 409 },
    );
  }

  const dpr = await db.cnDPR.create({
    data: {
      orgId,
      projectId: input.projectId,
      dprDate: new Date(input.dprDate),
      weather: input.weather,
      reportedById: input.reportedById,
      remarks: input.remarks,
      status: "draft",
      createdBy: userId,
      lines: {
        create: input.lines.map((l) => ({
          boqItemId: l.boqItemId ?? null,
          activity: l.activity,
          quantityDone: l.quantityDone,
          uomId: l.uomId ?? null,
          labourCount: l.labourCount ?? null,
          labourHours: l.labourHours ?? null,
          machineryUsed: l.machineryUsed ?? null,
          remarks: l.remarks ?? null,
        })),
      },
    },
    include: { lines: true },
  });
  return NextResponse.json({ success: true, data: dpr }, { status: 201 });
});
