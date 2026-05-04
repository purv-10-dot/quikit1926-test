import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("quality");

const createSchema = z.object({
  inspectionNumber: z.string().min(1).max(50),
  grnId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  inspectorId: z.string().min(1),
  inspectionDate: z.string().min(1),
  decision: z.enum(["pending", "accepted", "rejected", "conditional"]).default("pending"),
  remarks: z.string().optional().nullable(),
  defects: z.array(z.object({
    itemId: z.string().optional().nullable(),
    defectType: z.string().min(1),
    severity: z.enum(["minor", "major", "critical"]).default("minor"),
    quantity: z.number().min(0).optional().nullable(),
    remarks: z.string().optional().nullable(),
  })).default([]),
});

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const list = await db.cnQCInspection.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    include: {
      grn: { select: { id: true, grnNumber: true } },
      project: { select: { id: true, name: true, code: true } },
      _count: { select: { defects: true } },
    },
    orderBy: { inspectionDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const input = createSchema.parse(await req.json());
  const dup = await db.cnQCInspection.findFirst({ where: { orgId, inspectionNumber: input.inspectionNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Inspection '${input.inspectionNumber}' already exists` }, { status: 409 });
  const insp = await db.cnQCInspection.create({
    data: {
      orgId,
      inspectionNumber: input.inspectionNumber,
      grnId: input.grnId ?? null,
      projectId: input.projectId ?? null,
      inspectorId: input.inspectorId,
      inspectionDate: new Date(input.inspectionDate),
      decision: input.decision,
      remarks: input.remarks ?? null,
      createdBy: userId,
      defects: { create: input.defects.map(d => ({ itemId: d.itemId ?? null, defectType: d.defectType, severity: d.severity, quantity: d.quantity ?? null, remarks: d.remarks ?? null })) },
    },
    include: { defects: true },
  });
  return NextResponse.json({ success: true, data: insp }, { status: 201 });
});
