import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Assignment");

const updateSchema = z.object({
  condition: z.string().optional(),
  expectedReturn: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.string().optional(),
});

export const PUT = auth.update<{ id: string }>(async ({ orgId }, req, { params }) => {
  const { id } = params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const row = await db.astAssignment.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const data = parsed.data as Prisma.AstAssignmentUncheckedUpdateInput;
  const assignment = await db.astAssignment.update({
    where: { id },
    data,
    include: {
      asset: { include: { baseCategory: true, category: true } },
      user: true,
    },
  });
  return NextResponse.json({ success: true, data: assignment });
});

export const DELETE = auth.delete<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const { id } = params;
  const row = await db.astAssignment.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await db.astAssignment.delete({ where: { id } });
  return NextResponse.json({ success: true, data: { ok: true } });
});

export const PATCH = auth.update<{ id: string }>(async ({ orgId, userId, userEmail }, _req, { params }) => {
  const { id } = params;
  const existing = await db.astAssignment.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const result = await db.$transaction(async (tx) => {
    const assignment = await tx.astAssignment.update({
      where: { id },
      data: { status: "Returned", returnedAt: new Date() },
      include: { asset: true, user: true },
    });
    await tx.astAsset.update({ where: { id: assignment.assetId }, data: { assetStatus: "Available" } });
    return assignment;
  });
  await audit({
    orgId,
    module: "Assignments",
    action: "Asset Returned",
    entityId: id,
    entityName: `${result.asset?.itemName} from ${result.user?.name}`,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: result });
});
