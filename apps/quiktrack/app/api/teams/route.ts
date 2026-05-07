import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/).optional(),
  leadUserId: z.string().min(1).optional(),
});

export const GET = withOrgAuth(async ({ orgId }) => {
  const teams = await db.qtTeam.findMany({
    where: { orgId: orgId, isDeleted: false },
    orderBy: { name: "asc" },
    include: { _count: { select: { members: true } } },
  });
  return NextResponse.json({ success: true, data: teams });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const tenantAdmin = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  const isAdmin = tenantAdmin?.role === "admin" || tenantAdmin?.role === "owner";
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const team = await db.qtTeam.create({
    data: {
      orgId: orgId,
      name: parsed.data.name,
      description: parsed.data.description,
      color: parsed.data.color,
      leadUserId: parsed.data.leadUserId,
      createdBy: userId,
      updatedBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: team }, { status: 201 });
});
