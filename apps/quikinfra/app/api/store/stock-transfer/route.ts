import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { transferCreateSchema } from "@/lib/schemas/procurement-3b";

const withOrgAuth = withOrgAuthForModule("store");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const transfers = await db.cnStockTransfer.findMany({
    where: { orgId, ...(includeDeleted ? {} : { status: { not: "cancelled" } }) },
    include: {
      fromProject: { select: { id: true, name: true } },
      fromLocation: { select: { id: true, name: true } },
      toLocation: { select: { id: true, name: true } },
    },
    orderBy: { transferDate: "desc" },
  });
  return NextResponse.json({ success: true, data: transfers });
}, { permission: { resource: "construction.transfer", action: "view" } });

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = transferCreateSchema.parse(body);
  // Both locations must belong to tenant
  const [from, to] = await Promise.all([
    db.cnLocation.findFirst({ where: { id: input.fromLocationId, orgId }, select: { id: true } }),
    db.cnLocation.findFirst({ where: { id: input.toLocationId, orgId }, select: { id: true } }),
  ]);
  if (!from) return NextResponse.json({ success: false, error: "Source location not found" }, { status: 400 });
  if (!to) return NextResponse.json({ success: false, error: "Destination location not found" }, { status: 400 });
  const dup = await db.cnStockTransfer.findFirst({ where: { orgId, transferNumber: input.transferNumber }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Transfer number '${input.transferNumber}' already exists` }, { status: 409 });

  const tr = await db.cnStockTransfer.create({
    data: {
      orgId,
      transferNumber: input.transferNumber,
      fromProjectId: input.projectId,
      toProjectId: input.projectId,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      transferDate: new Date(input.transferDate),
      transferReason: input.reason,
      status: "draft",
      createdBy: userId,
      updatedBy: userId,
      lines: {
        create: input.lines.map((l) => ({
          itemId: l.itemId,
          sentQty: l.quantity,
          uomId: l.uomId,
          remarks: l.remarks,
        })),
      },
    },
    include: { lines: true },
  });
  return NextResponse.json({ success: true, data: tr }, { status: 201 });
}, { permission: { resource: "construction.transfer", action: "create" } });
