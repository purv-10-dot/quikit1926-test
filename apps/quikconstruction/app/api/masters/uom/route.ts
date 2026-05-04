import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { uomCreateSchema } from "@/lib/schemas/masters";

const withOrgAuth = withOrgAuthForModule("masters");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const uoms = await db.cnUOM.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    orderBy: { code: "asc" },
  });
  return NextResponse.json({ success: true, data: uoms });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = uomCreateSchema.parse(body);
  const existing = await db.cnUOM.findFirst({
    where: { orgId, code: input.code, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: `UOM code '${input.code}' already exists` },
      { status: 409 },
    );
  }
  const uom = await db.cnUOM.create({
    data: { ...input, orgId, createdBy: userId },
  });
  return NextResponse.json({ success: true, data: uom }, { status: 201 });
});
