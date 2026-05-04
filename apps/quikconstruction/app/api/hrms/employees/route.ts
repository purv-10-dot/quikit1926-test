import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { employeeSchema } from "@/lib/schemas/hrms";

const withTenantAuth = withTenantAuthForModule("hrms");

export const GET = withTenantAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const list = await db.cnEmployee.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    include: { department: { select: { id: true, name: true, code: true } } },
    orderBy: { empCode: "asc" },
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const input = employeeSchema.parse(await req.json());
  const dup = await db.cnEmployee.findFirst({ where: { orgId, empCode: input.empCode, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Emp code '${input.empCode}' already exists` }, { status: 409 });
  const emp = await db.cnEmployee.create({
    data: {
      orgId,
      ...input,
      email: input.email || null,
      joinDate: input.joinDate ? new Date(input.joinDate) : null,
      exitDate: input.exitDate ? new Date(input.exitDate) : null,
      createdBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: emp }, { status: 201 });
});
