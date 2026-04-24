import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { companyCreateSchema } from "@/lib/schemas/masters";

const withTenantAuth = withTenantAuthForModule("masters");

// GET /api/masters/companies — list tenant's companies (active only by default)
export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const companies = await db.cnCompany.findMany({
    where: {
      tenantId,
      deletedAt: includeDeleted ? { not: null } : null,
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ success: true, data: companies });
});

// POST /api/masters/companies — create
export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const body = await req.json();
  const input = companyCreateSchema.parse(body);
  const company = await db.cnCompany.create({
    data: {
      ...input,
      tenantId,
      createdBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: company }, { status: 201 });
});
