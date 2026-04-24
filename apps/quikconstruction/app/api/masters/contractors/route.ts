import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { contractorCreateSchema } from "@/lib/schemas/masters";

const withTenantAuth = withTenantAuthForModule("masters");

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const contractors = await db.cnContractor.findMany({
    where: { tenantId, deletedAt: includeDeleted ? { not: null } : null },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ success: true, data: contractors });
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const body = await req.json();
  const input = contractorCreateSchema.parse(body);
  const existing = await db.cnContractor.findFirst({
    where: { tenantId, code: input.code, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: `Contractor code '${input.code}' already exists` },
      { status: 409 },
    );
  }
  const contractor = await db.cnContractor.create({
    data: { ...input, tenantId, createdBy: userId },
  });
  return NextResponse.json({ success: true, data: contractor }, { status: 201 });
});
