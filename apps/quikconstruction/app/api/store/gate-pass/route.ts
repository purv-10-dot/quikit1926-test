import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { gatePassCreateSchema } from "@/lib/schemas/procurement-3b";

const withTenantAuth = withTenantAuthForModule("store");

export const GET = withTenantAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const list = await db.cnGatePass.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    include: { project: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } },
    orderBy: { gatePassDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = gatePassCreateSchema.parse(body);
  const dup = await db.cnGatePass.findFirst({
    where: { orgId, gatePassNumber: input.gatePassNumber, deletedAt: null },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ success: false, error: `Gate pass '${input.gatePassNumber}' already exists` }, { status: 409 });

  const gp = await db.cnGatePass.create({
    data: {
      orgId,
      ...input,
      gatePassDate: new Date(input.gatePassDate),
      status: "open",
      createdBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: gp }, { status: 201 });
});
