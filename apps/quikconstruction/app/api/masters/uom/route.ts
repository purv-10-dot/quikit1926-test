import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { uomCreateSchema } from "@/lib/schemas/masters";

const withTenantAuth = withTenantAuthForModule("masters");

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const uoms = await db.cnUOM.findMany({
    where: { tenantId, deletedAt: includeDeleted ? { not: null } : null },
    orderBy: { code: "asc" },
  });
  return NextResponse.json({ success: true, data: uoms });
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const body = await req.json();
  const input = uomCreateSchema.parse(body);
  const existing = await db.cnUOM.findFirst({
    where: { tenantId, code: input.code, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: `UOM code '${input.code}' already exists` },
      { status: 409 },
    );
  }
  const uom = await db.cnUOM.create({
    data: { ...input, tenantId, createdBy: userId },
  });
  return NextResponse.json({ success: true, data: uom }, { status: 201 });
});
