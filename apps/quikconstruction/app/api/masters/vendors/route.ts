import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { vendorCreateSchema } from "@/lib/schemas/masters";

const withTenantAuth = withTenantAuthForModule("masters");

// GET /api/masters/vendors
export const GET = withTenantAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const vendors = await db.cnVendor.findMany({
    where: {
      orgId,
      deletedAt: includeDeleted ? { not: null } : null,
      ...(status ? { status } : {}),
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ success: true, data: vendors });
});

// POST /api/masters/vendors
export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = vendorCreateSchema.parse(body);
  // Enforce per-tenant unique code at the app layer with a friendlier error
  const existing = await db.cnVendor.findFirst({
    where: { orgId, code: input.code, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: `Vendor code '${input.code}' already exists` },
      { status: 409 },
    );
  }
  const vendor = await db.cnVendor.create({
    data: {
      ...input,
      orgId,
      createdBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: vendor }, { status: 201 });
});
