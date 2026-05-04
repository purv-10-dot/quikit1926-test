import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("quality");

const patchSchema = z.object({
  decision: z.enum(["pending", "accepted", "rejected", "conditional"]).optional(),
  remarks: z.string().optional().nullable(),
});

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const insp = await db.cnQCInspection.findFirst({
    where: { id: params.id, orgId },
    include: { grn: true, project: true, defects: { include: { item: { select: { code: true, name: true } } } } },
  });
  if (!insp) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: insp });
});

export const PATCH = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const input = patchSchema.parse(await req.json());
  const insp = await db.cnQCInspection.update({ where: { id: params.id }, data: { ...input, updatedBy: userId } });
  return NextResponse.json({ success: true, data: insp });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  await db.cnQCInspection.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
