import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { resolveAssigneeEmployeeId } from "@/lib/api/resolveAssignee";

const auth = withOrgAuthForResource("Replacement");

const createSchema = z.object({
  repairId: z.string(),
  assetId: z.string(),
  userId: z.string(),
  type: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const GET = auth.view(async ({ orgId }, req) => {
  const { searchParams } = new URL(req.url);
  const repairId = searchParams.get("repairId");

  const replacements = await db.astReplacement.findMany({
    where: { orgId, ...(repairId ? { repairId } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      asset: { include: { baseCategory: true, category: true } },
      user: true,
      repair: { include: { asset: { select: { itemName: true, itemCode: true } } } },
    },
  });
  return NextResponse.json({ success: true, data: replacements });
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
  const { repairId, assetId, userId, type, startDate, endDate, notes } = parsed.data;

  // tenant ownership guards on referenced rows
  const repairOwned = await db.astRepair.findFirst({ where: { id: repairId, orgId }, select: { id: true } });
  if (!repairOwned) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const assetOwned = await db.astAsset.findFirst({ where: { id: assetId, orgId }, select: { id: true } });
  if (!assetOwned) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  // Manual picker sends a platform User.id; the repairs auto-fill reuses the
  // original assignment's AstEmployee.id. Resolve either to an AstEmployee.id —
  // the stored value is later reused verbatim as the assignment FK during
  // recovery (repairs/[id] makePermanent / returnAndReassign).
  const resolved = await resolveAssigneeEmployeeId({ orgId, ref: userId });
  if ("error" in resolved) return resolved.error;
  const employeeId = resolved.employeeId;

  const replacement = await db.$transaction(async (tx) => {
    const created = await tx.astReplacement.create({
      data: {
        orgId,
        repairId,
        assetId,
        userId: employeeId,
        type,
        startDate,
        endDate: endDate || null,
        notes: notes || null,
        isActive: true,
      },
      include: {
        asset: { include: { baseCategory: true, category: true } },
        user: true,
      },
    });
    // Mark replacement asset as Assigned so it can't be assigned to anyone else
    await tx.astAsset.update({ where: { id: assetId }, data: { assetStatus: "Assigned" } });
    return created;
  });

  await audit({
    orgId,
    module: "Replacements",
    action: "Replacement Assigned",
    entityId: replacement.id,
    entityName: `${replacement.asset?.itemName} → ${replacement.user?.name}`,
    details: `Type: ${replacement.type}`,
    actorId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: replacement }, { status: 201 });
});
