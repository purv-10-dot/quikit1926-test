import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { projectUpdateSchema } from "@/lib/schemas/masters-phase2";

const withOrgAuth = withOrgAuthForModule("masters");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const project = await db.cnProject.findFirst({
    where: { id: params.id, orgId },
    include: {
      company: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
    },
  });
  if (!project) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: project });
});

export const PATCH = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const existing = await db.cnProject.findFirst({
    where: { id: params.id, orgId },
    select: { id: true, code: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const body = await req.json();
  const input = projectUpdateSchema.parse(body);

  if (input.code && input.code !== existing.code) {
    const conflict = await db.cnProject.findFirst({
      where: { orgId, code: input.code, deletedAt: null, NOT: { id: params.id } },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json(
        { success: false, error: `Project code '${input.code}' already exists` },
        { status: 409 },
      );
    }
  }

  const updated = await db.cnProject.update({
    where: { id: params.id },
    data: {
      ...input,
      ...(input.startDate ? { startDate: new Date(input.startDate) } : {}),
      ...(input.expectedEndDate ? { expectedEndDate: new Date(input.expectedEndDate) } : {}),
      ...(input.actualEndDate ? { actualEndDate: new Date(input.actualEndDate) } : {}),
      updatedBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: updated });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.cnProject.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  await db.cnProject.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), updatedBy: userId },
  });
  return NextResponse.json({ success: true });
});
