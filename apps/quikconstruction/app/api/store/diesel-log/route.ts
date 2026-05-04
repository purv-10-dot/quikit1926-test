import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { dieselCreateSchema } from "@/lib/schemas/procurement-3b";

const withOrgAuth = withOrgAuthForModule("store");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const list = await db.cnDieselLog.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    include: {
      project: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      machinery: { select: { id: true, code: true, name: true } },
    },
    orderBy: { logDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = dieselCreateSchema.parse(body);
  const dup = await db.cnDieselLog.findFirst({
    where: { orgId, logNumber: input.logNumber, deletedAt: null },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ success: false, error: `Log number '${input.logNumber}' already exists` }, { status: 409 });

  const log = await db.cnDieselLog.create({
    data: {
      orgId,
      ...input,
      logDate: new Date(input.logDate),
      amount: input.amount ?? (input.unitRate ? input.fuelQty * input.unitRate : null),
      createdBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: log }, { status: 201 });
});
