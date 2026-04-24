import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { employeeSchema } from "@/lib/schemas/hrms";

const withTenantAuth = withTenantAuthForModule("hrms");

export const GET = withTenantAuth<{ id: string }>(async ({ tenantId }, _req, { params }) => {
  const emp = await db.cnEmployee.findFirst({ where: { id: params.id, tenantId }, include: { department: true } });
  if (!emp) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: emp });
});

export const PATCH = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, req, { params }) => {
  const input = employeeSchema.partial().parse(await req.json());
  const emp = await db.cnEmployee.update({
    where: { id: params.id },
    data: {
      ...input,
      email: input.email === "" ? null : input.email,
      joinDate: input.joinDate ? new Date(input.joinDate) : input.joinDate,
      exitDate: input.exitDate ? new Date(input.exitDate) : input.exitDate,
      updatedBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: emp });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, _req, { params }) => {
  await db.cnEmployee.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
