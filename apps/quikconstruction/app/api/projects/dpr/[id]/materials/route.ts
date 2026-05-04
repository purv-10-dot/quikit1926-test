import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("projects");

const setMaterialsSchema = z.object({
  consumptionLocationId: z.string().optional().nullable(),
  materials: z.array(z.object({
    itemId: z.string().min(1),
    uomId: z.string().min(1),
    quantity: z.number().positive(),
    remarks: z.string().optional().nullable(),
  })).default([]),
});

/**
 * PUT /api/projects/dpr/[id]/materials — replace the material consumption
 * plan for a draft/submitted DPR. No ledger impact. Posting writes the
 * ledger separately.
 */
export const PUT = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const input = setMaterialsSchema.parse(await req.json());
  const dpr = await db.cnDPR.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true, status: true } });
  if (!dpr) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (dpr.status === "posted") return NextResponse.json({ success: false, error: "DPR is posted; materials are immutable" }, { status: 409 });

  const result = await db.$transaction(async (tx) => {
    await tx.cnDPRMaterial.deleteMany({ where: { dprId: dpr.id } });
    await tx.cnDPR.update({
      where: { id: dpr.id },
      data: {
        consumptionLocationId: input.consumptionLocationId ?? null,
        updatedBy: userId,
        materials: { create: input.materials.map((m) => ({
          itemId: m.itemId, uomId: m.uomId, quantity: m.quantity, remarks: m.remarks ?? null,
        })) },
      },
    });
    return tx.cnDPR.findUnique({ where: { id: dpr.id }, include: { materials: true } });
  });

  return NextResponse.json({ success: true, data: result });
});
