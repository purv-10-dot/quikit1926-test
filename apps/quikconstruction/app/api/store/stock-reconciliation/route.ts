import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { reconCreateSchema } from "@/lib/schemas/procurement-3b";

const withTenantAuth = withTenantAuthForModule("store");

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const rows = await db.cnStockReconciliation.findMany({
    where: { tenantId, deletedAt: includeDeleted ? { not: null } : null },
    include: { project: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } },
    orderBy: { reconciliationDate: "desc" },
  });
  return NextResponse.json({ success: true, data: rows });
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const body = await req.json();
  const input = reconCreateSchema.parse(body);
  const dup = await db.cnStockReconciliation.findFirst({
    where: { tenantId, reconciliationNumber: input.reconciliationNumber, deletedAt: null },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ success: false, error: `Reconciliation number '${input.reconciliationNumber}' already exists` }, { status: 409 });

  const rec = await db.cnStockReconciliation.create({
    data: {
      tenantId,
      reconciliationNumber: input.reconciliationNumber,
      projectId: input.projectId,
      locationId: input.locationId,
      reconciliationDate: new Date(input.reconciliationDate),
      reason: input.reason,
      status: "draft",
      createdBy: userId,
      lines: {
        create: input.lines.map((l) => {
          const adjustmentQty = l.physicalQty - l.systemQty;
          return {
            itemId: l.itemId,
            systemQty: l.systemQty,
            physicalQty: l.physicalQty,
            adjustmentQty,
            uomId: l.uomId,
            unitRate: l.unitRate,
            amount: Math.abs(adjustmentQty) * l.unitRate,
            remarks: l.remarks,
          };
        }),
      },
    },
    include: { lines: true },
  });
  return NextResponse.json({ success: true, data: rec }, { status: 201 });
});
