import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { contractorCreateSchema } from "@/lib/schemas/masters";

const withOrgAuth = withOrgAuthForModule("masters");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const contractors = await db.cnContractor.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ success: true, data: contractors });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = contractorCreateSchema.parse(body);
  const existing = await db.cnContractor.findFirst({
    where: { orgId, code: input.code, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: `Contractor code '${input.code}' already exists` },
      { status: 409 },
    );
  }
  const contractor = await db.cnContractor.create({
    data: { ...input, orgId, createdBy: userId },
  });
  return NextResponse.json({ success: true, data: contractor }, { status: 201 });
});
