import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { companyCreateSchema } from "@/lib/schemas/masters";

const withOrgAuth = withOrgAuthForModule("masters");

// GET /api/masters/companies — list tenant's companies (active only by default)
export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const companies = await db.cnCompany.findMany({
    where: {
      orgId,
      deletedAt: includeDeleted ? { not: null } : null,
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ success: true, data: companies });
});

// POST /api/masters/companies — create
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = companyCreateSchema.parse(body);
  const company = await db.cnCompany.create({
    data: {
      ...input,
      orgId,
      createdBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: company }, { status: 201 });
});
