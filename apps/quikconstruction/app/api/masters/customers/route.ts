import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { customerCreateSchema } from "@/lib/schemas/masters";

const withOrgAuth = withOrgAuthForModule("masters");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const customers = await db.cnCustomer.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ success: true, data: customers });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = customerCreateSchema.parse(body);
  const existing = await db.cnCustomer.findFirst({
    where: { orgId, code: input.code, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: `Customer code '${input.code}' already exists` },
      { status: 409 },
    );
  }
  const customer = await db.cnCustomer.create({
    data: { ...input, orgId, createdBy: userId },
  });
  return NextResponse.json({ success: true, data: customer }, { status: 201 });
});
