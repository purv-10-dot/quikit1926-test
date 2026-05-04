import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { goodReturnCreateSchema } from "@/lib/schemas/procurement-3b";

const withTenantAuth = withTenantAuthForModule("store");

export const GET = withTenantAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const returns = await db.cnGoodReturn.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null, ...(status ? { status } : {}) },
    include: {
      grn: { select: { id: true, grnNumber: true } },
      project: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: { returnDate: "desc" },
  });
  return NextResponse.json({ success: true, data: returns });
});

export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = goodReturnCreateSchema.parse(body);
  const grn = await db.cnGoodsReceiptNote.findFirst({
    where: { id: input.grnId, orgId, deletedAt: null },
    select: { id: true, status: true, vendorId: true, projectId: true, locationId: true },
  });
  if (!grn) return NextResponse.json({ success: false, error: "GRN not found" }, { status: 400 });
  if (grn.status !== "posted") {
    return NextResponse.json({ success: false, error: "Can only return against a posted GRN" }, { status: 400 });
  }
  if (grn.vendorId !== input.vendorId || grn.projectId !== input.projectId || grn.locationId !== input.locationId) {
    return NextResponse.json({ success: false, error: "Vendor/Project/Location must match source GRN" }, { status: 400 });
  }
  const dup = await db.cnGoodReturn.findFirst({ where: { orgId, returnNumber: input.returnNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Return number '${input.returnNumber}' already exists` }, { status: 409 });

  const ret = await db.cnGoodReturn.create({
    data: {
      orgId,
      returnNumber: input.returnNumber,
      grnId: input.grnId,
      projectId: input.projectId,
      vendorId: input.vendorId,
      locationId: input.locationId,
      returnDate: new Date(input.returnDate),
      reason: input.reason,
      status: "draft",
      createdBy: userId,
      lines: {
        create: input.lines.map((l) => ({
          itemId: l.itemId,
          returnQty: l.returnQty,
          uomId: l.uomId,
          unitRate: l.unitRate,
          amount: l.returnQty * l.unitRate,
          remarks: l.remarks,
        })),
      },
    },
    include: { lines: true },
  });
  return NextResponse.json({ success: true, data: ret }, { status: 201 });
});
