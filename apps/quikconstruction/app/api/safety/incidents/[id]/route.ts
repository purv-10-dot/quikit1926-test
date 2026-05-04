import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("safety");

const patchSchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "closed"]).optional(),
  description: z.string().optional().nullable(),
});

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const i = await db.cnSafetyIncident.findFirst({ where: { id: params.id, orgId }, include: { project: true } });
  if (!i) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: i });
});

export const PATCH = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const input = patchSchema.parse(await req.json());
  const data: Record<string, unknown> = { ...input, updatedBy: userId };
  if (input.status === "resolved" || input.status === "closed") {
    data.resolvedAt = new Date();
    data.resolvedBy = userId;
  }
  const i = await db.cnSafetyIncident.update({ where: { id: params.id }, data });
  return NextResponse.json({ success: true, data: i });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  await db.cnSafetyIncident.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
