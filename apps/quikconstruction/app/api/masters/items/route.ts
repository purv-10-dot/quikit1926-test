import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { itemCreateSchema } from "@/lib/schemas/masters";

const withTenantAuth = withTenantAuthForModule("masters");

export const GET = withTenantAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const groupId = req.nextUrl.searchParams.get("groupId") || undefined;
  const items = await db.cnItem.findMany({
    where: {
      orgId,
      deletedAt: includeDeleted ? { not: null } : null,
      ...(groupId ? { groupId } : {}),
    },
    include: {
      group: { select: { id: true, name: true } },
      uom: { select: { id: true, code: true, name: true } },
    },
    orderBy: { code: "asc" },
  });
  return NextResponse.json({ success: true, data: items });
});

export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = itemCreateSchema.parse(body);
  // Validate group + uom belong to this tenant
  const [group, uom] = await Promise.all([
    db.cnItemGroup.findFirst({ where: { id: input.groupId, orgId }, select: { id: true } }),
    db.cnUOM.findFirst({ where: { id: input.uomId, orgId }, select: { id: true } }),
  ]);
  if (!group) {
    return NextResponse.json({ success: false, error: "Item group not found" }, { status: 400 });
  }
  if (!uom) {
    return NextResponse.json({ success: false, error: "UOM not found" }, { status: 400 });
  }
  const existing = await db.cnItem.findFirst({
    where: { orgId, code: input.code, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: `Item code '${input.code}' already exists` },
      { status: 409 },
    );
  }
  const item = await db.cnItem.create({
    data: { ...input, orgId, createdBy: userId },
  });
  return NextResponse.json({ success: true, data: item }, { status: 201 });
});
