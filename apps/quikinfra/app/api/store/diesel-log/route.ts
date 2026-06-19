import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { dieselCreateSchema } from "@/lib/schemas/procurement-3b";

const withOrgAuth = withOrgAuthForModule("store");

export const GET = withOrgAuth(async ({ orgId }) => {
  const list = await db.cnDieselLog.findMany({
    where: { orgId },
    include: {
      project: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      machinery: { select: { id: true, code: true, name: true } },
    },
    orderBy: { logDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
}, { permission: { resource: "construction.diesel", action: "view" } });

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = dieselCreateSchema.parse(body);
  if (!input.machineryId) {
    return NextResponse.json({ success: false, error: "Machinery is required" }, { status: 400 });
  }

  const log = await db.cnDieselLog.create({
    data: {
      orgId,
      projectId: input.projectId,
      locationId: input.locationId,
      machineryId: input.machineryId,
      logDate: new Date(input.logDate),
      quantityIssued: input.fuelQty,
      unitRate: input.unitRate ?? 0,
      totalCost: input.amount ?? input.fuelQty * (input.unitRate ?? 0),
      openingReading: input.openingReading ?? null,
      closingReading: input.closingReading ?? null,
      operatorName: input.driverName ?? null,
      remarks: input.remarks ?? null,
      createdBy: userId,
      updatedBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: log }, { status: 201 });
}, { permission: { resource: "construction.diesel", action: "create" } });
