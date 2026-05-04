import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { z } from "zod";

const withTenantAuth = withTenantAuthForModule("projects");

const schema = z.object({
  boqNumber: z.string().min(1).max(50),
  boqDate: z.string().min(1),
});

/**
 * POST /api/projects/estimation/[id]/convert-to-boq
 *
 * Creates a BOQ from this estimation. Clones item tree preserving hierarchy.
 * Marks estimation as converted + links to the new BOQ.
 */
export const POST = withTenantAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const est = await db.cnEstimation.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    include: { items: { orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }] } },
  });
  if (!est) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (est.status === "converted") {
    return NextResponse.json({ success: false, error: "Already converted" }, { status: 409 });
  }

  const body = await req.json();
  const input = schema.parse(body);
  const dup = await db.cnBOQ.findFirst({
    where: { orgId, boqNumber: input.boqNumber, deletedAt: null },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ success: false, error: `BOQ '${input.boqNumber}' already exists` }, { status: 409 });

  const boq = await db.$transaction(async (tx) => {
    const created = await tx.cnBOQ.create({
      data: {
        orgId,
        projectId: est.projectId,
        boqNumber: input.boqNumber,
        boqDate: new Date(input.boqDate),
        currency: est.currency,
        subtotal: est.subtotal,
        taxAmount: est.taxAmount,
        total: est.total,
        status: "draft",
        remarks: `Converted from Estimation ${est.estimationNumber}`,
        createdBy: userId,
      },
    });

    // Clone items preserving hierarchy
    const idMap = new Map<string, string>();
    for (const it of est.items) {
      const row = await tx.cnBOQItem.create({
        data: {
          boqId: created.id,
          sortOrder: it.sortOrder,
          kind: it.kind,
          code: it.code,
          description: it.description,
          itemId: it.itemId,
          uomId: it.uomId,
          quantity: it.quantity,
          rate: it.rate,
          amount: it.amount,
          gstRate: it.gstRate,
        },
      });
      idMap.set(it.id, row.id);
    }
    // Wire parents
    for (const it of est.items) {
      if (!it.parentId) continue;
      const childNewId = idMap.get(it.id);
      const parentNewId = idMap.get(it.parentId);
      if (childNewId && parentNewId) {
        await tx.cnBOQItem.update({ where: { id: childNewId }, data: { parentId: parentNewId } });
      }
    }

    await tx.cnEstimation.update({
      where: { id: est.id },
      data: { status: "converted", convertedBoqId: created.id, updatedBy: userId },
    });
    return created;
  });

  return NextResponse.json({ success: true, data: boq }, { status: 201 });
});
