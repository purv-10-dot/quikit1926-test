import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { customerCreateSchema } from "@/lib/schemas/masters";

const withTenantAuth = withTenantAuthForModule("masters");

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const customers = await db.cnCustomer.findMany({
    where: { tenantId, deletedAt: includeDeleted ? { not: null } : null },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ success: true, data: customers });
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const body = await req.json();
  const input = customerCreateSchema.parse(body);
  const existing = await db.cnCustomer.findFirst({
    where: { tenantId, code: input.code, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: `Customer code '${input.code}' already exists` },
      { status: 409 },
    );
  }
  const customer = await db.cnCustomer.create({
    data: { ...input, tenantId, createdBy: userId },
  });
  return NextResponse.json({ success: true, data: customer }, { status: 201 });
});
