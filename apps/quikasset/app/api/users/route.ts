import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Employee");

const createSchema = z.object({
  employeeId: z.string(),
  name: z.string(),
  email: z.string(),
  contact: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  joiningDate: z.string().nullable().optional(),
  status: z.string().optional(),
});

export const GET = auth.view(async ({ orgId }) => {
  const users = await db.astEmployee.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ success: true, data: users });
});

export const POST = auth.create(async ({ orgId, userId, userEmail }, req) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const data: Prisma.AstEmployeeUncheckedCreateInput = {
    ...parsed.data,
    status: parsed.data.status as Prisma.AstEmployeeUncheckedCreateInput["status"],
    orgId,
  };
  const user = await db.astEmployee.create({ data });
  await audit({
    orgId,
    module: "Users",
    action: "User Created",
    entityId: user.id,
    entityName: `${user.name} (${user.employeeId})`,
    details: user.department ?? undefined,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: user }, { status: 201 });
});
