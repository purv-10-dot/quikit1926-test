import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Assignment");

const createSchema = z.object({
  assetId: z.string(),
  userId: z.string(),
  condition: z.string(),
  expectedReturn: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const GET = auth.view(async ({ orgId }, req) => {
  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get("assetId");

  const assignments = await db.astAssignment.findMany({
    where: {
      orgId,
      ...(assetId ? { assetId, status: "Active" } : {}),
    },
    orderBy: { assignedAt: "desc" },
    include: {
      asset: { include: { baseCategory: true, category: true } },
      user: true,
    },
  });
  return NextResponse.json({ success: true, data: assignments });
});

export const POST = auth.create(async ({ orgId, userId: actorId, userEmail }, req) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { assetId, userId, condition, expectedReturn, notes } = parsed.data;

  // tenant ownership guards on referenced rows
  const assetOwned = await db.astAsset.findFirst({ where: { id: assetId, orgId }, select: { id: true } });
  if (!assetOwned) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const employeeOwned = await db.astEmployee.findFirst({ where: { id: userId, orgId }, select: { id: true } });
  if (!employeeOwned) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const assignment = await db.$transaction(async (tx) => {
    const created = await tx.astAssignment.create({
      data: {
        orgId,
        assetId,
        userId,
        condition,
        expectedReturn: expectedReturn || null,
        notes: notes || null,
      },
      include: {
        asset: { include: { baseCategory: true, category: true } },
        user: true,
      },
    });
    await tx.astAsset.update({ where: { id: assetId }, data: { assetStatus: "Assigned" } });
    return created;
  });

  await audit({
    orgId,
    module: "Assignments",
    action: "Asset Assigned",
    entityId: assignment.id,
    entityName: `${assignment.asset?.itemName} → ${assignment.user?.name}`,
    details: `Condition: ${assignment.condition}`,
    actorId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: assignment }, { status: 201 });
});
