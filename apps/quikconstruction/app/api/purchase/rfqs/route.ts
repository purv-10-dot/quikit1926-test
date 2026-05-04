import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { rfqCreateSchema } from "@/lib/schemas/procurement-3b";

const withTenantAuth = withTenantAuthForModule("purchase");

export const GET = withTenantAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const list = await db.cnRFQ.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    include: {
      project: { select: { id: true, name: true } },
      lines: { include: { item: true, uom: true } },
      vendors: { include: { vendor: { select: { id: true, name: true } } } },
    },
    orderBy: { rfqDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = rfqCreateSchema.parse(body);
  const project = await db.cnProject.findFirst({ where: { id: input.projectId, orgId }, select: { id: true } });
  if (!project) return NextResponse.json({ success: false, error: "Project not found" }, { status: 400 });
  // Validate vendors
  const vendorCount = await db.cnVendor.count({ where: { id: { in: input.vendorIds }, orgId } });
  if (vendorCount !== input.vendorIds.length) {
    return NextResponse.json({ success: false, error: "One or more vendors not found in tenant" }, { status: 400 });
  }
  const dup = await db.cnRFQ.findFirst({ where: { orgId, rfqNumber: input.rfqNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `RFQ number '${input.rfqNumber}' already exists` }, { status: 409 });

  const rfq = await db.cnRFQ.create({
    data: {
      orgId,
      rfqNumber: input.rfqNumber,
      indentId: input.indentId ?? null,
      projectId: input.projectId,
      rfqDate: new Date(input.rfqDate),
      closingDate: input.closingDate ? new Date(input.closingDate) : null,
      remarks: input.remarks,
      status: "draft",
      createdBy: userId,
      lines: {
        create: input.lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          uomId: l.uomId,
          specification: l.specification,
        })),
      },
      vendors: {
        create: input.vendorIds.map((vendorId) => ({ vendorId })),
      },
    },
    include: { lines: true, vendors: true },
  });
  return NextResponse.json({ success: true, data: rfq }, { status: 201 });
});
