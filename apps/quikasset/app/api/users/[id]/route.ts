import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Employee");

const updateSchema = z.object({
  employeeId: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  contact: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  joiningDate: z.string().nullable().optional(),
  status: z.string().optional(),
});

export const PUT = auth.update<{ id: string }>(async ({ orgId, userId, userEmail }, req, { params }) => {
  const { id } = params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const row = await db.astEmployee.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const data = parsed.data as Prisma.AstEmployeeUncheckedUpdateInput;
  const user = await db.astEmployee.update({ where: { id }, data });
  await audit({
    orgId,
    module: "Users",
    action: "User Updated",
    entityId: id,
    entityName: user.name,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: user });
});

export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId, userEmail }, _req, { params }) => {
  const { id } = params;
  const existing = await db.astEmployee.findFirst({
    where: { id, orgId },
    select: { id: true, name: true, employeeId: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await db.astEmployee.delete({ where: { id } });
  await audit({
    orgId,
    module: "Users",
    action: "User Deleted",
    entityId: id,
    entityName: `${existing.name} (${existing.employeeId})`,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: { ok: true } });
});
